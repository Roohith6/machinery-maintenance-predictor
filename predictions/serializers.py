"""
predictions/serializers.py
- PredictionInputSerializer: validates the 6 sensor fields from request body.
- PredictionLogSerializer: formats PredictionLog rows for API responses.
"""
from rest_framework import serializers
from .models import PredictionLog


class PredictionInputSerializer(serializers.Serializer):
    """
    Validates POST body for /api/predictions/predict/
    Column order must match training dataset:
    Type, Air temp, Process temp, RPM, Torque, Tool wear
    """
    machine_id = serializers.CharField(
        max_length=20, required=False, default='M-001'
    )
    machine_type = serializers.ChoiceField(choices=['L', 'M', 'H'])
    air_temperature = serializers.FloatField(
        min_value=290.0, max_value=320.0,
        help_text='Kelvin, typical range 295-305'
    )
    process_temperature = serializers.FloatField(
        min_value=300.0, max_value=320.0,
        help_text='Kelvin, typical range 306-314'
    )
    rotational_speed = serializers.IntegerField(
        min_value=500, max_value=3000,
        help_text='RPM, typical range 1168-2886'
    )
    torque = serializers.FloatField(
        min_value=1.0, max_value=100.0,
        help_text='Nm, typical range 3.8-76.6'
    )
    tool_wear = serializers.IntegerField(
        min_value=0, max_value=300,
        help_text='minutes, typical range 0-253'
    )


class PredictionLogSerializer(serializers.ModelSerializer):
    """Serializes PredictionLog for history and alert API responses."""
    username = serializers.CharField(source='user.username', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = PredictionLog
        fields = [
            'id', 'username', 'user_role', 'machine_id',
            'machine_type', 'air_temperature', 'process_temperature',
            'rotational_speed', 'torque', 'tool_wear',
            'predicted_failure', 'failure_type', 'health_status',
            'inference_time_ms', 'created_at',
        ]
        read_only_fields = fields