"""
accounts/permissions.py
RBAC permission classes — enforced at API level on every endpoint.
These are used as permission_classes=[...] in every DRF APIView.
"""
import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger('accounts')


class IsAdminRole(BasePermission):
    """Only users with role='admin' can access."""
    message = 'Access restricted to Admin role only.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            logger.warning(
                f"Unauthenticated access attempt to admin endpoint: {request.path}"
            )
            return False
        is_admin = request.user.role == 'admin'
        if not is_admin:
            logger.warning(
                f"Unauthorized admin access by: {request.user.username} "
                f"(role={request.user.role}) on {request.path}"
            )
        return is_admin


class IsOperatorOrAdmin(BasePermission):
    """Both 'operator' and 'admin' roles can access."""
    message = 'Must be Operator or Admin.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            logger.warning(
                f"Unauthenticated access attempt: {request.path}"
            )
            return False
        return request.user.role in ['admin', 'operator']