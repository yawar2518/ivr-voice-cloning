import uuid
from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .models import VoicePrompt, VoiceModelVersion
from .serializers import (
    VoicePromptSerializer,
    VoiceModelVersionSerializer,
    VoicePromptApproveSerializer,
    VoicePromptRejectSerializer,
    VoicePromptExportSerializer,
)
from .storage import upload_file as upload_to_storage
from apps.audit.models import AuditLog
import boto3
import subprocess
import tempfile
import os
from celery.exceptions import TimeoutError as CeleryTimeoutError
from decouple import config

# How long POST /export/ blocks waiting for the worker before handing the
# client back to polling. See VoicePromptExportView.post.
EXPORT_WAIT_SECONDS = config("EXPORT_WAIT_SECONDS", default=20, cast=int)


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
        return VoiceModelVersion.objects.select_related("created_by").order_by(
            "-is_active", "-created_at"
        )


class VoiceModelVersionUploadView(APIView):
    """
    POST /api/voice-models/upload/
    Uploads a new reference voice clip, converts it to 44.1kHz WAV, stores it
    in MinIO/S3, and creates a VoiceModelVersion record for it.
    Admin only.
    """
    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        audio_file = request.FILES.get("audio_file")
        display_name = (request.data.get("display_name") or "").strip()
        language = (request.data.get("language") or "").strip()
        reference_text = (request.data.get("reference_text") or "").strip()

        errors = {}
        if not audio_file:
            errors["audio_file"] = ["This field is required."]
        if not display_name:
            errors["display_name"] = ["This field is required."]
        valid_languages = [choice[0] for choice in VoiceModelVersion.Language.choices]
        if not language:
            errors["language"] = ["This field is required."]
        elif language not in valid_languages:
            errors["language"] = [f"Must be one of: {', '.join(valid_languages)}."]

        if errors:
            return Response(
                {"error": "validation_error", "detail": errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        voice_id = uuid.uuid4()

        with tempfile.TemporaryDirectory() as tmpdir:
            upload_path = os.path.join(tmpdir, "upload_source")
            with open(upload_path, "wb") as dest:
                for chunk in audio_file.chunks():
                    dest.write(chunk)

            converted_path = os.path.join(tmpdir, "reference.wav")
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-v", "error",
                        "-i", upload_path,
                        "-ar", "44100",
                        "-ac", "1",
                        "-c:a", "pcm_s16le",
                        converted_path,
                    ],
                    check=True, capture_output=True,
                )
            except subprocess.CalledProcessError as e:
                detail = e.stderr.decode() if e.stderr else str(e)
                return Response(
                    {"error": "conversion_failed", "detail": f"FFmpeg failed: {detail}"},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY
                )

            s3_key = f"voices/reference/{voice_id}/reference.wav"
            upload_to_storage(converted_path, s3_key, content_type="audio/wav")

        voice_model = VoiceModelVersion.objects.create(
            id=voice_id,
            version_label="v1.0",
            provider="f5-tts",
            model_variant="zero-shot",
            reference_audio=s3_key,
            audio_s3_key=s3_key,
            display_name=display_name,
            language=language,
            reference_text=reference_text or None,
            is_active=False,
            created_by=request.user,
        )

        serializer = VoiceModelVersionSerializer(voice_model)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VoiceModelVersionActivateView(APIView):
    """
    POST /api/voice-models/{id}/activate/
    Makes this voice the active one, deactivating every other voice.
    Admin only.
    """
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        try:
            voice_model = VoiceModelVersion.objects.get(pk=pk)
        except VoiceModelVersion.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice model found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        VoiceModelVersion.objects.exclude(pk=pk).update(is_active=False)
        voice_model.is_active = True
        voice_model.save(update_fields=["is_active"])

        serializer = VoiceModelVersionSerializer(voice_model)
        return Response(serializer.data, status=status.HTTP_200_OK)


class VoiceModelVersionDeleteView(APIView):
    """
    DELETE /api/voice-models/{id}/
    Deletes a voice model. Cannot delete the currently active voice.
    Admin only.
    """
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            voice_model = VoiceModelVersion.objects.get(pk=pk)
        except VoiceModelVersion.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice model found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        if voice_model.is_active:
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": "Cannot delete the active voice model. Activate another voice first."
                },
                status=status.HTTP_409_CONFLICT
            )

        voice_model.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            "voice_model__created_by",
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
        "voice_model__created_by",
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
        async_result = celery_app.send_task(
            "tts_worker.tasks.export_prompt",
            args=[str(prompt.id), prompt.audio_s3_key],
        )

        # Wait briefly for the conversion. Transcoding an already-generated WAV
        # down to 8 kHz takes well under a second, so the normal case resolves
        # here and the caller gets a usable link in the POST response. The
        # worker runs at concurrency 1 and shares its queue with GPU
        # generation, so the wait is bounded: if a long generation is ahead of
        # us in the queue we fall through and let the client poll the prompt
        # detail endpoint, which serves the same pre-signed link once ready.
        try:
            async_result.get(timeout=EXPORT_WAIT_SECONDS, propagate=False)
        except CeleryTimeoutError:
            pass
        except Exception:
            # A broker/result-backend problem must not fail an export that the
            # worker may still complete — fall through to the polling path.
            pass

        prompt.refresh_from_db()

        # Log to audit
        AuditLog.objects.create(
            action="export",
            prompt_id=prompt.id,
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
            before_status="approved",
            after_status=prompt.status,
        )

        serializer = VoicePromptExportSerializer(prompt)
        return Response(serializer.data, status=status.HTTP_200_OK)


class VoicePromptDeleteView(APIView):
    """
    DELETE /api/prompts/{id}/
    Deletes a prompt that is in draft, failed, or rejected status.
    Admin only.
    Per contract role permission matrix Section 6.
    """
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            prompt = VoicePrompt.objects.get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": "No voice prompt found with this ID."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Only allow deletion of safe states
        deletable_states = ["draft", "failed", "rejected"]
        if prompt.status not in deletable_states:
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": f"Cannot delete a prompt with status '{prompt.status}'. Only draft, failed, and rejected prompts can be deleted."
                },
                status=status.HTTP_409_CONFLICT
            )

        # Log to audit before deleting
        AuditLog.objects.create(
            action="generate",
            prompt_id=prompt.id,
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
            before_status=prompt.status,
            after_status="deleted",
            detail={"text": prompt.text[:100]}
        )

        prompt.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)