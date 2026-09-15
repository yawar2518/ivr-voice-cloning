"""
Repair rows written by the old export task.

Before export_s3_key existed, export_prompt wrote the exported 8 kHz file's key
over audio_s3_key (and a pre-signed URL of it over audio_url), which destroyed
the only pointer to the playback-quality master. Those rows are identifiable —
audio_s3_key under the "exports/" prefix — and the master is still in object
storage under "voices/v1.0/<prompt id>/", so both fields can be restored.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    VoicePrompt = apps.get_model("prompts", "VoicePrompt")
    damaged = VoicePrompt.objects.filter(
        audio_s3_key__startswith="exports/", export_s3_key__isnull=True
    )
    if not damaged.exists():
        return

    import boto3
    from django.conf import settings

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None),
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=getattr(settings, "AWS_S3_REGION_NAME", "us-east-1"),
        )
        bucket = settings.AWS_STORAGE_BUCKET_NAME
    except Exception:
        s3 = None

    for prompt in damaged:
        prompt.export_s3_key = prompt.audio_s3_key

        # audio_url holds a pre-signed link to the export, and an expired one at
        # that. Drop it either way; the serializer re-signs from the key now.
        prompt.audio_url = None
        prompt.audio_s3_key = None

        if s3 is not None:
            try:
                found = s3.list_objects_v2(
                    Bucket=bucket, Prefix=f"voices/v1.0/{prompt.id}/"
                ).get("Contents", [])
                if found:
                    # Newest master wins if a prompt was regenerated.
                    prompt.audio_s3_key = max(
                        found, key=lambda o: o["LastModified"]
                    )["Key"]
            except Exception:
                pass

        prompt.save(update_fields=["audio_s3_key", "audio_url", "export_s3_key"])


def noop(apps, schema_editor):
    """The damaged state is not worth recreating."""


class Migration(migrations.Migration):

    dependencies = [
        ("prompts", "0003_voiceprompt_export_s3_key"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
