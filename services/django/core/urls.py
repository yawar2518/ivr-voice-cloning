from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth endpoints — /api/auth/token/ etc.
    # Will be added when we build the users app
]