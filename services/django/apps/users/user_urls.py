from django.urls import path
from .views import CreditDeductView, ProfileView

# Mounted at /api/user/
urlpatterns = [
    path("profile/", ProfileView.as_view(), name="user_profile"),
    path("credits/deduct/", CreditDeductView.as_view(), name="user_credits_deduct"),
]
