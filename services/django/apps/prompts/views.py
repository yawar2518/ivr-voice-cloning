from rest_framework import generics
from .models import VoiceModelVersion
from .serializers import VoiceModelVersionSerializer


class VoiceModelVersionListView(generics.ListAPIView):
    """
    GET /api/voice-models/
    
    Returns all voice model versions.
    Ahtesham pre-selects the one where is_active === true.
    
    Auth required: Yes — any authenticated role.
    See API_CONTRACT.md Section 10.
    """

    serializer_class = VoiceModelVersionSerializer

    def get_queryset(self):
        # Return all versions, active first
        # For the case study there will always be exactly one active version
        return VoiceModelVersion.objects.all().order_by("-is_active", "-created_at")