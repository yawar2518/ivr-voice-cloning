from django.urls import path
from .views import (
    VoiceModelVersionListView,
    VoicePromptListView,
    VoicePromptDetailView,
    VoicePromptApproveView,
    VoicePromptRejectView,
    VoicePromptExportView,
)

urlpatterns = [
    # GET /api/voice-models/
    path(
        "voice-models/",
        VoiceModelVersionListView.as_view(),
        name="voice_model_list"
    ),

    # GET /api/prompts/
    path(
        "prompts/",
        VoicePromptListView.as_view(),
        name="voice_prompt_list"
    ),

    # GET /api/prompts/{id}/
    path(
        "prompts/<uuid:pk>/",
        VoicePromptDetailView.as_view(),
        name="voice_prompt_detail"
    ),

    # POST /api/prompts/{id}/approve/
    path(
        "prompts/<uuid:pk>/approve/",
        VoicePromptApproveView.as_view(),
        name="voice_prompt_approve"
    ),

    # POST /api/prompts/{id}/reject/
    path(
        "prompts/<uuid:pk>/reject/",
        VoicePromptRejectView.as_view(),
        name="voice_prompt_reject"
    ),

    # POST /api/prompts/{id}/export/
    path(
        "prompts/<uuid:pk>/export/",
        VoicePromptExportView.as_view(),
        name="voice_prompt_export"
    ),
]