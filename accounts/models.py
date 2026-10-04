"""
accounts/models.py
Custom User model — has a 'role' field (admin/operator).
AUTH_USER_MODEL = 'accounts.CustomUser' is already set in settings.py.
"""
import logging
from django.contrib.auth.models import AbstractUser
from django.db import models

logger = logging.getLogger('accounts')


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('operator', 'Operator'),
    ]
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='operator',
        db_index=True
    )
    department = models.CharField(max_length=100, blank=True, default='')
    employee_id = models.CharField(max_length=50, blank=True, default='')
    phone = models.CharField(max_length=15, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.username} ({self.role})"

    def is_admin_role(self):
        return self.role == 'admin'

    def is_operator_role(self):
        return self.role == 'operator'