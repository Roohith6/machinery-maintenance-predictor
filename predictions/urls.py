# predictions/urls.py
from django.urls import path
from .views import PredictView, PredictionHistoryView, RecentAlertsView

urlpatterns = [
    path('predict/', PredictView.as_view(), name='predict'),
    path('history/', PredictionHistoryView.as_view(), name='prediction_history'),
    path('alerts/', RecentAlertsView.as_view(), name='recent_alerts'),
]