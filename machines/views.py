"""
machines/views.py
MachineStatusView — returns all active machines with health cards.
MachineDetailView — single machine by machine_id.
"""
import logging
from rest_framework import generics
from .models import Machine
from .serializers import MachineSerializer
from accounts.permissions import IsOperatorOrAdmin

logger = logging.getLogger('machines')


class MachineStatusView(generics.ListAPIView):
    """
    GET /api/machines/status/
    Returns all active machines with their current health status.
    Permission: Operator + Admin
    """
    permission_classes = [IsOperatorOrAdmin]
    serializer_class = MachineSerializer

    def get_queryset(self):
        logger.info(
            f"Machine status requested by '{self.request.user.username}'"
        )
        return Machine.objects.filter(is_active=True).order_by('machine_id')


class MachineDetailView(generics.RetrieveAPIView):
    """
    GET /api/machines/<machine_id>/
    Returns single machine detail.
    Permission: Operator + Admin
    """
    permission_classes = [IsOperatorOrAdmin]
    serializer_class = MachineSerializer
    lookup_field = 'machine_id'
    queryset = Machine.objects.all()