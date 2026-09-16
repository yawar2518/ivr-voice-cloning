# Data migration: collapse the old IVR approval workflow statuses into the
# SaaS lifecycle (processing -> ready | failed) and backfill credit charges
# for generations created before credit tracking existed.

from django.db import migrations
from django.db.models import Q


def forwards(apps, schema_editor):
    VoicePrompt = apps.get_model("prompts", "VoicePrompt")

    # approved / live / rejected all had finished audio — they are "ready".
    VoicePrompt.objects.filter(
        status__in=["approved", "live", "rejected"], audio_s3_key__isnull=False
    ).update(status="ready")
    VoicePrompt.objects.filter(
        status__in=["approved", "live", "rejected"]
    ).update(status="failed")

    # 1 credit per character for rows that predate credits_charged.
    for prompt in VoicePrompt.objects.filter(Q(credits_charged=0) | Q(credits_charged__isnull=True)).only("id", "text"):
        prompt.credits_charged = len(prompt.text or "")
        prompt.save(update_fields=["credits_charged"])


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("prompts", "0009_alter_voicemodelversion_options_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
