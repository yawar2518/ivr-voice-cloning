import uuid

from django import forms
from django.contrib import admin, messages
from django.db import transaction

from apps.audit.models import AuditLog
from apps.audit.services import record as audit
from core import celery_app
from .audio_validation import MIN_AUDIO_BYTES, looks_like_audio
from .models import VoiceModelVersion, VoicePrompt
from .storage import upload_fileobj
from .views import (
    AUTO_TRANSCRIBE_LANGUAGES,
    VOICE_MODEL_VARIANT,
    VOICE_PROVIDER,
    VOICE_VERSION_LABEL,
)


class VoiceModelVersionAdminForm(forms.ModelForm):
    audio_file = forms.FileField(
        required=False,
        help_text=(
            "Upload an MP3/WAV reference clip. Required when creating a new "
            "voice. Runs the exact same staging + convert/trim/transcribe "
            "pipeline as the API upload endpoint; audio_s3_key and "
            "staging_s3_key are set automatically once it finishes."
        ),
    )

    class Meta:
        model = VoiceModelVersion
        fields = ["display_name", "language", "reference_text", "is_default", "audio_file"]

    def clean(self):
        cleaned = super().clean()
        audio_file = cleaned.get("audio_file")
        language = cleaned.get("language")
        reference_text = (cleaned.get("reference_text") or "").strip()

        if not self.instance.pk and not audio_file:
            self.add_error("audio_file", "Required when creating a new voice.")

        if audio_file:
            if audio_file.size < MIN_AUDIO_BYTES or not looks_like_audio(audio_file):
                self.add_error(
                    "audio_file",
                    "This doesn't look like a valid MP3/WAV file — the upload "
                    "may have been corrupted.",
                )
            if language and language not in AUTO_TRANSCRIBE_LANGUAGES and not reference_text:
                self.add_error(
                    "reference_text",
                    "Required for this language — automatic transcription is "
                    "English-only. Type the exact words spoken in the clip.",
                )
        return cleaned


@admin.register(VoiceModelVersion)
class VoiceModelVersionAdmin(admin.ModelAdmin):
    form = VoiceModelVersionAdminForm
    list_display = (
        "display_name",
        "language",
        "status",
        "is_default",
        "is_active",
        "created_by",
        "created_at",
    )
    list_filter = ("is_default", "is_active", "status", "language")
    search_fields = ("display_name",)
    readonly_fields = ("status", "audio_s3_key", "staging_s3_key", "error_detail", "created_at")

    def get_fields(self, request, obj=None):
        fields = ["display_name", "language", "reference_text", "is_default", "audio_file"]
        if obj is not None:
            fields += ["status", "audio_s3_key", "staging_s3_key", "error_detail", "created_at"]
        return fields

    def save_model(self, request, obj, form, change):
        audio_file = form.cleaned_data.get("audio_file")
        if not audio_file:
            super().save_model(request, obj, form, change)
            return

        voice_id = obj.pk or uuid.uuid4()
        s3_key = f"voices/staging/{voice_id}/{audio_file.name}"
        upload_fileobj(audio_file, s3_key, content_type=audio_file.content_type)

        obj.id = voice_id
        obj.version_label = VOICE_VERSION_LABEL
        obj.provider = VOICE_PROVIDER
        obj.model_variant = VOICE_MODEL_VARIANT
        obj.staging_s3_key = s3_key
        obj.audio_s3_key = None
        obj.is_active = False
        obj.status = VoiceModelVersion.Status.PROCESSING
        obj.error_detail = None
        obj.created_by = obj.created_by or request.user
        super().save_model(request, obj, form, change)

        # Django admin's add/change views run inside transaction.atomic(), so
        # obj isn't actually committed yet — dispatching the task now would
        # let the worker query a row that doesn't exist in the DB until this
        # request's transaction commits. Defer dispatch until it does.
        def dispatch_processing():
            async_result = celery_app.send_task(
                "tts_worker.tasks.process_voice_upload",
                args=[str(voice_id), s3_key],
            )
            VoiceModelVersion.objects.filter(pk=voice_id).update(
                celery_task_id=async_result.id
            )
            audit(
                AuditLog.Action.VOICE_UPLOAD,
                request.user,
                request,
                after="processing",
                detail={
                    "voice_id": str(voice_id),
                    "display_name": obj.display_name,
                    "language": obj.language,
                    "source": "admin",
                },
            )

        transaction.on_commit(dispatch_processing)
        messages.info(
            request,
            f"'{obj.display_name}' is processing in the background — refresh this page "
            "shortly to see status change to 'ready'.",
        )


@admin.register(VoicePrompt)
class GenerationAdmin(admin.ModelAdmin):
    list_display = ("short_text", "status", "voice_model", "created_by", "credits_charged", "created_at")
    list_filter = ("status",)
    search_fields = ("text",)

    def short_text(self, obj):
        return (obj.text or "")[:60]
