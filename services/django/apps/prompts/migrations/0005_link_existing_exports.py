"""
Point already-live prompts at the export files they already have.

Some prompts reached "live" before export_s3_key existed without their
audio_s3_key being overwritten (0004 handles the ones that were). Their
exported WAV is sitting in object storage under the deterministic export key,
but nothing references it, so the API reports no download URL and the frontend
renders no download button. Link the two back up where the object really
exists.
"""

from django.db import migrations

EXPORT_KEY = "exports/v1.0/{prompt_id}/export_8khz_pcm.wav"


def link_exports(apps, schema_editor):
    VoicePrompt = apps.get_model("prompts", "VoicePrompt")
    unlinked = VoicePrompt.objects.filter(status="live", export_s3_key__isnull=True)
    if not unlinked.exists():
        return

    import boto3
    from botocore.exceptions import ClientError
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
        # No storage reachable — leave the rows alone; re-running the export
        # repopulates the key.
        return

    for prompt in unlinked:
        key = EXPORT_KEY.format(prompt_id=prompt.id)
        try:
            s3.head_object(Bucket=bucket, Key=key)
        except ClientError:
            continue  # Nothing was ever exported for this prompt.
        except Exception:
            return
        prompt.export_s3_key = key
        prompt.save(update_fields=["export_s3_key"])


def noop(apps, schema_editor):
    """Unlinking would only hide files that are genuinely there."""


class Migration(migrations.Migration):

    dependencies = [
        ("prompts", "0004_backfill_export_s3_key"),
    ]

    operations = [
        migrations.RunPython(link_exports, noop),
    ]
