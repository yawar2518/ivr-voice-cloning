from rest_framework import serializers
from .models import VoicePrompt, VoiceModelVersion
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
    Voice model version representation inside prompt responses.
    Per contract Section 10.
    """
    class Meta:
        model = VoiceModelVersion
        fields = [
            "id",
            "version_label",
            "provider",
            "model_variant",
            "is_active",
            "created_at",
        ]


class VoicePromptSerializer(serializers.ModelSerializer):
    """
    Full serializer for VoicePrompt.
    Used by GET /api/prompts/ and GET /api/prompts/{id}/
    Per contract Section 10.
    """
    voice_model = VoiceModelVersionSerializer(read_only=True)
    created_by = UserBriefSerializer(read_only=True)
    approved_by = UserBriefSerializer(read_only=True)
    rejected_by = UserBriefSerializer(read_only=True)
    exported_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = VoicePrompt
        fields = [
            "id",
            "text",
            "status",
            "voice_model",
            "audio_url",
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
        return self.context.get("export_download_url")