"""
machines/models.py
Machine registry — one row per physical machine.
Health status is updated automatically via predictions/signals.py
"""
import logging
from django.db import models

logger = logging.getLogger('machines')

HEALTH_STATUS_CHOICES = [
    ('healthy', 'Healthy'),
    ('at_risk', 'At Risk'),
    ('critical', 'Critical'),
    ('offline', 'Offline'),
]

MACHINE_TYPE_CHOICES = [
    ('L', 'Low (L)'),
    ('M', 'Medium (M)'),
    ('H', 'High (H)'),
]


class Machine(models.Model):
    machine_id = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=100)
    machine_type = models.CharField(max_length=1, choices=MACHINE_TYPE_CHOICES, default='M')
    location = models.CharField(max_length=100, default='Plant A')
    department = models.CharField(max_length=100, default='Production')
    current_health_status = models.CharField(
        max_length=20,
        choices=HEALTH_STATUS_CHOICES,
        default='healthy'
    )
    last_prediction_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['machine_id']
        verbose_name = 'Machine'
        verbose_name_plural = 'Machines'

    def __str__(self):
        return f"{self.machine_id} — {self.name} [{self.current_health_status}]"