import os
import io
import re
import json
import uuid
import time
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

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
TTS_REFERENCE_AUDIO = config("TTS_REFERENCE_AUDIO", default="/app/voice_assets/reference_voice.wav")
FFMPEG_SAMPLE_RATE = config("FFMPEG_SAMPLE_RATE", default="8000")
FFMPEG_OUTPUT_FORMAT = config("FFMPEG_OUTPUT_FORMAT", default="wav")
FFMPEG_AUDIO_CODEC = config("FFMPEG_AUDIO_CODEC", default="pcm_s16le")

# S3 / MinIO config
S3_BUCKET = config("AWS_STORAGE_BUCKET_NAME", default="ivr-audio")
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="minioadmin")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="minioadmin")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default=None)
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="us-east-1")

# Brand names override file
BRAND_NAMES_PATH = config(
    "BRAND_NAMES_PATH",
    default="/app/config/brand_names.json"
)

# ─── Database ──────────────────────────────────────────────────────────────
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class VoicePrompt(Base):
    """Maps to Django's prompts_voiceprompt table."""
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


# ─── Global model variable ─────────────────────────────────────────────────
# The Chatterbox model is loaded ONCE when the worker process starts.
# Loading it on every task would take 10-30 seconds per request.
# This is the correct pattern for ML models in Celery workers.
_chatterbox_model = None


@worker_process_init.connect
def load_model_on_startup(**kwargs):
    """
    Load the Chatterbox model when the Celery worker process starts.
    This runs once — not on every task.
    The model stays in GPU memory for the lifetime of the worker.
    """
    global _chatterbox_model
    print("Loading Chatterbox model...")
    try:
        from chatterbox.tts import ChatterboxTTS
        _chatterbox_model = ChatterboxTTS.from_pretrained(device=TTS_DEVICE)
        print(f"Chatterbox model loaded on {TTS_DEVICE}")
    except Exception as e:
        print(f"Failed to load Chatterbox model: {e}")
        raise


# ─── Text Preprocessor ─────────────────────────────────────────────────────

def load_brand_names() -> dict:
    """Load brand name overrides from config file."""
    try:
        with open(BRAND_NAMES_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def preprocess_text(text: str) -> str:
    """
    Applies text preprocessing rules from API_CONTRACT.md Section 15.
    Converts numbers, abbreviations, brand names etc. for natural TTS output.
    Rules are applied in the priority order defined in the contract.
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
    ordinals = {"1st": "first", "2nd": "second", "3rd": "third",
                "4th": "fourth", "5th": "fifth", "6th": "sixth",
                "7th": "seventh", "8th": "eighth", "9th": "ninth",
                "10th": "tenth"}
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
    """
    Runs audio quality checks per API_CONTRACT.md Section 13.
    Raises ValueError with a human-readable message on failure.
    That message is saved to VoicePrompt.error_detail.
    """
    data, sample_rate = sf.read(audio_path)

    # Check duration
    duration = len(data) / sample_rate
    if not (0.5 <= duration <= 60):
        raise ValueError(f"Audio duration outside acceptable range: {duration:.2f}s")

    # Check loudness (EBU R128)
    meter = pyln.Meter(sample_rate)
    loudness = meter.integrated_loudness(data)
    if not (-18 <= loudness <= -10):
        raise ValueError(f"Audio loudness out of acceptable range: {loudness:.1f} LUFS")

    # Check peak clipping
    peak = float(np.max(np.abs(data)))
    peak_db = 20 * np.log10(peak) if peak > 0 else -120
    if peak_db >= -0.5:
        raise ValueError(f"Audio clipping detected: peak at {peak_db:.1f} dBFS")

    # Check leading silence (first 300ms)
    leading_samples = int(0.3 * sample_rate)
    leading_audio = data[:leading_samples]
    if np.max(np.abs(leading_audio)) < 0.001:
        raise ValueError("Excessive leading silence detected")

    # Check trailing silence (last 500ms)
    trailing_samples = int(0.5 * sample_rate)
    trailing_audio = data[-trailing_samples:]
    if np.max(np.abs(trailing_audio)) < 0.001:
        raise ValueError("Excessive trailing silence detected")


# ─── S3 / MinIO Upload ─────────────────────────────────────────────────────

def upload_to_s3(local_path: str, s3_key: str) -> str:
    """
    Uploads a file to MinIO (dev) or AWS S3 (prod).
    Returns a pre-signed URL valid for 1 hour per contract Section 13.
    """
    s3_client = boto3.client(
        "s3",
        endpoint_url=AWS_S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_S3_REGION_NAME,
    )

    # Create bucket if it doesn't exist (MinIO dev only)
    try:
        s3_client.head_bucket(Bucket=S3_BUCKET)
    except Exception:
        s3_client.create_bucket(Bucket=S3_BUCKET)

    # Upload the file
    s3_client.upload_file(local_path, S3_BUCKET, s3_key)

    # Generate pre-signed URL valid for 1 hour
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
    Main TTS generation task.

    Steps:
    1. Preprocess text
    2. Generate audio with Chatterbox
    3. Post-process with FFmpeg
    4. Run quality gates
    5. Upload to MinIO/S3
    6. Update VoicePrompt status to ready or failed

    Args:
        prompt_id: UUID of the VoicePrompt record
        text: Raw text to convert to speech
        voice_model_id: UUID of the VoiceModelVersion to use
    """
    db = SessionLocal()

    def set_failed(error_message: str):
        """Helper to mark prompt as failed with error detail."""
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
            print(f"Failed to update prompt status to failed: {e}")
        finally:
            db.close()

    try:
        # ── Step 1: Preprocess text ────────────────────────────────────────
        print(f"[{prompt_id}] Preprocessing text...")
        processed_text = preprocess_text(text)

        # Check processed text length limit per contract Section 15
        if len(processed_text) > 2000:
            raise ValueError(
                "Preprocessed text exceeds the 2000-character limit after expansion."
            )

        # Save processed text to database
        prompt = db.query(VoicePrompt).filter(
            VoicePrompt.id == uuid.UUID(prompt_id)
        ).first()
        if not prompt:
            raise ValueError(f"VoicePrompt {prompt_id} not found in database.")

        prompt.text_processed = processed_text
        db.commit()

        # ── Step 2: Generate audio with Chatterbox ─────────────────────────
        print(f"[{prompt_id}] Generating audio with Chatterbox...")
        if _chatterbox_model is None:
            raise RuntimeError("Chatterbox model not loaded. Worker may not have started correctly.")

        # Generate audio using zero-shot voice cloning
        # reference_audio provides the voice identity
        wav_tensor = _chatterbox_model.generate(
            processed_text,
            audio_prompt_path=TTS_REFERENCE_AUDIO,
        )

        # ── Step 3: Post-process with FFmpeg ───────────────────────────────
        print(f"[{prompt_id}] Post-processing audio with FFmpeg...")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save raw Chatterbox output
            raw_path = os.path.join(tmpdir, "raw.wav")
            import torchaudio
            torchaudio.save(
                raw_path,
                wav_tensor,
                _chatterbox_model.sr
            )

            # FFmpeg: normalize to -14 LUFS, convert to 44.1kHz mono WAV
            playback_path = os.path.join(tmpdir, "playback.wav")
            subprocess.run([
                "ffmpeg", "-y",
                "-i", raw_path,
                "-ar", "44100",           # 44.1kHz sample rate
                "-ac", "1",               # mono
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",  # EBU R128 normalization
                playback_path
            ], check=True, capture_output=True)

            # ── Step 4: Run quality gates ──────────────────────────────────
            print(f"[{prompt_id}] Running quality gates...")
            run_quality_gates(playback_path)

            # Get audio duration
            data, sr = sf.read(playback_path)
            duration = len(data) / sr

            # ── Step 5: Upload to MinIO/S3 ────────────────────────────────
            print(f"[{prompt_id}] Uploading to storage...")
            timestamp = int(time.time())
            s3_key = f"voices/v1.0/{prompt_id}/{timestamp}.wav"
            audio_url = upload_to_s3(playback_path, s3_key)

            # ── Step 6: Update VoicePrompt to ready ───────────────────────
            print(f"[{prompt_id}] Generation complete. Updating status to ready.")
            prompt.status = "ready"
            prompt.audio_url = audio_url
            prompt.audio_s3_key = s3_key
            prompt.duration_seconds = str(round(duration, 2))
            prompt.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.close()

            print(f"[{prompt_id}] Done. Duration: {duration:.2f}s")

    except ValueError as e:
        # Known validation or quality gate failure
        print(f"[{prompt_id}] Quality gate failed: {e}")
        set_failed(str(e))

    except subprocess.CalledProcessError as e:
        # FFmpeg failed
        error_msg = f"FFmpeg processing failed: {e.stderr.decode() if e.stderr else str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)

    except Exception as e:
        # Unexpected failure
        error_msg = f"Unexpected error during generation: {str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)