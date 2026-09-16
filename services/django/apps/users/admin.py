from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "email",
        "tier",
        "credits_used",
        "credits_reset_date",
        "is_active",
        "date_joined",
    )
    list_filter = ("tier", "is_active")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Plan and credits", {"fields": ("tier", "credits_used", "credits_reset_date")}),
    )
