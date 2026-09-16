from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token

from .models import User, default_credits_reset_date


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Adds plan claims to the JWT so the frontend can render the sidebar and
    credit meter straight from the token. Credits drift as the user
    generates, so the UI refreshes them from GET /api/user/profile/.
    """

    def validate(self, attrs):
        # Let people sign in with the email they registered with as well as
        # their username; SimpleJWT itself only understands usernames.
        identifier = (attrs.get(self.username_field) or "").strip()
        if "@" in identifier:
            match = User.objects.filter(email__iexact=identifier).only("username").first()
            if match:
                attrs[self.username_field] = match.username
        return super().validate(attrs)

    @classmethod
    def get_token(cls, user) -> Token:
        token = super().get_token(user)
        token["username"] = user.username
        token["email"] = user.email
        token["tier"] = user.tier
        token["credits_remaining"] = user.credits_remaining
        token["credits_limit"] = user.credits_limit
        token["voice_clone_limit"] = user.voice_clone_limit
        return token


def tokens_for_user(user):
    refresh = CustomTokenObtainPairSerializer.get_token(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterSerializer(serializers.Serializer):
    """POST /api/auth/register/"""

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": ["Passwords do not match."]}
            )
        probe = User(username=attrs["username"], email=attrs["email"])
        try:
            validate_password(attrs["password"], user=probe)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            tier=User.Tier.FREE,
            credits_used=0,
            credits_reset_date=default_credits_reset_date(),
        )


class UserProfileSerializer(serializers.ModelSerializer):
    """GET/PATCH /api/user/profile/ — plan fields are read-only."""

    credits_limit = serializers.IntegerField(read_only=True)
    credits_remaining = serializers.IntegerField(read_only=True)
    voice_clone_limit = serializers.IntegerField(read_only=True)
    voices_used = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "tier",
            "credits_used",
            "credits_limit",
            "credits_remaining",
            "voice_clone_limit",
            "voices_used",
            "date_joined",
            "credits_reset_date",
        ]
        read_only_fields = ["id", "tier", "credits_used", "date_joined", "credits_reset_date"]

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value


class CreditDeductSerializer(serializers.Serializer):
    """PATCH /api/user/credits/deduct/ (internal)."""

    user_id = serializers.IntegerField()
    amount = serializers.IntegerField(min_value=1)
