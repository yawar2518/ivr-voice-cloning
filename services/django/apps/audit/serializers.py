from rest_framework import serializers
from .models import AuditLog
from apps.users.models import User


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class AuditLogSerializer(serializers.ModelSerializer):
    """
    Serializer for AuditLog.
    Used by GET /api/audit/
    Admin only — per contract Section 11.
    """
    performed_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "prompt_id",
            "performed_by",
            "ip_address",
            "before_status",
            "after_status",
            "detail",
            "timestamp",
        ]