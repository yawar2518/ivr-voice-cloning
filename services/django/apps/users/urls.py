from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    CustomTokenVerifyView,
)

urlpatterns = [
    # POST /api/auth/token/ — login
    path(
        "token/",
        CustomTokenObtainPairView.as_view(),
        name="token_obtain_pair"
    ),

    # POST /api/auth/token/refresh/ — get new access token
    path(
        "token/refresh/",
        CustomTokenRefreshView.as_view(),
        name="token_refresh"
    ),

    # POST /api/auth/token/verify/ — check token is valid
    path(
        "token/verify/",
        CustomTokenVerifyView.as_view(),
        name="token_verify"
    ),
]