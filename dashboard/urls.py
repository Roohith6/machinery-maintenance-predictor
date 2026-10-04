# dashboard/urls.py — API routes only (HTML pages are in config/urls.py)
from django.urls import path
from .views import (
    DashboardStatsView,
    EDADataView,
    OperatorStatsView,
)

urlpatterns = [
    # REST API — accessed via /api/dashboard/<endpoint>/
    path('stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('eda/', EDADataView.as_view(), name='eda_data'),
    path('operator-stats/', OperatorStatsView.as_view(), name='operator_stats'),
]