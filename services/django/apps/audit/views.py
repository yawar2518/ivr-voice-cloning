from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from .models import AuditLog
from .serializers import AuditLogSerializer


class IsAdminRole(IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role == "admin"


class AuditLogListView(generics.ListAPIView):
    """
    GET /api/audit/
    Returns all audit log entries.
    Admin only — per contract Section 11.

    Query params:
    - action: filter by action type
    - performed_by: filter by user ID
    - prompt_id: filter by prompt UUID
    - ordering: default -timestamp
    - page, page_size: pagination
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["timestamp", "action"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("performed_by")

        # Filter by action
        action = self.request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        # Filter by performed_by
        performed_by = self.request.query_params.get("performed_by")
        if performed_by:
            queryset = queryset.filter(performed_by_id=performed_by)

        # Filter by prompt_id
        prompt_id = self.request.query_params.get("prompt_id")
        if prompt_id:
            queryset = queryset.filter(prompt_id=prompt_id)

        return queryset