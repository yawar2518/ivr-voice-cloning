import hmac

from django.conf import settings
from django.db import transaction
from django.db.models import F
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from apps.audit.models import AuditLog
from apps.audit.services import record as audit
from .models import User
from .serializers import (
    CreditDeductSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    tokens_for_user,
)


# ─── Auth ──────────────────────────────────────────────────────────────────

class CustomTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/token/ — login. Returns { access, refresh }."""
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            identifier = (request.data.get("username") or "").strip()
            user = User.objects.filter(username__iexact=identifier).first()
            if user is None and "@" in identifier:
                user = User.objects.filter(email__iexact=identifier).first()
            audit(AuditLog.Action.LOGIN, user, request)
        return response


class CustomTokenRefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/"""


class CustomTokenVerifyView(TokenVerifyView):
    """POST /api/auth/token/verify/"""


class RegisterView(APIView):
    """
    POST /api/auth/register/ — public signup.
    Body: { username, email, password, confirm_password }
    Creates a free-tier account and returns the same token pair as login,
    so the client can go straight to the dashboard.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "validation_error", "detail": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = serializer.save()
        audit(AuditLog.Action.REGISTER, user, request, detail={"email": user.email, "tier": user.tier})
        return Response(
            {
                **tokens_for_user(user),
                "user": UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ─── Profile ───────────────────────────────────────────────────────────────

class ProfileView(APIView):
    """
    GET   /api/user/profile/ — the account, plan and credit usage of the caller.
    PATCH /api/user/profile/ — update username / email. Plan fields are
    system controlled and silently ignored if sent.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)

    def patch(self, request):
        allowed = {k: v for k, v in request.data.items() if k in ("username", "email")}
        serializer = UserProfileSerializer(request.user, data=allowed, partial=True)
        if not serializer.is_valid():
            return Response(
                {"error": "validation_error", "detail": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        before = {"username": request.user.username, "email": request.user.email}
        serializer.save()
        audit(AuditLog.Action.PROFILE_UPDATE, request.user, request, detail={"before": before, "after": allowed})
        return Response(serializer.data)


# ─── Internal credit deduction ─────────────────────────────────────────────

LOOPBACK_ADDRESSES = {"127.0.0.1", "::1", "localhost"}


def _is_internal_request(request) -> bool:
    """
    The FastAPI generation service calls this endpoint server-to-server.
    Accept either the shared INTERNAL_API_TOKEN header or a loopback origin
    (useful when everything runs on one host without the env var set).
    """
    provided = request.headers.get("X-Internal-Token", "")
    expected = getattr(settings, "INTERNAL_API_TOKEN", "") or ""
    if expected and provided and hmac.compare_digest(provided, expected):
        return True
    return request.META.get("REMOTE_ADDR") in LOOPBACK_ADDRESSES


class CreditDeductView(APIView):
    """
    PATCH /api/user/credits/deduct/ — internal use only.
    Body: { user_id, amount }
    Atomically adds `amount` to credits_used, refusing (402) when the user
    does not have that many credits left. Returns the updated balance.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def patch(self, request):
        if not _is_internal_request(request):
            return Response(
                {"error": "permission_denied", "detail": "Internal endpoint."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CreditDeductSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "validation_error", "detail": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_id = serializer.validated_data["user_id"]
        amount = serializer.validated_data["amount"]

        with transaction.atomic():
            try:
                user = User.objects.select_for_update().get(pk=user_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "not_found", "detail": "No user found with this ID."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if user.credits_remaining < amount:
                return Response(
                    {
                        "error": "insufficient_credits",
                        "detail": "Not enough credits. Upgrade your plan.",
                        "credits_remaining": user.credits_remaining,
                        "credits_limit": user.credits_limit,
                    },
                    status=status.HTTP_402_PAYMENT_REQUIRED,
                )
            User.objects.filter(pk=user.pk).update(credits_used=F("credits_used") + amount)
            user.refresh_from_db(fields=["credits_used"])

        audit(
            AuditLog.Action.GENERATE,
            user,
            request,
            prompt_id=request.data.get("prompt_id") or None,
            after="processing",
            detail={"credits_charged": amount, "credits_remaining": user.credits_remaining},
        )

        return Response(
            {
                "user_id": user.pk,
                "credits_used": user.credits_used,
                "credits_limit": user.credits_limit,
                "credits_remaining": user.credits_remaining,
            }
        )
