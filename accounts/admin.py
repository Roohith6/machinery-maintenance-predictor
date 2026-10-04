# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = [
        'username', 'email', 'role', 'department',
        'employee_id', 'is_active', 'created_at'
    ]
    list_filter = ['role', 'is_active', 'department']
    search_fields = ['username', 'email', 'employee_id']
    ordering = ['-created_at']
    fieldsets = UserAdmin.fieldsets + (
        ('PM Dashboard Info', {
            'fields': ('role', 'department', 'employee_id', 'phone')
        }),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('PM Dashboard Info', {
            'fields': ('role', 'department', 'employee_id', 'phone')
        }),
    )