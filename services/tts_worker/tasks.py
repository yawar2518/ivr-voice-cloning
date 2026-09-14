import os
import re
import json
import uuid
import time
import subprocess
import tempfile
from datetime import datetime, timezone

import boto3
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from celery import Celery
from celery.signals import worker_process_init
from decouple import config
from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, sessionmaker

# ─── Celery App ────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="redis://redis:6379/0")
app = Celery("tts_worker", broker=REDIS_URL, backend=REDIS_URL)

# ─── Config ────────────────────────────────────────────────────────────────
DATABASE_URL = config("DATABASE_URL").replace("postgres://", "postgresql://")
TTS_DEVICE = config("TTS_DEVICE", default="cuda")
TTS_REFERENCE_AUDIO = config(
    "TTS_REFERENCE_AUDIO",
    default="/app/voice_assets/reference_voice.wav"
)
FFMPEG_SAMPLE_RATE = config("FFMPEG_SAMPLE_RATE", default="8000")
FFMPEG_OUTPUT_FORMAT = config("FFMPEG_OUTPUT_FORMAT", default="wav")
FFMPEG_AUDIO_CODEC = config("FFMPEG_AUDIO_CODEC", default="pcm_s16le")

# S3 / MinIO config
S3_BUCKET = config("AWS_STORAGE_BUCKET_NAME", default="ivr-audio")
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="minioadmin")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="minioadmin")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default=None)
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="us-east-1")
BRAND_NAMES_PATH = config(
    "BRAND_NAMES_PATH",
    default="/app/config/brand_names.json"
)

# ─── Database ──────────────────────────────────────────────────────────────
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class VoicePrompt(Base):
    __tablename__ = "prompts_voiceprompt"

    id = Column(UUID(as_uuid=True), primary_key=True)
    text = Column(Text)
    text_processed = Column(Text, nullable=True)
    status = Column(String(20))
    voice_model_id = Column(UUID(as_uuid=True), nullable=True)
    audio_url = Column(Text, nullable=True)
    audio_s3_key = Column(String(500), nullable=True)
    duration_seconds = Column(String(10), nullable=True)
    celery_task_id = Column(String(255), nullable=True)
    error_detail = Column(Text, nullable=True)
    created_by_id = Column(String(50))
    approved_by_id = Column(String(50), nullable=True)
    rejected_by_id = Column(String(50), nullable=True)
    exported_by_id = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    exported_at = Column(DateTime(timezone=True), nullable=True)


# ─── Global F5-TTS model ───────────────────────────────────────────────────
_f5tts_model = None


@worker_process_init.connect
def load_model_on_startup(**kwargs):
    """
    Load F5-TTS model once when Celery worker starts.
    Stays in GPU memory for the lifetime of the worker.
    """
    global _f5tts_model
    print("Loading F5-TTS model...")
    try:
        from f5_tts.api import F5TTS
        _f5tts_model = F5TTS(device=TTS_DEVICE)
        print(f"F5-TTS model loaded on {TTS_DEVICE}")
    except Exception as e:
        print(f"Failed to load F5-TTS model: {e}")
        raise


# ─── Text Preprocessor ─────────────────────────────────────────────────────

def load_brand_names() -> dict:
    try:
        with open(BRAND_NAMES_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def preprocess_text(text: str) -> str:
    """
    Applies text preprocessing rules from API_CONTRACT.md Section 15.
    """
    import inflect
    p = inflect.engine()

    # Rule 9 — Strip HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # Rule 8 — Ellipsis to natural pause
    text = text.replace("...", ", ")

    # Rule 1 — Currency expansion
    def expand_currency(match):
        amount = match.group(1).replace(",", "")
        try:
            num = int(float(amount))
            return p.number_to_words(num) + " dollars"
        except ValueError:
            return match.group(0)
    text = re.sub(r"\$([0-9,]+(?:\.[0-9]{2})?)", expand_currency, text)

    # Rule 2 — Ordinal expansion
    ordinals = {
        "1st": "first", "2nd": "second", "3rd": "third",
        "4th": "fourth", "5th": "fifth", "6th": "sixth",
        "7th": "seventh", "8th": "eighth", "9th": "ninth", "10th": "tenth"
    }
    for k, v in ordinals.items():
        text = text.replace(k, v)

    # Rule 3 — Time formatting
    text = re.sub(r"(\d+)\s*AM", lambda m: m.group(1) + " A M", text)
    text = re.sub(r"(\d+)\s*PM", lambda m: m.group(1) + " P M", text)

    # Rule 4 — Plain number expansion
    def expand_number(match):
        try:
            num = int(match.group(0).replace(",", ""))
            return p.number_to_words(num)
        except ValueError:
            return match.group(0)
    text = re.sub(r"\b\d{1,6}(?:,\d{3})*\b", expand_number, text)

    # Rule 5 — Abbreviation expansion
    text = text.replace("Mon", "Monday").replace("Tue", "Tuesday")
    text = text.replace("Wed", "Wednesday").replace("Thu", "Thursday")
    text = text.replace("Fri", "Friday").replace("Sat", "Saturday")
    text = text.replace("Sun", "Sunday")
    text = text.replace("–", " to ").replace("-", " to ")

    # Rule 6 — Brand name overrides
    brand_names = load_brand_names()
    for brand, pronunciation in brand_names.items():
        text = text.replace(brand, pronunciation)

    # Rule 7 — Acronym letter-spacing
    def space_acronym(match):
        return " ".join(list(match.group(0)))
    text = re.sub(r"\b[A-Z]{2,5}\b", space_acronym, text)

    return text.strip()


# ─── Audio Quality Gates ────────────────────────────────────────────────────

def run_quality_gates(audio_path: str) -> None:
    data, sample_rate = sf.read(audio_path)

    duration = len(data) / sample_rate
    if not (0.5 <= duration <= 60):
        raise ValueError(
            f"Audio duration outside acceptable range: {duration:.2f}s"
        )

    meter = pyln.Meter(sample_rate)
    loudness = meter.integrated_loudness(data)
    if not (-18 <= loudness <= -10):
        raise ValueError(
            f"Audio loudness out of acceptable range: {loudness:.1f} LUFS"
        )

    peak = float(np.max(np.abs(data)))
    peak_db = 20 * np.log10(peak) if peak > 0 else -120
    if peak_db >= -0.5:
        raise ValueError(
            f"Audio clipping detected: peak at {peak_db:.1f} dBFS"
        )

    leading_samples = int(0.3 * sample_rate)
    if np.max(np.abs(data[:leading_samples])) < 0.001:
        raise ValueError("Excessive leading silence detected")

    trailing_samples = int(0.5 * sample_rate)
    if np.max(np.abs(data[-trailing_samples:])) < 0.001:
        raise ValueError("Excessive trailing silence detected")


# ─── S3 / MinIO Upload ─────────────────────────────────────────────────────

def upload_to_s3(local_path: str, s3_key: str) -> str:
    s3_client = boto3.client(
        "s3",
        endpoint_url=AWS_S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_S3_REGION_NAME,
    )
    try:
        s3_client.head_bucket(Bucket=S3_BUCKET)
    except Exception:
        s3_client.create_bucket(Bucket=S3_BUCKET)

    s3_client.upload_file(local_path, S3_BUCKET, s3_key)
    url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=3600,
    )
    return url


# ─── Main Celery Task ───────────────────────────────────────────────────────

@app.task(name="tts_worker.tasks.generate_tts", bind=True, max_retries=0)
def generate_tts(self, prompt_id: str, text: str, voice_model_id: str):
    """
    Main TTS generation task using F5-TTS.
    Supports English and Urdu (romanized).
    """
    db = SessionLocal()

    def set_failed(error_message: str):
        try:
            prompt = db.query(VoicePrompt).filter(
                VoicePrompt.id == uuid.UUID(prompt_id)
            ).first()
            if prompt:
                prompt.status = "failed"
                prompt.error_detail = error_message
                prompt.updated_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as e:
            print(f"Failed to update status to failed: {e}")
        finally:
            db.close()

    try:
        # ── Step 1: Preprocess text ────────────────────────────────────────
        print(f"[{prompt_id}] Preprocessing text...")
        processed_text = preprocess_text(text)

        if len(processed_text) > 2000:
            raise ValueError(
                "Preprocessed text exceeds the 2000-character limit."
            )

        prompt = db.query(VoicePrompt).filter(
            VoicePrompt.id == uuid.UUID(prompt_id)
        ).first()
        if not prompt:
            raise ValueError(f"VoicePrompt {prompt_id} not found.")

        prompt.text_processed = processed_text
        db.commit()

        # ── Step 2: Generate audio with F5-TTS ────────────────────────────
        print(f"[{prompt_id}] Generating audio with F5-TTS...")
        if _f5tts_model is None:
            raise RuntimeError("F5-TTS model not loaded.")

        with tempfile.TemporaryDirectory() as tmpdir:
            raw_path = os.path.join(tmpdir, "raw.wav")

            # F5-TTS infer method — zero-shot voice cloning
            # ref_file: your reference voice recording
            # ref_text: leave empty — F5-TTS will transcribe it automatically
            # gen_text: the text to generate
            wav, sr, _ = _f5tts_model.infer(
                ref_file=TTS_REFERENCE_AUDIO,
                ref_text="",
                gen_text=processed_text,
                file_wave=raw_path,
                seed=-1,
            )

            # ── Step 3: Post-process with FFmpeg ──────────────────────────
            print(f"[{prompt_id}] Post-processing with FFmpeg...")
            playback_path = os.path.join(tmpdir, "playback.wav")
            subprocess.run([
                "ffmpeg", "-y",
                "-i", raw_path,
                "-ar", "44100",
                "-ac", "1",
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
                playback_path
            ], check=True, capture_output=True)

            # ── Step 4: Quality gates ──────────────────────────────────────
            print(f"[{prompt_id}] Running quality gates...")
            run_quality_gates(playback_path)

            data, sr_out = sf.read(playback_path)
            duration = len(data) / sr_out

            # ── Step 5: Upload to MinIO/S3 ────────────────────────────────
            print(f"[{prompt_id}] Uploading to storage...")
            timestamp = int(time.time())
            s3_key = f"voices/v1.0/{prompt_id}/{timestamp}.wav"
            audio_url = upload_to_s3(playback_path, s3_key)

            # ── Step 6: Update VoicePrompt to ready ───────────────────────
            print(f"[{prompt_id}] Done. Duration: {duration:.2f}s")
            prompt.status = "ready"
            prompt.audio_url = audio_url
            prompt.audio_s3_key = s3_key
            prompt.duration_seconds = str(round(duration, 2))
            prompt.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.close()

    except ValueError as e:
        print(f"[{prompt_id}] Quality gate failed: {e}")
        set_failed(str(e))

    except subprocess.CalledProcessError as e:
        error_msg = f"FFmpeg failed: {e.stderr.decode() if e.stderr else str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)