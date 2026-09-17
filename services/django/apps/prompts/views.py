import os
import subprocess
import tempfile
import uuid

from django.db.models import Q
from django.http import HttpResponseRedirect
from rest_framework import filters, generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import record as audit
from core import celery_app
from .models import VoiceModelVersion, VoicePrompt
from .serializers import GenerationSerializer, VoiceModelVersionSerializer
from .storage import (
    delete_file as delete_from_storage,
    download_file,
    presigned_url,
    upload_file,
    upload_fileobj,
)

# Languages the worker can auto-transcribe (English only — Whisper's native
# script output for Urdu/Hindi would not match the Romanised text this app
# expects). Every other language needs a typed transcript at upload time.
AUTO_TRANSCRIBE_LANGUAGES = {"english"}

VOICE_PROVIDER = "f5-tts"
VOICE_MODEL_VARIANT = "zero-shot"
VOICE_VERSION_LABEL = "v1.0"


def _not_found(what="voice model"):
    return Response(
        {"error": "not_found", "detail": f"No {what} found with this ID."},
        status=status.HTTP_404_NOT_FOUND,
    )


def _visible_voices(user):
    """Voices a user can see and use: platform defaults plus their own."""
    return VoiceModelVersion.objects.filter(Q(is_default=True) | Q(created_by=user))


# ─── Voices ────────────────────────────────────────────────────────────────

class VoiceModelVersionListView(generics.ListAPIView):
    """
    GET /api/voice-models/
    Default voices first, then the caller's own clones, newest first.
    """
    serializer_class = VoiceModelVersionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            _visible_voices(self.request.user)
            .select_related("created_by")
            .order_by("-is_default", "-created_at")
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        user = request.user
        return Response(
            {
                "count": len(serializer.data),
                "results": serializer.data,
                "voices_used": user.voices_used,
                "voice_clone_limit": user.voice_clone_limit,
            }
        )


class VoiceModelVersionUploadView(APIView):
    """
    POST /api/voice-models/upload/  (multipart)
    Fields: audio_file, display_name, language, reference_text (optional for
    English, required otherwise).
    Stages the raw clip in S3, creates the row in 'processing' and hands the
    conversion / trim / transcription to the worker. 202 on success; poll
    GET /api/voice-models/{id}/ for status.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = request.user
        if user.voices_used >= user.voice_clone_limit:
            return Response(
                {
                    "error": "voice_limit_reached",
                    "detail": "Upgrade your plan to add more voices.",
                    "voices_used": user.voices_used,
                    "voice_clone_limit": user.voice_clone_limit,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

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
        elif language not in AUTO_TRANSCRIBE_LANGUAGES and not reference_text:
            errors["reference_text"] = [
                "Required for this language — automatic transcription is "
                "English-only. Type the exact words spoken in the clip."
            ]
        if errors:
            return Response(
                {"error": "validation_error", "detail": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        voice_id = uuid.uuid4()
        s3_key = f"voices/staging/{voice_id}/{audio_file.name}"
        upload_fileobj(audio_file, s3_key, content_type=audio_file.content_type)

        voice_model = VoiceModelVersion.objects.create(
            id=voice_id,
            version_label=VOICE_VERSION_LABEL,
            provider=VOICE_PROVIDER,
            model_variant=VOICE_MODEL_VARIANT,
            reference_audio=None,
            audio_s3_key=None,
            staging_s3_key=s3_key,
            display_name=display_name,
            language=language,
            reference_text=reference_text or None,
            is_active=False,
            is_default=False,
            status=VoiceModelVersion.Status.PROCESSING,
            created_by=user,
        )

        async_result = celery_app.send_task(
            "tts_worker.tasks.process_voice_upload",
            args=[str(voice_id), s3_key],
        )
        voice_model.celery_task_id = async_result.id
        voice_model.save(update_fields=["celery_task_id"])

        audit(
            AuditLog.Action.VOICE_UPLOAD,
            user,
            request,
            after="processing",
            detail={"voice_id": str(voice_id), "display_name": display_name, "language": language},
        )

        serializer = VoiceModelVersionSerializer(voice_model, context={"request": request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class VoiceModelVersionActivateView(APIView):
    """
    POST /api/voice-models/{id}/activate/
    Marks a voice as the caller's preferred voice. Only one of the caller's
    own clones is active at a time; default voices are shared and simply
    become active without touching other accounts.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            voice_model = _visible_voices(request.user).get(pk=pk)
        except VoiceModelVersion.DoesNotExist:
            return _not_found()

        if voice_model.status != VoiceModelVersion.Status.READY:
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": f"Cannot activate a voice with status '{voice_model.status}'. "
                              f"Voice must be 'ready'.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        VoiceModelVersion.objects.filter(created_by=request.user, is_default=False).exclude(
            pk=pk
        ).update(is_active=False)
        voice_model.is_active = True
        voice_model.save(update_fields=["is_active"])

        serializer = VoiceModelVersionSerializer(voice_model, context={"request": request})
        return Response(serializer.data)


class VoiceModelVersionDetailView(APIView):
    """
    GET    /api/voice-models/{id}/ — poll one voice (status while processing).
    DELETE /api/voice-models/{id}/ — delete one of the caller's own clones.
    Default voices can never be deleted.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            voice_model = _visible_voices(request.user).get(pk=pk)
        except VoiceModelVersion.DoesNotExist:
            return _not_found()
        serializer = VoiceModelVersionSerializer(voice_model, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            voice_model = _visible_voices(request.user).get(pk=pk)
        except VoiceModelVersion.DoesNotExist:
            return _not_found()

        if voice_model.is_default:
            return Response(
                {"error": "cannot_delete_default", "detail": "Default voices cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if voice_model.created_by_id != request.user.id:
            return Response(
                {"error": "permission_denied", "detail": "You can only delete your own voices."},
                status=status.HTTP_403_FORBIDDEN,
            )

        for s3_key in {voice_model.staging_s3_key, voice_model.audio_s3_key}:
            try:
                delete_from_storage(s3_key)
            except Exception as exc:  # best effort — never block the delete
                print(f"Failed to delete S3 object {s3_key!r} for voice {pk}: {exc}")

        audit(
            AuditLog.Action.VOICE_DELETE,
            request.user,
            request,
            before=voice_model.status,
            after="deleted",
            detail={"voice_id": str(voice_model.id), "display_name": voice_model.display_name},
        )
        voice_model.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Generations (history) ─────────────────────────────────────────────────

def _own_generations(user):
    return VoicePrompt.objects.filter(created_by=user).select_related(
        "voice_model", "created_by"
    )


class GenerationListView(generics.ListAPIView):
    """
    GET /api/prompts/
    The caller's own generation history, newest first. Supports
    ?status=, ?search= (text), ?ordering=, ?page=, ?page_size=.
    """
    serializer_class = GenerationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["text"]
    ordering_fields = ["created_at", "updated_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = _own_generations(self.request.user)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")

    def paginate_queryset(self, queryset):
        page_size = self.request.query_params.get("page_size")
        if page_size and self.paginator:
            try:
                self.paginator.page_size = max(1, min(int(page_size), 100))
            except ValueError:
                pass
        return super().paginate_queryset(queryset)


class GenerationDetailView(generics.RetrieveAPIView):
    """GET /api/prompts/{id}/ — one of the caller's generations."""
    serializer_class = GenerationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _own_generations(self.request.user)

    def get_object(self):
        try:
            return super().get_object()
        except Exception:
            raise NotFound({"error": "not_found", "detail": "No generation found with this ID."})


def _transcode_to_mp3(prompt):
    """
    Download the WAV master, encode it to MP3 with FFmpeg, upload next to the
    master and remember the key so later downloads skip the transcode.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = os.path.join(tmpdir, "master.wav")
        mp3_path = os.path.join(tmpdir, "audio.mp3")
        download_file(prompt.audio_s3_key, wav_path)
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-i", wav_path,
                "-codec:a", "libmp3lame",
                "-q:a", "2",
                mp3_path,
            ],
            check=True,
            capture_output=True,
        )
        mp3_key = f"voices/v1.0/{prompt.id}/audio.mp3"
        upload_file(mp3_path, mp3_key, content_type="audio/mpeg")

    prompt.mp3_s3_key = mp3_key
    prompt.save(update_fields=["mp3_s3_key"])
    return mp3_key


class GenerationDownloadView(APIView):
    """
    GET /api/prompts/{id}/download/?format=mp3|wav
    Redirects (302) to a short-lived S3 link that forces a file download.
    Pass ?as=json to receive {"download_url": ...} instead of a redirect —
    handy for browser clients that need to open the link themselves.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            prompt = _own_generations(request.user).get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return _not_found("generation")

        fmt = (request.query_params.get("format") or "wav").lower()
        if fmt not in ("wav", "mp3"):
            return Response(
                {"error": "validation_error", "detail": {"format": ["Must be 'mp3' or 'wav'."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if prompt.status != VoicePrompt.Status.READY or not prompt.audio_s3_key:
            return Response(
                {"error": "not_ready", "detail": "Audio is not ready for download yet."},
                status=status.HTTP_409_CONFLICT,
            )

        if fmt == "wav":
            key, content_type = prompt.audio_s3_key, "audio/wav"
        else:
            try:
                key = prompt.mp3_s3_key or _transcode_to_mp3(prompt)
            except subprocess.CalledProcessError as exc:
                detail = exc.stderr.decode(errors="ignore") if exc.stderr else str(exc)
                return Response(
                    {"error": "transcode_failed", "detail": f"MP3 conversion failed: {detail[:300]}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            content_type = "audio/mpeg"

        filename = f"voiceclone_{str(prompt.id)[:8]}.{fmt}"
        url = presigned_url(key, download_as=filename, content_type=content_type)

        if request.query_params.get("as") == "json":
            return Response({"download_url": url, "format": fmt, "filename": filename})
        return HttpResponseRedirect(url)


class GenerationDeleteView(APIView):
    """
    DELETE /api/prompts/{id}/delete/
    Removes one of the caller's generations and its audio files. A
    generation that is still processing cannot be deleted.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            prompt = _own_generations(request.user).get(pk=pk)
        except VoicePrompt.DoesNotExist:
            return _not_found("generation")

        if prompt.status == VoicePrompt.Status.PROCESSING:
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": "This generation is still processing. Wait for it to finish.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        for s3_key in {prompt.audio_s3_key, prompt.mp3_s3_key, prompt.export_s3_key}:
            try:
                delete_from_storage(s3_key)
            except Exception as exc:  # best effort
                print(f"Failed to delete S3 object {s3_key!r} for generation {pk}: {exc}")

        audit(
            AuditLog.Action.DELETE,
            request.user,
            request,
            prompt_id=prompt.id,
            before=prompt.status,
            after="deleted",
            detail={"text": (prompt.text or "")[:100], "credits_charged": prompt.credits_charged},
        )
        prompt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
