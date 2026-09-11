import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from decouple import config
from sqlalchemy import create_engine, Column, String, Text, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from celery import Celery

# ─── App Setup ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="IVR Voice Cloning — Generation API",
    description="Async TTS generation endpoint. Part of AgileTech Studio case study.",
    version="1.0.0"
)

# ─── Config ────────────────────────────────────────────────────────────────
SECRET_KEY = config("SECRET_KEY")
DATABASE_URL = config("DATABASE_URL").replace("postgres://", "postgresql://")
REDIS_URL = config("REDIS_URL")

# ─── Database ──────────────────────────────────────────────────────────────
# FastAPI connects to the same PostgreSQL as Django
# We use SQLAlchemy directly — no Django ORM here
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency — provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── SQLAlchemy Models ─────────────────────────────────────────────────────
# We only define the tables FastAPI needs to read/write.
# Django owns the migrations — we never create tables from here.

class VoicePrompt(Base):
    """
    Maps to Django's prompts_voiceprompt table.
    FastAPI only creates records and reads status — Django owns everything else.
    """
    __tablename__ = "prompts_voiceprompt"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    text = Column(Text, nullable=False)
    text_processed = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    voice_model_id = Column(UUID(as_uuid=True), nullable=True)
    audio_url = Column(Text, nullable=True)
    audio_s3_key = Column(String(500), nullable=True)
    duration_seconds = Column(String(10), nullable=True)
    celery_task_id = Column(String(255), nullable=True)
    error_detail = Column(Text, nullable=True)
    created_by_id = Column(String(50), nullable=False)
    approved_by_id = Column(String(50), nullable=True)
    rejected_by_id = Column(String(50), nullable=True)
    exported_by_id = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    exported_at = Column(DateTime(timezone=True), nullable=True)


# ─── Celery Client ─────────────────────────────────────────────────────────
# FastAPI uses Celery only to SEND tasks — not to run them.
# The actual task runs in the tts_worker service.
celery_app = Celery("ivr_voice", broker=REDIS_URL, backend=REDIS_URL)


# ─── Auth ──────────────────────────────────────────────────────────────────
security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verifies the JWT token using the same SECRET_KEY as Django.
    Returns the decoded payload containing user_id, username, email, role.
    Raises 401 if token is invalid or expired.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_invalid", "detail": "Token is invalid or expired."}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_invalid", "detail": "Token is invalid or expired."}
        )


def require_generator_or_above(payload: dict = Depends(verify_token)) -> dict:
    """
    Ensures the user has at least generator role.
    All three roles can generate — this just blocks unauthenticated requests.
    Per API_CONTRACT.md Section 6 Role Permission Matrix.
    """
    allowed_roles = {"generator", "approver", "admin"}
    if payload.get("role") not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "permission_denied",
                "detail": "Your role does not allow generating voice prompts."
            }
        )
    return payload


# ─── Request / Response Schemas ────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """
    Request body for POST /api/generate/
    See API_CONTRACT.md Section 9.
    """
    text: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Text to convert to voice. Max 500 characters."
    )
    voice_model_id: uuid.UUID = Field(
        ...,
        description="UUID of an active VoiceModelVersion record."
    )


class GenerateResponse(BaseModel):
    """Response shape for POST /api/generate/ — 202 Accepted."""
    job_id: str
    prompt_id: str
    status: str
    created_at: str


class StatusResponse(BaseModel):
    """Response shape for GET /api/generate/status/{job_id}/"""
    job_id: str
    prompt_id: str
    status: str
    audio_url: Optional[str]
    duration_seconds: Optional[float]
    error: Optional[str]


# ─── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """Simple health check — used by Docker and monitoring."""
    return {"status": "ok", "service": "fastapi-generation"}


@app.post(
    "/api/generate/",
    response_model=GenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit text for voice generation",
    description="Accepts text input, creates a VoicePrompt record, queues a Celery TTS job, and returns a job_id immediately."
)
def generate_voice(
    request: GenerateRequest,
    payload: dict = Depends(require_generator_or_above),
    db: Session = Depends(get_db)
):
    """
    POST /api/generate/
    
    1. Validate input
    2. Create VoicePrompt record with status=processing
    3. Send Celery task to tts_worker
    4. Return job_id — caller polls status endpoint
    
    Auth: generator, approver, admin
    See API_CONTRACT.md Section 9.
    """

    # Create the prompt record in the database
    prompt = VoicePrompt(
        id=uuid.uuid4(),
        text=request.text,
        status="processing",
        voice_model_id=request.voice_model_id,
        created_by_id=str(payload["user_id"]),
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)

    # Send the TTS job to the Celery worker
    # The task name must match what the worker registers
    task = celery_app.send_task(
        "tts_worker.tasks.generate_tts",
        args=[str(prompt.id), request.text, str(request.voice_model_id)],
    )

    # Save the Celery task ID so we can poll status later
    prompt.celery_task_id = task.id
    db.commit()

    return GenerateResponse(
        job_id=task.id,
        prompt_id=str(prompt.id),
        status="processing",
        created_at=prompt.created_at.isoformat(),
    )


@app.get(
    "/api/generate/status/{job_id}/",
    response_model=StatusResponse,
    summary="Poll generation job status",
    description="Returns the current status of a TTS generation job. Ahtesham calls this every 2 seconds until status is no longer 'processing'."
)
def get_generation_status(
    job_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    GET /api/generate/status/{job_id}/
    
    Looks up the VoicePrompt record by celery_task_id.
    Returns current status, audio_url if ready, error if failed.
    
    Auth: any authenticated role
    See API_CONTRACT.md Section 9.
    """

    # Find the prompt by Celery task ID
    prompt = db.query(VoicePrompt).filter(
        VoicePrompt.celery_task_id == job_id
    ).first()

    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "detail": "No generation job found with this ID."}
        )

    return StatusResponse(
        job_id=job_id,
        prompt_id=str(prompt.id),
        status=prompt.status,
        audio_url=prompt.audio_url,
        duration_seconds=float(prompt.duration_seconds) if prompt.duration_seconds else None,
        error=prompt.error_detail,
    )