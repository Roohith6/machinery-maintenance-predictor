# machines/admin.py
from django.contrib import admin
from .models import Machine


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = [
        'machine_id', 'name', 'machine_type',
        'current_health_status', 'location', 'department',
        'last_prediction_at', 'updated_at'
    ]
    list_filter = ['current_health_status', 'machine_type', 'is_active', 'location']
    search_fields = ['machine_id', 'name', 'department']
    ordering = ['machine_id']