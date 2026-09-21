from django.test import Client
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
admin_user = User.objects.get(email="admin@agiletechstudio.com")
token = str(RefreshToken.for_user(admin_user).access_token)

client = Client(SERVER_NAME="localhost")

with open("/app/voice_assets/brian_voice.mp3", "rb") as f:
    raw = f.read()

# Simulate the classic PowerShell bug: binary bytes forced through a
# UTF-8 string round-trip (as happens when a script builds the multipart
# body as a .NET string instead of raw bytes). Invalid byte sequences get
# replaced with U+FFFD, mangling the header.
mangled = raw.decode("utf-8", errors="replace").encode("utf-8")
print("original size:", len(raw), "mangled size:", len(mangled), "identical:", raw == mangled)

upload = SimpleUploadedFile("brian_voice.mp3", mangled, content_type="audio/mpeg")

resp = client.post(
    "/api/voice-models/upload/",
    data={
        "display_name": "Corrupted Upload Test",
        "language": "english",
        "audio_file": upload,
    },
    HTTP_AUTHORIZATION=f"Bearer {token}",
)
print("status_code:", resp.status_code)
print(resp.content.decode(errors="ignore")[:1000])
