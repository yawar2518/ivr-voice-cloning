from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only trail of account and generation events. Entries are written
    by the API views; nothing is editable here."""

    list_display = ("timestamp", "action", "performed_by", "prompt_id", "before_status", "after_status", "ip_address", "summary")
    list_filter = ("action", "timestamp")
    search_fields = ("performed_by__username", "performed_by__email", "prompt_id", "detail")
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)
    readonly_fields = ("action", "prompt_id", "performed_by", "ip_address", "before_status", "after_status", "detail", "timestamp")
    list_per_page = 50

    @admin.display(description="Detail")
    def summary(self, obj):
        if not obj.detail:
            return ""
        parts = [f"{k}={str(v)[:40]}" for k, v in obj.detail.items()]
        return ", ".join(parts)[:120]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
