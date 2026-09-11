from django.urls import path
from .views import VoiceModelVersionListView

urlpatterns = [
    # GET /api/voice-models/ — list all voice model versions
    path(
        "voice-models/",
        VoiceModelVersionListView.as_view(),
        name="voice_model_list"
    ),
]