from rest_framework import serializers
from .models import VoicePrompt, VoiceModelVersion
from .storage import presigned_url
from apps.users.models import User


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class VoiceModelVersionSerializer(serializers.ModelSerializer):
    """
    A voice the caller can generate with: either a platform default or one
    of their own clones. `audio_url` is a short-lived link to the reference
    clip, used by the "play preview" button.
    """
    created_by = UserBriefSerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = VoiceModelVersion
        fields = [
            "id",
            "version_label",
            "provider",
            "model_variant",
            "display_name",
            "language",
            "reference_text",
            "audio_url",
            "is_active",
            "is_default",
            "is_owner",
            "status",
            "error_detail",
            "notes",
            "created_at",
            "created_by",
        ]

    def get_audio_url(self, obj):
        if obj.audio_s3_key:
            return presigned_url(obj.audio_s3_key, content_type="audio/wav")
        return None

    def get_is_owner(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.created_by_id == user.id)


class VoiceBriefSerializer(serializers.ModelSerializer):
    """Compact voice shape nested inside a generation."""

    class Meta:
        model = VoiceModelVersion
        fields = ["id", "display_name", "language", "is_default"]


class GenerationSerializer(serializers.ModelSerializer):
    """
    A generation (history item). The API path is still /api/prompts/ for
    compatibility with the FastAPI service and existing clients.
    """
    voice_model = VoiceBriefSerializer(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()
    credits_used = serializers.SerializerMethodField()
    character_count = serializers.SerializerMethodField()

    class Meta:
        model = VoicePrompt
        fields = [
            "id",
            "text",
            "status",
            "voice_model",
            "audio_url",
            "duration_seconds",
            "credits_used",
            "character_count",
            "created_by",
            "error_detail",
            "created_at",
            "updated_at",
        ]

    def get_audio_url(self, obj):
        # Re-sign on every read; the URL the worker persisted expires after
        # an hour and would hand the player a dead link the next day.
        if obj.audio_s3_key:
            return presigned_url(obj.audio_s3_key, content_type="audio/wav")
        if obj.audio_url:
            return obj.audio_url.replace("http://minio:9000", "http://localhost:9000")
        return None

    def get_credits_used(self, obj):
        # Rows created before credit tracking fall back to the character count.
        return obj.credits_charged or len(obj.text or "")

    def get_character_count(self, obj):
        return len(obj.text or "")


# Backwards-compatible alias for any importer still using the old name.
VoicePromptSerializer = GenerationSerializer
