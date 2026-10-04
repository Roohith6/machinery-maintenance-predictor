"""
machines/management/commands/seed_data.py
Run: python manage.py seed_data
Creates demo users (admin + operator) and 10 sample machines.
"""
import logging
from django.core.management.base import BaseCommand
from accounts.models import CustomUser
from machines.models import Machine

logger = logging.getLogger('machines')


class Command(BaseCommand):
    help = 'Seeds database with demo users and sample machines'

    def handle(self, *args, **kwargs):
        self.stdout.write('Starting database seed...\n')
        self.seed_users()
        self.seed_machines()
        self.stdout.write(self.style.SUCCESS('\n✅ Database seeded successfully!\n'))

    def seed_users(self):
        # Create admin user
        if not CustomUser.objects.filter(username='admin').exists():
            CustomUser.objects.create_superuser(
                username='admin',
                email='admin@pmdashboard.com',
                password='Admin@123',
                role='admin',
                department='ML Engineering',
                first_name='Admin',
                last_name='User',
            )
            self.stdout.write(
                self.style.SUCCESS(
                    'Admin user created → username: admin | password: Admin@123'
                )
            )
        else:
            self.stdout.write('Admin user already exists, skipping.')

        # Create operator user
        if not CustomUser.objects.filter(username='operator1').exists():
            op = CustomUser(
                username='operator1',
                email='operator1@pmdashboard.com',
                role='operator',
                department='Production',
                first_name='John',
                last_name='Operator',
                employee_id='EMP001',
            )
            op.set_password('Operator@123')
            op.save()
            self.stdout.write(
                self.style.SUCCESS(
                    'Operator created → username: operator1 | password: Operator@123'
                )
            )
        else:
            self.stdout.write('Operator user already exists, skipping.')

    def seed_machines(self):
        machines_data = [
            {
                'machine_id': 'M-001', 'name': 'CNC Machine 1',
                'machine_type': 'M', 'location': 'Plant A', 'department': 'Production'
            },
            {
                'machine_id': 'M-002', 'name': 'CNC Machine 2',
                'machine_type': 'M', 'location': 'Plant A', 'department': 'Production'
            },
            {
                'machine_id': 'L-001', 'name': 'Lathe Machine 1',
                'machine_type': 'L', 'location': 'Plant B', 'department': 'Fabrication'
            },
            {
                'machine_id': 'L-002', 'name': 'Lathe Machine 2',
                'machine_type': 'L', 'location': 'Plant B', 'department': 'Fabrication'
            },
            {
                'machine_id': 'H-001', 'name': 'Heavy Press 1',
                'machine_type': 'H', 'location': 'Plant C', 'department': 'Assembly'
            },
            {
                'machine_id': 'H-002', 'name': 'Heavy Press 2',
                'machine_type': 'H', 'location': 'Plant C', 'department': 'Assembly'
            },
            {
                'machine_id': 'M-003', 'name': 'Milling Machine 1',
                'machine_type': 'M', 'location': 'Plant A', 'department': 'Production'
            },
            {
                'machine_id': 'L-003', 'name': 'Drilling Machine 1',
                'machine_type': 'L', 'location': 'Plant B', 'department': 'Fabrication'
            },
            {
                'machine_id': 'H-003', 'name': 'Hydraulic Press 1',
                'machine_type': 'H', 'location': 'Plant C', 'department': 'Assembly'
            },
            {
                'machine_id': 'M-004', 'name': 'Grinding Machine 1',
                'machine_type': 'M', 'location': 'Plant A', 'department': 'Finishing'
            },
        ]

        created_count = 0
        for m in machines_data:
            _, created = Machine.objects.get_or_create(
                machine_id=m['machine_id'], defaults=m
            )
            if created:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'{created_count} machines created. '
                f'{len(machines_data) - created_count} already existed.'
            )
        )