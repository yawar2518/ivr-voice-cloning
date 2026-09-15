from django.contrib import admin
from .models import VoiceModelVersion


@admin.register(VoiceModelVersion)
class VoiceModelVersionAdmin(admin.ModelAdmin):
    list_display = (
        "version_label",
        "provider",
        "model_variant",
        "is_active",
        "created_at"
    )
    list_filter = ("is_active", "provider")