from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth: register / token / refresh / verify
    path("api/auth/", include("apps.users.urls")),

    # Account: profile + internal credit deduction
    path("api/user/", include("apps.users.user_urls")),

    # Voice models + generations
    path("api/", include("apps.prompts.urls")),
]
