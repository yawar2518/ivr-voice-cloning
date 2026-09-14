from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import VoicePrompt, VoiceModelVersion
from .serializers import (
    VoicePromptSerializer,
    VoiceModelVersionSerializer,
    VoicePromptApproveSerializer,
    VoicePromptRejectSerializer,
    VoicePromptExportSerializer,
)
from apps.audit.models import AuditLog
import boto3
import subprocess
import tempfile
import os
from decouple import config


# ─── Permissions ───────────────────────────────────────────────────────────

class IsApproverOrAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role in ["approver", "admin"]


class IsAdminRole(IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role == "admin"


# ─── Voice Model Versions ──────────────────────────────────────────────────

class VoiceModelVersionListView(generics.ListAPIView):
    """
    GET /api/voice-models/
    Returns all voice model versions.
    Auth: any authenticated role.
    """
    serializer_class = VoiceModelVersionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return VoiceModelVersion.objects.all().order_by(
            "-is_active", "-created_at"
        )


# ─── Prompt List ───────────────────────────────────────────────────────────

class VoicePromptListView(generics.ListAPIView):
    """
    GET /api/prompts/
    Lists all prompts with filtering, search, ordering, pagination.
    Auth: any authenticated role.
    Per contract Section 10.
    """
    serializer_class = VoicePromptSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["text"]
    ordering_fields = ["created_at", "updated_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = VoicePrompt.objects.select_related(
            "voice_model",
            "created_by",
            "approved_by",
            "rejected_by",
            "exported_by",
        )

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by created_by
        created_by = self.request.query_params.get("created_by")
        if created_by:
            queryset = queryset.filter(created_by_id=created_by)

        return queryset


# ─── Prompt Detail ─────────────────────────────────────────────────────────

class VoicePromptDetailView(generics.RetrieveAPIView):
    """
    GET /api/prompts/{id}/
    Returns a single prompt by UUID.
    Auth: any authenticated role.
    Per contract Section 10.
    """
    serializer_class = VoicePromptSerializer
    permission_classes = [IsAuthenticated]
    queryset = VoicePrompt.objects.select_related(
        "voice_model",
        "created_by",
        "approved_by",
        "rejected_by",
        "exported_by",
    )

    def get_object(self):
        try:
            return super().get_object()
        except VoicePrompt.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(
                {"error": "not_found", "detail": "No voice prompt found with this ID."}
            )


# ─── Approve ───────────────────────────────────────────────────────────────

class VoicePromptApproveView(APIView):
    """
    POST /api/prompts/{id}/approve/
    Marks a ready prompt as approved.
    Auth: approver, admin.
    Per contract Section 10.
    """
    permission_classes = [IsApproverOrAdmin]

    def post(self, request, pk):
        try:
            prompt = VoicePrompt.objects.get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice prompt found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        if prompt.status != "ready":
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": f"Cannot approve a prompt with status '{prompt.status}'. Prompt must be 'ready'."
                },
                status=status.HTTP_409_CONFLICT
            )

        prompt.status = "approved"
        prompt.approved_by = request.user
        prompt.approved_at = timezone.now()
        prompt.save()

        # Log to audit
        AuditLog.objects.create(
            action="approve",
            prompt_id=prompt.id,
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
            before_status="ready",
            after_status="approved",
        )

        serializer = VoicePromptApproveSerializer(prompt)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─── Reject ────────────────────────────────────────────────────────────────

class VoicePromptRejectView(APIView):
    """
    POST /api/prompts/{id}/reject/
    Marks a ready prompt as rejected with a reason.
    Auth: approver, admin.
    Per contract Section 10.
    """
    permission_classes = [IsApproverOrAdmin]

    def post(self, request, pk):
        try:
            prompt = VoicePrompt.objects.get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice prompt found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        if prompt.status != "ready":
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": f"Cannot reject a prompt with status '{prompt.status}'. Prompt must be 'ready'."
                },
                status=status.HTTP_409_CONFLICT
            )

        reason = request.data.get("reason", "").strip()
        if not reason:
            return Response(
                {"error": "validation_error", "detail": {"reason": ["This field is required."]}},
                status=status.HTTP_400_BAD_REQUEST
            )

        prompt.status = "rejected"
        prompt.rejected_by = request.user
        prompt.rejected_at = timezone.now()
        prompt.error_detail = reason
        prompt.save()

        # Log to audit
        AuditLog.objects.create(
            action="reject",
            prompt_id=prompt.id,
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
            before_status="ready",
            after_status="rejected",
            detail={"reason": reason},
        )

        serializer = VoicePromptRejectSerializer(prompt)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─── Export ────────────────────────────────────────────────────────────────

class VoicePromptExportView(APIView):
    """
    POST /api/prompts/{id}/export/
    Queues an export Celery task — converts approved audio to IVR format.
    Admin only. Per contract Section 10.
    """
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        try:
            prompt = VoicePrompt.objects.get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice prompt found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        if prompt.status != "approved":
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": f"Cannot export a prompt with status '{prompt.status}'. Prompt must be 'approved'."
                },
                status=status.HTTP_409_CONFLICT
            )

        if not prompt.audio_s3_key:
            return Response(
                {"error": "generation_failed", "detail": "No audio file found for this prompt."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        # Update prompt fields before queuing
        prompt.exported_by = request.user
        prompt.exported_at = timezone.now()
        prompt.save()

        # Queue export task to worker where FFmpeg is available
        from celery import Celery
        from decouple import config as dconfig
        celery_app = Celery(
            "ivr_voice",
            broker=dconfig("REDIS_URL", default="redis://redis:6379/0"),
            backend=dconfig("REDIS_URL", default="redis://redis:6379/0")
        )
        celery_app.send_task(
            "tts_worker.tasks.export_prompt",
            args=[str(prompt.id), prompt.audio_s3_key],
        )

        # Log to audit
        AuditLog.objects.create(
            action="export",
            prompt_id=prompt.id,
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
            before_status="approved",
            after_status="live",
        )

        return Response(
            {
                "id": str(prompt.id),
                "status": "live",
                "exported_by": {"id": request.user.id, "username": request.user.username},
                "exported_at": prompt.exported_at.isoformat(),
                "export_download_url": "Export processing — check prompt status in 10 seconds"
            },
            status=status.HTTP_200_OK
        )