from django.urls import path
from .views import (
    VoiceModelVersionListView,
    VoiceModelVersionUploadView,
    VoiceModelVersionActivateView,
    VoiceModelVersionDeleteView,
    VoicePromptListView,
    VoicePromptDetailView,
    VoicePromptApproveView,
    VoicePromptRejectView,
    VoicePromptExportView,
    VoicePromptDeleteView,
)

urlpatterns = [
    path("voice-models/", VoiceModelVersionListView.as_view(), name="voice_model_list"),
    path("voice-models/upload/", VoiceModelVersionUploadView.as_view(), name="voice_model_upload"),
    path("voice-models/<uuid:pk>/activate/", VoiceModelVersionActivateView.as_view(), name="voice_model_activate"),
    path("voice-models/<uuid:pk>/", VoiceModelVersionDeleteView.as_view(), name="voice_model_delete"),
    path("prompts/", VoicePromptListView.as_view(), name="voice_prompt_list"),
    path("prompts/<uuid:pk>/", VoicePromptDetailView.as_view(), name="voice_prompt_detail"),
    path("prompts/<uuid:pk>/approve/", VoicePromptApproveView.as_view(), name="voice_prompt_approve"),
    path("prompts/<uuid:pk>/reject/", VoicePromptRejectView.as_view(), name="voice_prompt_reject"),
    path("prompts/<uuid:pk>/export/", VoicePromptExportView.as_view(), name="voice_prompt_export"),
    path("prompts/<uuid:pk>/delete/", VoicePromptDeleteView.as_view(), name="voice_prompt_delete"),
]