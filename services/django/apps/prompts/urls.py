from django.urls import path
from .views import (
    VoiceModelVersionListView,
    VoiceModelVersionUploadView,
    VoiceModelVersionActivateView,
    VoiceModelVersionDetailView,
    GenerationListView,
    GenerationDetailView,
    GenerationDownloadView,
    GenerationDeleteView,
)

urlpatterns = [
    # Voices
    path("voice-models/", VoiceModelVersionListView.as_view(), name="voice_model_list"),
    path("voice-models/upload/", VoiceModelVersionUploadView.as_view(), name="voice_model_upload"),
    path("voice-models/<uuid:pk>/activate/", VoiceModelVersionActivateView.as_view(), name="voice_model_activate"),
    path("voice-models/<uuid:pk>/", VoiceModelVersionDetailView.as_view(), name="voice_model_detail"),

    # Generations (history). Path kept as /prompts/ for API compatibility.
    path("prompts/", GenerationListView.as_view(), name="generation_list"),
    path("prompts/<uuid:pk>/", GenerationDetailView.as_view(), name="generation_detail"),
    path("prompts/<uuid:pk>/download/", GenerationDownloadView.as_view(), name="generation_download"),
    path("prompts/<uuid:pk>/delete/", GenerationDeleteView.as_view(), name="generation_delete"),
]
