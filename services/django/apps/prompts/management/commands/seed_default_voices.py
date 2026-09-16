"""
Seed the two platform default voices.

    python manage.py seed_default_voices

1. Uploads the bundled reference clips from voice_assets/defaults/ to the S3
   keys the fixture points at (skipped when the object already exists).
2. Loads apps/prompts/fixtures/voice_models.json.

Safe to run repeatedly.
"""

import json
import os

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.prompts.storage import object_exists, upload_file

FIXTURE = os.path.join(
    settings.BASE_DIR, "apps", "prompts", "fixtures", "voice_models.json"
)
DEFAULT_CLIPS_DIR = os.path.join(settings.BASE_DIR, "voice_assets", "defaults")

# fixture pk -> bundled clip file
CLIP_FILES = {
    "a11a0000-0000-4000-8000-000000000001": "aria.wav",
    "a11a0000-0000-4000-8000-000000000002": "marcus.wav",
}


class Command(BaseCommand):
    help = "Upload default voice reference clips to S3 and load the voice fixture."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force", action="store_true", help="Re-upload clips even if they exist."
        )

    def handle(self, *args, **options):
        with open(FIXTURE, encoding="utf-8") as fh:
            rows = json.load(fh)

        for row in rows:
            key = row["fields"]["audio_s3_key"]
            clip = CLIP_FILES.get(row["pk"])
            local_path = os.path.join(DEFAULT_CLIPS_DIR, clip) if clip else None

            if not local_path or not os.path.exists(local_path):
                self.stdout.write(
                    self.style.WARNING(f"  ! no bundled clip for {row['pk']} ({local_path}); skipping upload")
                )
                continue

            if object_exists(key) and not options["force"]:
                self.stdout.write(f"  = {key} already in storage")
                continue

            upload_file(local_path, key, content_type="audio/wav")
            self.stdout.write(self.style.SUCCESS(f"  + uploaded {clip} -> {key}"))

        call_command("loaddata", "voice_models", verbosity=1)
        self.stdout.write(self.style.SUCCESS("Default voices seeded."))
