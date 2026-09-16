from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


# Plan limits. One credit == one character of generated text.
TIER_CREDIT_LIMITS = {"free": 5000, "pro": 100000, "scale": 500000}
TIER_VOICE_LIMITS = {"free": 3, "pro": 10, "scale": 30}
CREDIT_PERIOD_DAYS = 30


def default_credits_reset_date():
    return timezone.now() + timedelta(days=CREDIT_PERIOD_DAYS)


class User(AbstractUser):
    """
    SaaS account. Every user can sign up, generate speech and clone voices;
    what differs between accounts is the plan tier, which drives the monthly
    credit allowance and the number of custom voices they may keep.
    """

    class Tier(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        SCALE = "scale", "Scale"

    tier = models.CharField(
        max_length=20,
        choices=Tier.choices,
        default=Tier.FREE,
        help_text="Subscription plan. Controls credit and voice-clone limits.",
    )
    credits_used = models.IntegerField(
        default=0,
        help_text="Characters generated in the current billing period.",
    )
    credits_reset_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When credits_used next rolls back to zero.",
    )

    # Email is required and must be unique — used for identification
    email = models.EmailField(unique=True)

    class Meta:
        db_table = "users_user"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.username} ({self.tier})"

    # ─── Plan-derived properties ───────────────────────────────────────────

    @property
    def credits_limit(self):
        return TIER_CREDIT_LIMITS.get(self.tier, TIER_CREDIT_LIMITS["free"])

    @property
    def credits_remaining(self):
        return max(0, self.credits_limit - self.credits_used)

    @property
    def voice_clone_limit(self):
        return TIER_VOICE_LIMITS.get(self.tier, TIER_VOICE_LIMITS["free"])

    @property
    def voices_used(self):
        # Default voices are shared and never count against the plan.
        return self.voice_models_created.filter(is_default=False).count()
