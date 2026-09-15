from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model for the IVR Voice Cloning system.
    Extends Django's AbstractUser to add a role field.

    Role drives all permission checks server-side (django-guardian + DRF)
    and is embedded in the JWT payload so the frontend can gate UI elements
    without an extra API call — see API_CONTRACT.md Section 6.
    """

    class Role(models.TextChoices):
        GENERATOR = "generator", "Generator"
        APPROVER = "approver", "Approver"
        ADMIN = "admin", "Admin"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.GENERATOR,
        help_text="Controls what actions this user can perform in the system.",
    )

    # Email is required and must be unique — used for identification
    email = models.EmailField(unique=True)

    class Meta:
        db_table = "users_user"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.username} ({self.role})"

    # ─── Convenience properties ───────────────────────────────────────────
    # These make permission checks readable in views:
    # e.g. if request.user.is_admin: ...

    @property
    def is_generator(self):
        return self.role == self.Role.GENERATOR

    @property
    def is_approver(self):
        return self.role == self.Role.APPROVER

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN