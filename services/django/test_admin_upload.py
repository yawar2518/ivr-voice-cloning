import time
from django.test import Client
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.prompts.models import VoiceModelVersion

User = get_user_model()
admin_user = User.objects.get(email="admin@agiletechstudio.com")

client = Client(SERVER_NAME="localhost")
client.force_login(admin_user)

with open("/app/voice_assets/brian_voice.mp3", "rb") as f:
    content = f.read()
print("file size:", len(content))

upload = SimpleUploadedFile("brian_voice.mp3", content, content_type="audio/mpeg")

resp = client.post(
    "/admin/prompts/voicemodelversion/add/",
    data={
        "display_name": "Admin Upload Test",
        "language": "english",
        "reference_text": "",
        "is_default": "",
        "audio_file": upload,
    },
)
print("status_code:", resp.status_code)
if resp.status_code != 302:
    content_str = resp.content.decode(errors="ignore")
    # print form errors if any
    import re
    errors = re.findall(r'<ul class="errorlist">.*?</ul>', content_str, re.S)
    print("ERRORS:", errors[:10])
else:
    print("Redirected to:", resp.headers.get("Location"))

vm = VoiceModelVersion.objects.filter(display_name="Admin Upload Test").order_by("-created_at").first()
if vm:
    print("Created voice:", vm.id, "status=", vm.status, "staging_s3_key=", vm.staging_s3_key, "audio_s3_key=", vm.audio_s3_key, "celery_task_id=", vm.celery_task_id)
else:
    print("No VoiceModelVersion row created.")
