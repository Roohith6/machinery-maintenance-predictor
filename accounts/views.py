"""
accounts/views.py
Login, logout, profile, user management (Admin only).
"""
import logging
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import CustomUser
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from .permissions import IsAdminRole, IsOperatorOrAdmin

logger = logging.getLogger('accounts')


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Body: { "username": "...", "password": "..." }
    Returns: access token, refresh token, user info with role.
    No authentication required (AllowAny).
    """
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        logger.info(
            f"Login attempt: {request.data.get('username', 'unknown')} "
            f"from IP: {request.META.get('REMOTE_ADDR')}"
        )
        return super().post(request, *args, **kwargs)


class TokenRefreshCustomView(TokenRefreshView):
    """
    POST /api/auth/token/refresh/
    Body: { "refresh": "..." }
    Returns new access token (silently, no re-login needed).
    """
    permission_classes = [AllowAny]


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Body: { "refresh": "..." }
    Blacklists the refresh token — user must login again to get new tokens.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'error': 'Refresh token is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            logger.info(f"Logout success: {request.user.username}")
            return Response({'message': 'Logged out successfully.'})

        except TokenError:
            return Response(
                {'error': 'Invalid or expired token.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Logout error for {request.user.username}: {str(e)}")
            return Response(
                {'error': 'Logout failed.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ProfileView(APIView):
    """
    GET /api/auth/profile/
    Returns the logged-in user's profile data.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/auth/users/   — Admin: list all users
    POST /api/auth/users/   — Admin: create new user
    """
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        return CustomUser.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        logger.info(
            f"Admin '{self.request.user.username}' created user: "
            f"'{user.username}' (role={user.role})"
        )

    def list(self, request, *args, **kwargs):
        logger.info(f"Admin '{request.user.username}' accessed user list")
        return super().list(request, *args, **kwargs)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/auth/users/<id>/   — Admin: view user
    PATCH  /api/auth/users/<id>/   — Admin: update user role/dept/status
    DELETE /api/auth/users/<id>/   — Admin: soft-delete (deactivate, not actual delete)
    """
    permission_classes = [IsAdminRole]
    queryset = CustomUser.objects.all()

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return UserUpdateSerializer
        return UserSerializer

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete — sets is_active=False instead of deleting.
        Preserves all PredictionLog foreign keys (audit trail).
        """
        user = self.get_object()
        if user == request.user:
            return Response(
                {'error': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.is_active = False
        user.save()
        logger.warning(
            f"Admin '{request.user.username}' deactivated user: '{user.username}'"
        )
        return Response({'message': f"User '{user.username}' has been deactivated."})

    def perform_update(self, serializer):
        user = serializer.save()
        logger.info(
            f"Admin '{self.request.user.username}' updated user: '{user.username}'"
        )