from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends SimpleJWT's default serializer to add custom claims
    to the JWT payload as required by API_CONTRACT.md Section 6.

    Default JWT payload only contains user_id.
    Our payload must also contain: username, email, role.

    Ahtesham reads these fields client-side by decoding the JWT —
    this eliminates a /api/me/ roundtrip on every page load.
    """

    @classmethod
    def get_token(cls, user) -> Token:
        # Start with the default token (contains user_id, exp, iat, jti)
        token = super().get_token(user)

        # Add our custom claims — must match contract Section 6 exactly
        # Field names, casing, and types must never change without a
        # contract amendment and Ahtesham's sign-off via GitHub PR
        token["username"] = user.username
        token["email"] = user.email
        token["role"] = user.role  # exact lowercase string: generator/approver/admin

        return token