import uuid
from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Records every significant action in the system.
    Used for compliance and audit trail.
    See API_CONTRACT.md Section 7.4
    """

    class Action(models.TextChoices):
        GENERATE = "generate", "Generate"
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"
        EXPORT = "export", "Export"
        DELETE = "delete", "Delete"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"

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