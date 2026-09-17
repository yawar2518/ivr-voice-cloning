from django.contrib import admin
from .models import VoiceModelVersion, VoicePrompt


@admin.register(VoiceModelVersion)
class VoiceModelVersionAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "language",
        "status",
        "is_default",
        "is_active",
        "created_by",
        "created_at",
    )
    list_filter = ("is_default", "is_active", "status", "language")
    search_fields = ("display_name",)


@admin.register(VoicePrompt)
class GenerationAdmin(admin.ModelAdmin):
    list_display = ("short_text", "status", "voice_model", "created_by", "credits_charged", "created_at")
    list_filter = ("status",)
    search_fields = ("text",)

    def short_text(self, obj):
        return (obj.text or "")[:60]
