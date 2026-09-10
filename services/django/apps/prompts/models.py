import uuid
from django.db import models
from django.conf import settings


class VoiceModelVersion(models.Model):
    """
    Represents a trained voice model version used for TTS generation.
    
    In the case study there is exactly one active record:
    Chatterbox Original 0.5B (MIT) running on RTX 5060.
    
    In a real client engagement, new versions are added here when
    the reference audio is updated or a new model is trained.
    The active version is selected at generation time.

    See API_CONTRACT.md Section 7.2 for the full schema.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    version_label = models.CharField(
        max_length=20,
        help_text="Human-readable version label e.g. v1.0"
    )
    provider = models.CharField(
        max_length=50,
        help_text="TTS provider e.g. chatterbox"
    )
    model_variant = models.CharField(
        max_length=20,
        help_text="Model variant e.g. original or turbo"
    )
    reference_audio = models.CharField(
        max_length=500,
        help_text="Path to the reference WAV file used for zero-shot cloning"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Only one model version should be active at a time"
    )
    notes = models.TextField(
        null=True,
        blank=True,
        help_text="Optional notes about this model version"
    )
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