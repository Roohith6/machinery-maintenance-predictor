# machines/urls.py
from django.urls import path
from .views import MachineStatusView, MachineDetailView

urlpatterns = [
    path('status/', MachineStatusView.as_view(), name='machine_status'),
    path('<str:machine_id>/', MachineDetailView.as_view(), name='machine_detail'),
]