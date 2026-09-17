# Data migration: give every pre-existing account a billing window so the
# daily reset task has something to roll over.

from datetime import timedelta

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(credits_reset_date__isnull=True).update(
        credits_reset_date=timezone.now() + timedelta(days=30)
    )


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_remove_user_role_user_credits_reset_date_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
