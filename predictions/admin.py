# predictions/admin.py
from django.contrib import admin
from .models import PredictionLog


@admin.register(PredictionLog)
class PredictionLogAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'machine_id', 'user', 'failure_type',
        'predicted_failure', 'health_status', 'inference_time_ms', 'created_at'
    ]
    list_filter = ['predicted_failure', 'failure_type', 'health_status', 'machine_type']
    search_fields = ['machine_id', 'user__username']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'raw_input', 'raw_output']