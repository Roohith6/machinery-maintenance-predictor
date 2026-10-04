# machines/serializers.py
from rest_framework import serializers
from .models import Machine


class MachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'machine_type',
            'location', 'department', 'current_health_status',
            'last_prediction_at', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']