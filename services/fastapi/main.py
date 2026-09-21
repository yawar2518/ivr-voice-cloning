import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import jwt
from celery import Celery
from decouple import config
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ─── App Setup ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="VoiceClone — Generation API",
    description="Async text-to-speech generation. Creates a generation record, "
                "charges credits and queues the TTS job.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config("CORS_ALLOWED_ORIGINS", default="http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Config ────────────────────────────────────────────────────────────────
SECRET_KEY = config("SECRET_KEY")
DATABASE_URL = config("DATABASE_URL").replace("postgres://", "postgresql://")
REDIS_URL = config("REDIS_URL")
DJANGO_INTERNAL_URL = config("DJANGO_INTERNAL_URL", default="http://web:8000").rstrip("/")
INTERNAL_API_TOKEN = config("INTERNAL_API_TOKEN", default=f"internal-{SECRET_KEY}")
MAX_TEXT_LENGTH = config("MAX_GENERATION_CHARS", default=5000, cast=int)

# Mirrors tts_worker.tasks.strip_emotion_tags: bracketed tags are never spoken
# by the current model, so they are not billed either.
import re  # noqa: E402

EMOTION_TAG_RE = re.compile(r"\[[^\[\]\n]{1,40}\]")


def billable_length(text: str) -> int:
    return len(EMOTION_TAG_RE.sub(" ", text).strip())

# Mirrors apps.users.models.TIER_CREDIT_LIMITS — used only for the cheap
# pre-check; Django's deduct endpoint is the authority and re-validates.
TIER_CREDIT_LIMITS = {"free": 5000, "pro": 100000, "scale": 500000}

# ─── Database ──────────────────────────────────────────────────────────────
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── SQLAlchemy Models ─────────────────────────────────────────────────────
# Django owns the schema; these map only the columns this service touches.

class VoicePrompt(Base):
    """Maps to Django's prompts_voiceprompt table (a generation)."""
    __tablename__ = "prompts_voiceprompt"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    text = Column(Text, nullable=False)
    text_processed = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    voice_model_id = Column(UUID(as_uuid=True), nullable=True)
    audio_url = Column(Text, nullable=True)
    audio_s3_key = Column(String(500), nullable=True)
    mp3_s3_key = Column(String(500), nullable=True)
    credits_charged = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(String(10), nullable=True)
    celery_task_id = Column(String(255), nullable=True)
    error_detail = Column(Text, nullable=True)
    created_by_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VoiceModelVersion(Base):
    __tablename__ = "prompts_voicemodelversion"

    id = Column(UUID(as_uuid=True), primary_key=True)
    display_name = Column(String(100))
    status = Column(String(20))
    is_default = Column(Boolean, default=False)
    created_by_id = Column(Integer, nullable=True)


class User(Base):
    __tablename__ = "users_user"

    id = Column(Integer, primary_key=True)
    username = Column(String(150))
    tier = Column(String(20))
    credits_used = Column(Integer)
    is_active = Column(Boolean)


# ─── Celery Client ─────────────────────────────────────────────────────────
celery_app = Celery("ivr_voice", broker=REDIS_URL, backend=REDIS_URL)


# ─── Auth ──────────────────────────────────────────────────────────────────
security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify the JWT with the same SECRET_KEY as Django; return the payload."""
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_invalid", "detail": "Token is invalid or expired."},
        )


# ─── Schemas ───────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    voice_model_id: uuid.UUID


class GenerateResponse(BaseModel):
    job_id: str
    prompt_id: str
    status: str
    created_at: str
    credits_charged: int
    credits_remaining: int


class StatusResponse(BaseModel):
    job_id: str
    prompt_id: str
    status: str
    audio_url: Optional[str]
    duration_seconds: Optional[float]
    credits_charged: int
    error: Optional[str]


# ─── Helpers ───────────────────────────────────────────────────────────────

def _credits_remaining(user: User) -> int:
    limit = TIER_CREDIT_LIMITS.get(user.tier, TIER_CREDIT_LIMITS["free"])
    return max(0, limit - (user.credits_used or 0))


def _insufficient(remaining: int, needed: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "error": "insufficient_credits",
            "detail": "Not enough credits. Upgrade your plan.",
            "credits_remaining": remaining,
            "credits_required": needed,
        },
    )


def deduct_credits(user_id: int, amount: int, prompt_id: str | None = None) -> dict:
    """
    Charge the user through Django's internal endpoint, which is the single
    source of truth for balances. Raises HTTPException on refusal/outage.
    """
    try:
        response = httpx.patch(
            f"{DJANGO_INTERNAL_URL}/api/user/credits/deduct/",
            json={"user_id": user_id, "amount": amount, "prompt_id": prompt_id},
            headers={"X-Internal-Token": INTERNAL_API_TOKEN},
            timeout=10.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "credit_service_unavailable", "detail": f"Could not reach billing: {exc}"},
        )

    if response.status_code == 402:
        body = response.json()
        raise _insufficient(body.get("credits_remaining", 0), amount)
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "credit_service_error",
                "detail": f"Billing returned {response.status_code}: {response.text[:200]}",
            },
        )
    return response.json()


# ─── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "fastapi-generation"}


@app.post(
    "/api/generate/",
    response_model=GenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit text for voice generation",
)
def generate_voice(
    request: GenerateRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    1. Confirm the voice exists, is ready and is visible to the caller.
    2. Pre-check credits (1 credit per character).
    3. Create the generation record.
    4. Charge credits through Django (authoritative, atomic).
    5. Queue the TTS job and return the job id for polling.
    """
    user_id = int(payload["user_id"])
    needed = billable_length(request.text)
    if needed == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "validation_error", "detail": "Add some text to speak, not only tags."},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_invalid", "detail": "Account not found or disabled."},
        )

    voice = db.query(VoiceModelVersion).filter(VoiceModelVersion.id == request.voice_model_id).first()
    if not voice or not (voice.is_default or voice.created_by_id == user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "detail": "No voice found with this ID."},
        )
    if voice.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "voice_not_ready",
                "detail": f"'{voice.display_name}' is {voice.status}. Pick a ready voice.",
            },
        )

    remaining = _credits_remaining(user)
    if remaining < needed:
        raise _insufficient(remaining, needed)

    prompt = VoicePrompt(
        id=uuid.uuid4(),
        text=request.text,
        status="processing",
        voice_model_id=request.voice_model_id,
        created_by_id=user_id,
        credits_charged=needed,
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)

    try:
        balance = deduct_credits(user_id, needed, str(prompt.id))
    except HTTPException:
        db.delete(prompt)
        db.commit()
        raise

    task = celery_app.send_task(
        "tts_worker.tasks.generate_tts",
        args=[str(prompt.id), request.text, str(request.voice_model_id)],
    )
    prompt.celery_task_id = task.id
    db.commit()

    return GenerateResponse(
        job_id=task.id,
        prompt_id=str(prompt.id),
        status="processing",
        created_at=prompt.created_at.isoformat(),
        credits_charged=needed,
        credits_remaining=balance.get("credits_remaining", remaining - needed),
    )


@app.get("/api/generate/status/{job_id}/", response_model=StatusResponse)
def get_generation_status(
    job_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    prompt = (
        db.query(VoicePrompt)
        .filter(VoicePrompt.celery_task_id == job_id, VoicePrompt.created_by_id == int(payload["user_id"]))
        .first()
    )
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "detail": "No generation job found with this ID."},
        )

    audio_url = prompt.audio_url
    if audio_url:
        audio_url = audio_url.replace("http://minio:9000", "http://localhost:9000")

    return StatusResponse(
        job_id=job_id,
        prompt_id=str(prompt.id),
        status=prompt.status,
        audio_url=audio_url,
        duration_seconds=float(prompt.duration_seconds) if prompt.duration_seconds else None,
        credits_charged=prompt.credits_charged or 0,
        error=prompt.error_detail,
    )
