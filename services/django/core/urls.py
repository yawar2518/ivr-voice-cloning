from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth endpoints — /api/auth/token/ etc.
    path("api/auth/", include("apps.users.urls")),

    # Prompts + voice models endpoints
    path("api/", include("apps.prompts.urls")),

    # Audit endpoints — added when we build the audit app
    # path("api/", include("apps.audit.urls")),
]