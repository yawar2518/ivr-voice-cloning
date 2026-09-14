from django.urls import path
from .views import AuditLogListView

urlpatterns = [
    # GET /api/audit/
    path(
        "audit/",
        AuditLogListView.as_view(),
        name="audit_log_list"
    ),
]