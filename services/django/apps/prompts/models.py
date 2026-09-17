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

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    version_label = models.CharField(max_length=20)
    provider = models.CharField(max_length=50)
    model_variant = models.CharField(max_length=20)
    reference_audio = models.CharField(max_length=500, null=True, blank=True)
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
        help_text=(
            "Transcript of the reference audio. English voices are "
            "auto-transcribed by the worker if left empty at upload; other "
            "languages require a manually-typed Roman-script transcript."
        )
    )
    audio_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="S3 key of the uploaded reference audio (44.1kHz WAV)"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PROCESSING,
        help_text="Async processing state: convert -> trim -> transcribe -> ready"
    )
    celery_task_id = models.CharField(max_length=255, null=True, blank=True)
    error_detail = models.TextField(null=True, blank=True)
    staging_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="S3 key of the raw upload before processing; kept for debugging a failed row"
    )
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(
        default=False,
        help_text=(
            "Platform-provided voice: visible to every account, cannot be "
            "deleted, and never counts toward a user's voice-clone limit."
        ),
    )
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
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        return self.display_name or f"{self.provider} / {self.model_variant} ({self.version_label})"


class VoicePrompt(models.Model):
    """
    A single generation: the text a user submitted, the voice it was
    rendered with, and the resulting audio. Exposed as "generations" /
    history in the API; the table and class name are kept because the
    FastAPI service and the TTS worker map the same table.

    Lifecycle: processing -> ready | failed. There is no approval step.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    text = models.TextField(
        help_text="Raw input text, max 5000 characters"
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
    mp3_s3_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Internal S3 key of the MP3 transcode, created lazily on first MP3 download."
    )
    credits_charged = models.IntegerField(
        default=0,
        help_text="Credits deducted for this generation (1 credit per character)."
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

    # User relationships. approved_by / rejected_by / exported_by are legacy
    # columns from the old IVR approval workflow; they are no longer written
    # or exposed but stay in the schema because the worker maps the table.
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
        verbose_name = "Generation"
        verbose_name_plural = "Generations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.text[:50]} ({self.status})"