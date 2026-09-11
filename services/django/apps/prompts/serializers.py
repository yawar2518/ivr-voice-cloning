from rest_framework import serializers
from .models import VoiceModelVersion


class VoiceModelVersionSerializer(serializers.ModelSerializer):
    """
    Serializer for VoiceModelVersion model.
    
    Used by GET /api/voice-models/ to populate the model
    selector dropdown in Ahtesham's Generate page.
    
    See API_CONTRACT.md Section 10 for the exact response shape.
    """

    class Meta:
        model = VoiceModelVersion
        fields = [
            "id",
            "version_label",
            "provider",
            "model_variant",
            "is_active",
            "created_at",
        ]