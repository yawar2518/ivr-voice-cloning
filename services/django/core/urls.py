from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth endpoints
    path("api/auth/", include("apps.users.urls")),

    # Prompts + voice models endpoints
    path("api/", include("apps.prompts.urls")),

    # Audit endpoints
    path("api/", include("apps.audit.urls")),
]