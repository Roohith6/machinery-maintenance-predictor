"""
predictions/models.py
PredictionLog — stores every SageMaker call result.
Used for: prediction history, failure alerts, admin charts.
"""
import logging
from django.db import models
from accounts.models import CustomUser

logger = logging.getLogger('predictions')

FAILURE_TYPE_CHOICES = [
    ('No Failure', 'No Failure'),
    ('Tool Wear Failure', 'Tool Wear Failure'),
    ('Heat Dissipation Failure', 'Heat Dissipation Failure'),
    ('Power Failure', 'Power Failure'),
    ('Overstrain Failure', 'Overstrain Failure'),
    ('Random Failures', 'Random Failures'),
    ('Unknown', 'Unknown'),
]

MACHINE_TYPE_CHOICES = [
    ('L', 'Low (L)'),
    ('M', 'Medium (M)'),
    ('H', 'High (H)'),
]

HEALTH_STATUS_CHOICES = [
    ('healthy', 'Healthy'),
    ('at_risk', 'At Risk'),
    ('critical', 'Critical'),
]


class PredictionLog(models.Model):
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        related_name='predictions'
    )
    machine_id = models.CharField(max_length=20, default='UNKNOWN', db_index=True)
    machine_type = models.CharField(max_length=1, choices=MACHINE_TYPE_CHOICES)
    air_temperature = models.FloatField(help_text='Kelvin')
    process_temperature = models.FloatField(help_text='Kelvin')
    rotational_speed = models.IntegerField(help_text='RPM')
    torque = models.FloatField(help_text='Nm')
    tool_wear = models.IntegerField(help_text='minutes')
    predicted_failure = models.BooleanField(default=False)
    failure_type = models.CharField(
        max_length=50,
        choices=FAILURE_TYPE_CHOICES,
        default='No Failure'
    )
    health_status = models.CharField(
        max_length=20,
        choices=HEALTH_STATUS_CHOICES,
        default='healthy'
    )
    raw_input = models.JSONField(default=dict)
    raw_output = models.JSONField(default=dict)
    inference_time_ms = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Prediction Log'
        verbose_name_plural = 'Prediction Logs'
        indexes = [
            models.Index(fields=['machine_id', '-created_at']),
            models.Index(fields=['failure_type']),
            models.Index(fields=['predicted_failure']),
        ]

    def __str__(self):
        ts = self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else 'N/A'
        return f"{self.machine_id} | {self.failure_type} | {ts}"