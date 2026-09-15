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

# ─── torchaudio backend shim ───────────────────────────────────────────────
# torchaudio 2.9 routes `load` through torchcodec, and torchcodec 0.3.0+cu128
# cannot load in this image: libtorchcodec_decoder4 was built against a
# different libtorch ABI, and decoders 5/6/7 need libavutil 57/58/59 while
# Ubuntu 22.04 ships FFmpeg 4.4 (libavutil 56). f5_tts calls torchaudio.load in
# exactly one place, so back it with soundfile instead.
#
# Installed at import time so the module behaves identically under Celery and
# when imported directly from a shell.

def _install_torchaudio_soundfile_shim():
    import torch
    import torchaudio

    def _load(filepath, frame_offset=0, num_frames=-1, normalize=True,
              channels_first=True, format=None, buffer_size=4096):
        with sf.SoundFile(str(filepath)) as handle:
            if frame_offset:
                handle.seek(int(frame_offset))
            frames = -1 if num_frames in (-1, None) else int(num_frames)
            data = handle.read(frames=frames, dtype="float32", always_2d=True)
            sample_rate = handle.samplerate
        tensor = torch.from_numpy(np.ascontiguousarray(data))  # (frames, chans)
        if channels_first:
            tensor = tensor.transpose(0, 1).contiguous()
        return tensor, sample_rate

    torchaudio.load = _load


_install_torchaudio_soundfile_shim()

# ─── Celery App ────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="redis://redis:6379/0")
app = Celery("tts_worker", broker=REDIS_URL, backend=REDIS_URL)

# ─── Config ────────────────────────────────────────────────────────────────
DATABASE_URL = config("DATABASE_URL").replace("postgres://", "postgresql://")
TTS_DEVICE = config("TTS_DEVICE", default="cuda")
FFMPEG_SAMPLE_RATE = config("FFMPEG_SAMPLE_RATE", default="8000")
FFMPEG_OUTPUT_FORMAT = config("FFMPEG_OUTPUT_FORMAT", default="wav")
FFMPEG_AUDIO_CODEC = config("FFMPEG_AUDIO_CODEC", default="pcm_s16le")

# Playback master that gets uploaded. The telephony-grade FFMPEG_SAMPLE_RATE
# above describes the downstream IVR export, not this file.
PLAYBACK_SAMPLE_RATE = config("TTS_PLAYBACK_SAMPLE_RATE", default="44100")

S3_BUCKET = config("AWS_STORAGE_BUCKET_NAME", default="ivr-audio")
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="minioadmin")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="minioadmin")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default=None)
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="us-east-1")
BRAND_NAMES_PATH = config(
    "BRAND_NAMES_PATH",
    default="/app/config/brand_names.json"
)

# ─── Reference voice conditioning ──────────────────────────────────────────
# F5-TTS is zero-shot: any reference clip works as-is. Passing ref_text=""
# tells it to transcribe the clip itself (Whisper, downloaded on first run)
# instead of relying on a hand-typed transcript that has to match the audio
# word-for-word.

# Plausible speaking rates in bytes of Latin-script text per second. Used to
# gate generated audio for truncation/silence — unhurried IVR delivery sits
# around 15-20.
SPEECH_RATE_MIN = 9.0
SPEECH_RATE_MAX = 30.0

TTS_SEED = config("TTS_SEED", default="1234", cast=int)
TTS_NFE_STEP = config("TTS_NFE_STEP", default="32", cast=int)
TTS_CFG_STRENGTH = config("TTS_CFG_STRENGTH", default="2.0", cast=float)
TTS_SPEED = config("TTS_SPEED", default="1.0", cast=float)

TARGET_LUFS = config("TTS_TARGET_LUFS", default="-16.0", cast=float)
TARGET_TRUE_PEAK = config("TTS_TARGET_TRUE_PEAK", default="-1.5", cast=float)

# ─── Trailing cutoff ───────────────────────────────────────────────────────
# F5-TTS allocates exactly the frames its duration estimate asks for and stops,
# so the release of the final phoneme can land on the last sample and be cut —
# "us" ends up sounding like "uh". Two separate mitigations:
#
#   TTS_GEN_TEXT_TAIL    appended to the text the model is asked to speak.
#                        Allocation is proportional to gen_text length, so
#                        these extra bytes buy frames for the last word to
#                        finish in. This is the one that fixes the cutoff.
#                        " ." reads as a pause, not a spoken word, and at the
#                        reference's speaking rate buys roughly 0.1s.
#
#   TTS_TAIL_PAD_SECONDS digital silence appended after generation. This
#                        cannot recover an already-clipped phoneme — it is
#                        there so the file never ends on a loud sample, which
#                        clicks on playback and sounds abrupt in an IVR menu.
GEN_TEXT_TAIL = config("TTS_GEN_TEXT_TAIL", default=" .")
TAIL_PAD_SECONDS = config("TTS_TAIL_PAD_SECONDS", default="0.5", cast=float)

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
    export_s3_key = Column(String(500), nullable=True)
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


class VoiceModelVersion(Base):
    __tablename__ = "prompts_voicemodelversion"

    id = Column(UUID(as_uuid=True), primary_key=True)
    reference_audio = Column(String(500), nullable=True)
    reference_text = Column(Text, nullable=True)
    audio_s3_key = Column(String(500), nullable=True)


# ─── Globals populated once per worker process ─────────────────────────────
_f5tts_model = None

# Per-voice-model reference clips, prepared lazily and cached for the life of
# the worker process — each voice model owns its own S3-hosted reference clip,
# so generation for one voice never touches another's conditioning audio. This
# replaces the single hardcoded TTS_REFERENCE_AUDIO env var every generation
# used to share.
_voice_reference_cache = {}


def prepare_voice_reference(voice_model_id: str) -> tuple:
    """Resolve, download, and convert a voice model's reference clip.

    Returns (local_wav_path, reference_text). Cached per voice_model_id for
    the life of the worker process.
    """
    if voice_model_id in _voice_reference_cache:
        return _voice_reference_cache[voice_model_id]

    db = SessionLocal()
    try:
        voice_model = db.query(VoiceModelVersion).filter(
            VoiceModelVersion.id == uuid.UUID(voice_model_id)
        ).first()
    finally:
        db.close()

    if not voice_model:
        raise ValueError(f"VoiceModelVersion {voice_model_id} not found.")
    if not voice_model.audio_s3_key:
        raise ValueError(
            f"VoiceModelVersion {voice_model_id} has no reference audio uploaded."
        )

    cache_dir = os.path.join(tempfile.gettempdir(), "tts_reference", voice_model_id)
    os.makedirs(cache_dir, exist_ok=True)
    downloaded_path = os.path.join(cache_dir, "source.wav")
    clip_path = os.path.join(cache_dir, "reference_clip.wav")

    s3_client = boto3.client(
        "s3",
        endpoint_url=AWS_S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_S3_REGION_NAME,
    )
    s3_client.download_file(S3_BUCKET, voice_model.audio_s3_key, downloaded_path)

    # F5-TTS expects a 24kHz mono clip regardless of the 44.1kHz master stored
    # in S3, and is zero-shot — no clipping needed, it handles any reference
    # length itself.
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-i", downloaded_path,
        "-ar", "24000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        clip_path,
    ], check=True, capture_output=True)

    print(f"[{voice_model_id}] Reference ready: {clip_path} "
          f"(from {voice_model.audio_s3_key})")

    result = (clip_path, voice_model.reference_text or "")
    _voice_reference_cache[voice_model_id] = result
    return result


@worker_process_init.connect
def load_model_on_startup(**kwargs):
    global _f5tts_model
    print("Loading F5-TTS model...")
    try:
        from f5_tts.api import F5TTS
        _f5tts_model = F5TTS(device=TTS_DEVICE)
        print(f"F5-TTS model loaded on {TTS_DEVICE}")
    except Exception as e:
        print(f"Failed to initialise F5-TTS: {e}")
        raise


# ─── Text Preprocessor ─────────────────────────────────────────────────────

def load_brand_names() -> dict:
    try:
        with open(BRAND_NAMES_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


DAY_ABBREVIATIONS = {
    "Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday",
    "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday",
}


def preprocess_text(text: str) -> str:
    import inflect
    p = inflect.engine()

    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("...", ", ")

    def expand_currency(match):
        amount = match.group(1).replace(",", "")
        try:
            num = int(float(amount))
            return p.number_to_words(num) + " dollars"
        except ValueError:
            return match.group(0)
    text = re.sub(r"\$([0-9,]+(?:\.[0-9]{2})?)", expand_currency, text)

    ordinals = {
        "1st": "first", "2nd": "second", "3rd": "third",
        "4th": "fourth", "5th": "fifth", "6th": "sixth",
        "7th": "seventh", "8th": "eighth", "9th": "ninth", "10th": "tenth"
    }
    for k, v in ordinals.items():
        text = text.replace(k, v)

    # Word-boundary anchored: a bare replace here turns "Monday" into
    # "Mondayday" and "Sunday" into "Sundayday".
    for abbrev, full in DAY_ABBREVIATIONS.items():
        # An abbreviation dot mid-sentence ("Mon. to Fri.") is part of the
        # abbreviation; the one ending "...open on Sun." ends the sentence and
        # has to survive, or F5-TTS loses the phrase boundary.
        text = re.sub(rf"\b{abbrev}\.(?=\s*[-–—,]|\s+[a-z])", full, text)
        text = re.sub(rf"\b{abbrev}\b", full, text)

    # Ranges are resolved while the digits are still digits, and only a dash
    # that actually joins a range becomes " to " — replacing every dash turns
    # "e-mail" into "e to mail" and "opt-out" into "opt to out".
    days = "|".join(DAY_ABBREVIATIONS.values())
    text = re.sub(rf"\b({days})\s*[-–—]\s*({days})\b", r"\1 to \2", text)
    text = re.sub(r"(?<=\d)\s*[-–—]\s*(?=\d)", " to ", text)
    # A dash still standing between spaces is punctuation, not a range, and a
    # comma gives F5-TTS the pause it represents. Dashes inside words stay put.
    text = re.sub(r"\s+[-–—]\s+", ", ", text)

    text = re.sub(r"(\d+)\s*AM", lambda m: m.group(1) + " A M", text)
    text = re.sub(r"(\d+)\s*PM", lambda m: m.group(1) + " P M", text)

    def expand_number(match):
        try:
            num = int(match.group(0).replace(",", ""))
            return p.number_to_words(num)
        except ValueError:
            return match.group(0)
    text = re.sub(r"\b\d{1,6}(?:,\d{3})*\b", expand_number, text)

    brand_names = load_brand_names()
    for brand, pronunciation in brand_names.items():
        text = text.replace(brand, pronunciation)

    def space_acronym(match):
        return " ".join(list(match.group(0)))
    text = re.sub(r"\b[A-Z]{2,5}\b", space_acronym, text)

    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ─── Audio Quality Gates ────────────────────────────────────────────────────

def check_raw_generation(audio_path: str, gen_text: str) -> float:
    """Gate the model output *before* normalisation.

    This is the check that was missing. Normalisation lifts whatever it is
    handed up to the target LUFS, so a near-silent or truncated take comes out
    of post-processing measuring perfectly normal — the failure is only visible
    upstream of it.

    The test is the speaking rate of the result against an absolute band,
    deliberately not against the reference's own rate: a mislabelled reference
    is self-consistent, so F5-TTS hits the duration it predicted and a
    reference-relative check waves the truncated audio straight through.
    """
    data, sample_rate = sf.read(audio_path)
    duration = len(data) / sample_rate
    peak = float(np.max(np.abs(data))) if len(data) else 0.0
    gen_bytes = len(gen_text.encode("utf-8"))

    if duration < 0.4:
        raise ValueError(
            f"F5-TTS returned {duration:.2f}s of audio for {gen_bytes} bytes "
            f"of text."
        )

    if peak < 0.01:
        raise ValueError(
            f"F5-TTS output is silent (peak {peak:.5f}); the reference "
            f"conditioning or the vocoder failed."
        )

    rate = gen_bytes / duration
    low = SPEECH_RATE_MIN * TTS_SPEED
    high = SPEECH_RATE_MAX * TTS_SPEED

    if rate > high:
        raise ValueError(
            f"Generated audio is {duration:.2f}s for {gen_bytes} bytes of "
            f"text — {rate:.1f} bytes/sec, far faster than speech. F5-TTS "
            f"under-allocated frames and the utterance is truncated."
        )
    if rate < low:
        raise ValueError(
            f"Generated audio is {duration:.2f}s for {gen_bytes} bytes of "
            f"text — {rate:.1f} bytes/sec, far slower than speech. The model "
            f"is padding with silence or noise."
        )

    return duration


def run_quality_gates(audio_path: str) -> float:
    """Gate the normalised, uploadable file."""
    data, sample_rate = sf.read(audio_path)

    duration = len(data) / sample_rate
    if not (0.5 <= duration <= 60):
        raise ValueError(
            f"Audio duration outside acceptable range: {duration:.2f}s"
        )

    meter = pyln.Meter(sample_rate)
    loudness = meter.integrated_loudness(data)
    if not (-40 <= loudness <= -5):
        raise ValueError(
            f"Audio loudness out of acceptable range: {loudness:.1f} LUFS"
        )

    peak = float(np.max(np.abs(data)))
    peak_db = 20 * np.log10(peak) if peak > 0 else -120
    if peak_db >= -0.5:
        raise ValueError(
            f"Audio clipping detected: peak at {peak_db:.1f} dBFS"
        )

    return duration


# ─── Audio generation ───────────────────────────────────────────────────────

def synthesize(gen_text: str, out_path: str,
               reference_path: str, ref_text: str = "") -> float:
    """Run F5-TTS against the given reference and gate the raw result."""
    if _f5tts_model is None:
        raise RuntimeError("F5-TTS model not loaded.")

    # Buys the last word room to finish; see TTS_GEN_TEXT_TAIL above.
    spoken_text = gen_text + GEN_TEXT_TAIL

    # An empty ref_text tells F5-TTS to transcribe the reference itself.
    _f5tts_model.infer(
        ref_file=reference_path,
        ref_text=ref_text,
        gen_text=spoken_text,
        file_wave=out_path,
        seed=TTS_SEED,
        nfe_step=TTS_NFE_STEP,
        cfg_strength=TTS_CFG_STRENGTH,
        speed=TTS_SPEED,
    )
    # Gate against the text actually synthesised, so the tail does not read as
    # the model padding with silence.
    return check_raw_generation(out_path, spoken_text)


def normalize_audio(raw_path: str, out_path: str) -> None:
    """Normalise to TARGET_LUFS with a single measured gain.

    ffmpeg's loudnorm is not usable here: on a mono stream it reports the
    correct input loudness and then moves the signal the wrong way — a -20.4
    LUFS prompt comes out at -30.5 LUFS, quieter than it went in, which is a
    large part of why generated prompts sounded inaudible. Two-pass linear mode
    does not help; it is the same filter.

    pyloudnorm already backs the quality gate, so measuring with it means the
    normaliser and the gate agree by construction. The gain is capped so the
    sample peak cannot pass TARGET_TRUE_PEAK, which keeps this a pure gain
    change with no dynamics processing.

    TTS_TAIL_PAD_SECONDS of silence is appended in the same pass. Loudness is
    measured on the unpadded audio first, so the padding cannot drag the
    measurement down and make the result quieter than it should be.
    """
    data, sample_rate = sf.read(raw_path)
    peak = float(np.max(np.abs(data))) if len(data) else 0.0
    if peak <= 0:
        raise ValueError("Cannot normalise silent audio.")
    peak_db = 20 * np.log10(peak)

    headroom = TARGET_TRUE_PEAK - peak_db
    loudness = pyln.Meter(sample_rate).integrated_loudness(data)
    if np.isfinite(loudness):
        gain_db = min(TARGET_LUFS - loudness, headroom)
    else:
        # Too short for an R128 gate; fall back to peak normalisation.
        gain_db = headroom

    filters = [f"volume={gain_db:.2f}dB"]
    if TAIL_PAD_SECONDS > 0:
        filters.append(f"apad=pad_dur={TAIL_PAD_SECONDS}")

    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-i", raw_path,
        "-af", ",".join(filters),
        "-ar", PLAYBACK_SAMPLE_RATE,
        "-ac", "1",
        "-c:a", FFMPEG_AUDIO_CODEC,
        out_path,
    ], check=True, capture_output=True)


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
            db.rollback()
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

    try:
        # ── Step 1: Preprocess text ────────────────────────────────────────
        print(f"[{prompt_id}] Preprocessing text...")
        processed_text = preprocess_text(text)

        if not processed_text:
            raise ValueError("Text is empty after preprocessing.")
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

        # ── Step 2: Resolve this voice model's own reference clip ─────────
        print(f"[{prompt_id}] Preparing reference audio for voice {voice_model_id}...")
        reference_path, reference_text = prepare_voice_reference(voice_model_id)

        with tempfile.TemporaryDirectory() as tmpdir:
            raw_path = os.path.join(tmpdir, "raw.wav")
            playback_path = os.path.join(tmpdir, "playback.wav")

            # ── Step 3: Generate audio with F5-TTS ────────────────────────
            print(f"[{prompt_id}] Generating audio with F5-TTS...")
            raw_duration = synthesize(
                processed_text, raw_path, reference_path, reference_text
            )
            print(f"[{prompt_id}] Raw audio: {raw_duration:.2f}s")

            # ── Step 4: Normalise ──────────────────────────────────────────
            print(f"[{prompt_id}] Normalising with FFmpeg...")
            normalize_audio(raw_path, playback_path)

            # ── Step 5: Quality gates ──────────────────────────────────────
            print(f"[{prompt_id}] Running quality gates...")
            duration = run_quality_gates(playback_path)

            # ── Step 6: Upload to MinIO/S3 ────────────────────────────────
            print(f"[{prompt_id}] Uploading to storage...")
            timestamp = int(time.time())
            s3_key = f"voices/v1.0/{prompt_id}/{timestamp}.wav"
            audio_url = upload_to_s3(playback_path, s3_key)

            # ── Step 7: Update VoicePrompt to ready ───────────────────────
            print(f"[{prompt_id}] Done. Duration: {duration:.2f}s")
            prompt.status = "ready"
            prompt.audio_url = audio_url
            prompt.audio_s3_key = s3_key
            prompt.duration_seconds = str(round(duration, 2))
            prompt.updated_at = datetime.now(timezone.utc)
            db.commit()

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

    finally:
        db.close()


@app.task(name="tts_worker.tasks.export_prompt", bind=True, max_retries=0)
def export_prompt(self, prompt_id: str, audio_s3_key: str):
    """
    Export task — converts approved audio to IVR format (8kHz WAV).
    Runs in the worker where FFmpeg is available.
    Updates VoicePrompt status to live when done.
    """
    db = SessionLocal()

    def set_failed(error_message: str):
        try:
            prompt = db.query(VoicePrompt).filter(
                VoicePrompt.id == uuid.UUID(prompt_id)
            ).first()
            if prompt:
                prompt.status = "approved"  # revert to approved on failure
                prompt.error_detail = error_message
                prompt.updated_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as e:
            print(f"Failed to revert status: {e}")
        finally:
            db.close()

    try:
        print(f"[{prompt_id}] Starting export to IVR format...")

        s3_client = boto3.client(
            "s3",
            endpoint_url=AWS_S3_ENDPOINT_URL,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_S3_REGION_NAME,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            original_path = os.path.join(tmpdir, "original.wav")
            export_path = os.path.join(tmpdir, "export_8khz_pcm.wav")

            # Download original playback quality audio
            s3_client.download_file(S3_BUCKET, audio_s3_key, original_path)

            # Convert to IVR format — 8kHz mono PCM 16-bit
            subprocess.run([
                "ffmpeg", "-y",
                "-i", original_path,
                "-ar", FFMPEG_SAMPLE_RATE,
                "-ac", "1",
                "-c:a", FFMPEG_AUDIO_CODEC,
                export_path
            ], check=True, capture_output=True)

            # Upload IVR format file to S3
            export_s3_key = f"exports/v1.0/{prompt_id}/export_8khz_pcm.wav"
            s3_client.upload_file(
                export_path,
                S3_BUCKET,
                export_s3_key,
                ExtraArgs={"ContentType": "audio/wav"},
            )

        # Update prompt to live
        prompt = db.query(VoicePrompt).filter(
            VoicePrompt.id == uuid.UUID(prompt_id)
        ).first()
        if prompt:
            prompt.status = "live"
            prompt.updated_at = datetime.now(timezone.utc)
            # Record the export under its own key. It used to be written over
            # audio_s3_key/audio_url, which destroyed the only reference to the
            # playback-quality master and left the in-app player serving the
            # 8 kHz telephony file. No URL is stored: a pre-signed URL expires
            # in an hour, so Django signs one per request instead.
            prompt.export_s3_key = export_s3_key
            db.commit()

        print(f"[{prompt_id}] Export complete.")
        db.close()
        return export_s3_key

    except subprocess.CalledProcessError as e:
        error_msg = f"FFmpeg export failed: {e.stderr.decode() if e.stderr else str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)

    except Exception as e:
        error_msg = f"Export error: {str(e)}"
        print(f"[{prompt_id}] {error_msg}")
        set_failed(error_msg)