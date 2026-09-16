from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import record as audit
from .models import CREDIT_PERIOD_DAYS, User


@shared_task(name="apps.users.tasks.reset_expired_credits")
def reset_expired_credits():
    """
    Runs daily from Celery Beat. Every account whose billing period has
    elapsed gets its usage zeroed and a fresh 30-day window. Accounts with no
    reset date (created before the credit system) are seeded with one.
    """
    now = timezone.now()
    next_reset = now + timedelta(days=CREDIT_PERIOD_DAYS)

    due = User.objects.filter(credits_reset_date__lte=now)
    for user in due.only("id", "credits_used"):
        audit(AuditLog.Action.CREDITS_RESET, user, detail={"credits_used_before": user.credits_used})
    reset_count = due.update(credits_used=0, credits_reset_date=next_reset)

    seeded_count = User.objects.filter(credits_reset_date__isnull=True).update(
        credits_reset_date=next_reset
    )

    print(f"[credits] reset {reset_count} account(s), seeded {seeded_count} reset date(s)")
    return {"reset": reset_count, "seeded": seeded_count}
