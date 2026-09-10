from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from .serializers import CustomTokenObtainPairSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    POST /api/auth/token/
    
    Overrides the default SimpleJWT login view to use our
    CustomTokenObtainPairSerializer, which adds role, username,
    and email to the JWT payload per API_CONTRACT.md Section 8.

    Request:  { "username": "sara", "password": "correct-password" }
    Response: { "access": "<token>", "refresh": "<token>" }
    """
    serializer_class = CustomTokenObtainPairSerializer


# These two views need no customization — SimpleJWT handles them fully.
# We import and re-export them here so all auth views come from one place.

class CustomTokenRefreshView(TokenRefreshView):
    """
    POST /api/auth/token/refresh/

    Request:  { "refresh": "<token>" }
    Response: { "access": "<token>" }
    """
    pass


class CustomTokenVerifyView(TokenVerifyView):
    """
    POST /api/auth/token/verify/

    Request:  { "token": "<token>" }
    Response: {} (empty 200 means valid)
    """
    pass