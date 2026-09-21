from django.test import Client
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.prompts.models import VoiceModelVersion

User = get_user_model()
admin_user = User.objects.get(email="admin@agiletechstudio.com")

from rest_framework_simplejwt.tokens import RefreshToken
token = str(RefreshToken.for_user(admin_user).access_token)

client = Client(SERVER_NAME="localhost")

with open("/app/voice_assets/brian_voice.mp3", "rb") as f:
    content = f.read()

upload = SimpleUploadedFile("brian_voice.mp3", content, content_type="audio/mpeg")

resp = client.post(
    "/api/voice-models/upload/",
    data={
        "display_name": "API Upload Test",
        "language": "english",
        "audio_file": upload,
    },
    HTTP_AUTHORIZATION=f"Bearer {token}",
)
print("status_code:", resp.status_code)
print(resp.content.decode(errors="ignore")[:2000])
