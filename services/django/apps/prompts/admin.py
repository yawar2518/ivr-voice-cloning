from django.contrib import admin
from .models import VoiceModelVersion


@admin.register(VoiceModelVersion)
class VoiceModelVersionAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "version_label",
        "provider",
        "model_variant",
        "language",
        "is_active",
        "created_at"
    )
    list_filter = ("is_active", "provider", "language")