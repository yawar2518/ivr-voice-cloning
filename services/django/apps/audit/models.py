import uuid
from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Trail of account and generation events, visible in the Django admin
    (Audit > Audit logs). Written by the API views via apps.audit.services.
    """

    class Action(models.TextChoices):
        REGISTER = "register", "Register"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        GENERATE = "generate", "Generate"
        DELETE = "delete", "Delete"
        VOICE_UPLOAD = "voice_upload", "Voice upload"
        VOICE_DELETE = "voice_delete", "Voice delete"
        PROFILE_UPDATE = "profile_update", "Profile update"
        CREDITS_RESET = "credits_reset", "Credits reset"
        # Legacy IVR workflow actions, kept so old rows still display.
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"
        EXPORT = "export", "Export"

    action = models.CharField(
        max_length=30,
        choices=Action.choices,
    )
    prompt_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="Null for login/logout entries"
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="audit_logs"
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True
    )
    before_status = models.CharField(
        max_length=20,
        null=True,
        blank=True
    )
    after_status = models.CharField(
        max_length=20,
        null=True,
        blank=True
    )
    detail = models.JSONField(
        default=dict,
        blank=True
    )
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_auditlog"
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.action} by {self.performed_by} at {self.timestamp}"