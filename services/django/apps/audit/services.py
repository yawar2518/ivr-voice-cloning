"""Small helper so views can record an audit entry in one line without ever
failing the request they belong to."""

from .models import AuditLog


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record(action, user, request=None, prompt_id=None, before=None, after=None, detail=None):
    if user is None or not getattr(user, "pk", None):
        return None
    try:
        return AuditLog.objects.create(
            action=action,
            prompt_id=prompt_id,
            performed_by=user,
            ip_address=client_ip(request),
            before_status=before,
            after_status=after,
            detail=detail or {},
        )
    except Exception as exc:  # never let logging break the API
        print(f"[audit] failed to record {action}: {exc}")
        return None
