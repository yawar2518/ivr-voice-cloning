from rest_framework import serializers
from .models import VoicePrompt, VoiceModelVersion
from .storage import export_download_url, presigned_url
from apps.users.models import User


class UserBriefSerializer(serializers.ModelSerializer):
    """
    Minimal user representation used inside prompt responses.
    Per contract Section 10 — only id and username exposed.
    """
    class Meta:
        model = User
        fields = ["id", "username"]


class VoiceModelVersionSerializer(serializers.ModelSerializer):
    """
    Voice model version representation — both standalone (GET/POST
    /api/voice-models/...) and nested inside prompt responses.
    Per contract Section 10.
    """
    created_by = UserBriefSerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()

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
            "notes",
            "created_at",
            "created_by",
        ]

    def get_audio_url(self, obj):
        # Re-signed on every read — see VoicePromptSerializer.get_audio_url.
        if obj.audio_s3_key:
            return presigned_url(obj.audio_s3_key, content_type="audio/wav")
        return None


class VoicePromptSerializer(serializers.ModelSerializer):
    voice_model = VoiceModelVersionSerializer(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    approved_by = UserBriefSerializer(read_only=True)
    rejected_by = UserBriefSerializer(read_only=True)
    exported_by = UserBriefSerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()
    export_download_url = serializers.SerializerMethodField()

    class Meta:
        model = VoicePrompt
        fields = [
            "id",
            "text",
            "status",
            "voice_model",
            "audio_url",
            "export_download_url",
            "duration_seconds",
            "created_by",
            "approved_by",
            "rejected_by",
            "exported_by",
            "error_detail",
            "created_at",
            "updated_at",
            "approved_at",
            "rejected_at",
            "exported_at",
        ]

    def get_audio_url(self, obj):
        # Re-sign on every read. The URL persisted on the row was signed by the
        # worker and expires an hour later, so a prompt listed the next day used
        # to hand the player a dead link.
        if obj.audio_s3_key:
            return presigned_url(obj.audio_s3_key, content_type="audio/wav")
        if obj.audio_url:
            # Rows written before audio_s3_key was populated.
            return obj.audio_url.replace(
                "http://minio:9000",
                "http://localhost:9000"
            )
        return None

    def get_export_download_url(self, obj):
        # Only set once the export task has actually uploaded the IVR file, so
        # the frontend renders the download button only when it resolves to a
        # real WAV.
        return export_download_url(obj)


class VoicePromptApproveSerializer(serializers.ModelSerializer):
    """
    Response serializer for POST /api/prompts/{id}/approve/
    Per contract Section 10.
    """
    approved_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = VoicePrompt
        fields = ["id", "status", "approved_by", "approved_at"]


class VoicePromptRejectSerializer(serializers.ModelSerializer):
    """
    Response serializer for POST /api/prompts/{id}/reject/
    Per contract Section 10.
    """
    rejected_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = VoicePrompt
        fields = ["id", "status", "rejected_by", "rejected_at", "error_detail"]


class VoicePromptExportSerializer(serializers.ModelSerializer):
    """
    Response serializer for POST /api/prompts/{id}/export/
    Per contract Section 10.
    """
    exported_by = UserBriefSerializer(read_only=True)
    export_download_url = serializers.SerializerMethodField()

    class Meta:
        model = VoicePrompt
        fields = [
            "id",
            "status",
            "exported_by",
            "exported_at",
            "export_download_url",
        ]

    def get_export_download_url(self, obj):
        return export_download_url(obj)