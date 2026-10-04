"""
predictions/signals.py
After every new PredictionLog is saved, automatically updates
the related Machine's health status.
This keeps machine health cards accurate without any extra API call.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger('predictions')


@receiver(post_save, sender='predictions.PredictionLog')
def update_machine_health_on_prediction(sender, instance, created, **kwargs):
    """Only runs on new prediction records, not updates."""
    if not created:
        return

    try:
        from machines.models import Machine
        machine, was_created = Machine.objects.get_or_create(
            machine_id=instance.machine_id,
            defaults={
                'name': f'Machine {instance.machine_id}',
                'machine_type': instance.machine_type,
                'location': 'Unknown',
                'department': 'Unknown',
            }
        )

        old_status = machine.current_health_status
        machine.current_health_status = instance.health_status
        machine.last_prediction_at = timezone.now()
        machine.save(update_fields=[
            'current_health_status', 'last_prediction_at', 'updated_at'
        ])

        logger.info(
            f"Machine '{instance.machine_id}' health: "
            f"'{old_status}' → '{instance.health_status}' "
            f"(prediction id={instance.id})"
        )

    except Exception as e:
        logger.error(
            f"Signal error updating machine '{instance.machine_id}': {str(e)}",
            exc_info=True
        )