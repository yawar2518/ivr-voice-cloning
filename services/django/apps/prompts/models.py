import uuid
from django.db import models
from django.conf import settings


class VoiceModelVersion(models.Model):
    """
    Represents a trained voice model version used for TTS generation.
    See API_CONTRACT.md Section 7.2
    """

    class Language(models.TextChoices):
        ENGLISH = "english", "English"
        URDU = "urdu", "Urdu"
        HINDI = "hindi", "Hindi"
        BILINGUAL = "bilingual", "Bilingual"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    version_label = models.CharField(max_length=20)
    provider = models.CharField(max_length=50)
    model_variant = models.CharField(max_length=20)
    reference_audio = models.CharField(max_length=500)
    display_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Friendly name shown in the UI, e.g. 'Rachel (English)'"
    )
    language = models.CharField(
        max_length=20,
        choices=Language.choices,
        default=Language.ENGLISH,
    )
    reference_text = models.TextField(
        null=True,
        blank=True,
        help_text="Transcript of the reference audio; auto-transcribed by the worker if empty"
    )
    audio_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="S3 key of the uploaded reference audio (44.1kHz WAV)"
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="voice_models_created"
    )

    class Meta:
        db_table = "prompts_voicemodelversion"
        verbose_name = "Voice Model Version"
        verbose_name_plural = "Voice Model Versions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.provider} / {self.model_variant} ({self.version_label})"


class VoicePrompt(models.Model):
    """
    Represents a single TTS generation request and its output.
    Moves through a state machine — see API_CONTRACT.md Section 5.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Failed"
        LIVE = "live", "Live"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    text = models.TextField(
        help_text="Raw input text, max 500 characters"
    )
    text_processed = models.TextField(
        null=True,
        blank=True,
        help_text="Text after preprocessing rules applied"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    voice_model = models.ForeignKey(
        VoiceModelVersion,
        on_delete=models.SET_NULL,
        null=True,
        related_name="prompts"
    )
    audio_url = models.TextField(
        null=True,
        blank=True,
        help_text="Pre-signed S3 URL, valid 1 hour"
    )
    audio_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Internal S3 key — never exposed in API"
    )
    export_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text=(
            "Internal S3 key of the exported 8 kHz IVR WAV — never exposed in "
            "API. Kept separate from audio_s3_key so exporting does not destroy "
            "the reference to the playback-quality master."
        )
    )
    duration_seconds = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True
    )
    celery_task_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Celery task UUID for status polling"
    )
    error_detail = models.TextField(
        null=True,
        blank=True,
        help_text="Set when status is failed"
    )

    # User relationships
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="prompts_created"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prompts_approved"
    )
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prompts_rejected"
    )
    exported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prompts_exported"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    exported_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "prompts_voiceprompt"
        verbose_name = "Voice Prompt"
        verbose_name_plural = "Voice Prompts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.text[:50]} ({self.status})"