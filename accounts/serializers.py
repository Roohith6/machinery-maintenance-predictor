"""
accounts/serializers.py
- CustomTokenObtainPairSerializer: adds role + username inside the JWT payload.
- UserSerializer: read-only profile data.
- UserCreateSerializer: admin creates new users.
- UserUpdateSerializer: admin updates existing users.
"""
import logging
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import CustomUser

logger = logging.getLogger('accounts')


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Overrides the default JWT serializer.
    Adds role, username, email inside the token so frontend
    can read role from the decoded JWT without an extra API call.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Custom claims embedded in JWT payload
        token['username'] = user.username
        token['role'] = user.role
        token['email'] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Add user info in the login response body
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'role': self.user.role,
            'department': self.user.department,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
        }
        logger.info(f"Login success: {self.user.username} (role={self.user.role})")
        return data


class UserSerializer(serializers.ModelSerializer):
    """Read-only user profile serializer."""

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'department', 'employee_id', 'phone',
            'is_active', 'created_at', 'last_login',
        ]
        read_only_fields = ['id', 'created_at', 'last_login']


class UserCreateSerializer(serializers.ModelSerializer):
    """Admin uses this to create a new user with a password."""
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = [
            'username', 'email', 'password', 'confirm_password',
            'first_name', 'last_name', 'role',
            'department', 'employee_id', 'phone',
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('confirm_password'):
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match.'}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        logger.info(f"User created: {user.username} (role={user.role})")
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Admin updates role, department, active status etc."""

    class Meta:
        model = CustomUser
        fields = [
            'email', 'first_name', 'last_name', 'role',
            'department', 'employee_id', 'phone', 'is_active',
        ]