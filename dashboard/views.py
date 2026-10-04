"""
dashboard/views.py
DashboardStatsView   — Admin: charts data (failure dist, trend, machine health).
EDADataView          — Admin: pre-computed EDA stats from training dataset.
OperatorStatsView    — Operator/Admin: scoped stats for top KPI cards.
login_page           — Serves login.html
operator_dashboard_page — Serves operator.html
admin_dashboard_page — Serves admin.html
"""
import json
import logging
from pathlib import Path
from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.shortcuts import render
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response

from predictions.models import PredictionLog
from machines.models import Machine
from accounts.permissions import IsAdminRole, IsOperatorOrAdmin

logger = logging.getLogger('dashboard')


# ── HTML Template Serving ─────────────────────────────────────────────────────
def login_page(request):
    return render(request, 'accounts/login.html')


def operator_dashboard_page(request):
    return render(request, 'dashboard/operator.html')


def admin_dashboard_page(request):
    return render(request, 'dashboard/admin.html')


# ── API Views ─────────────────────────────────────────────────────────────────
class DashboardStatsView(APIView):
    """
    GET /api/dashboard/stats/
    Admin only.
    Returns: failure type distribution, 7-day prediction trend,
             machine health summary, total counts.
    Used by Chart.js charts on admin dashboard.
    """
    permission_classes = [IsAdminRole]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)

        all_preds = PredictionLog.objects.all()
        total = all_preds.count()
        today_count = all_preds.filter(created_at__gte=today_start).count()
        total_failures = all_preds.filter(predicted_failure=True).count()
        failure_rate = round((total_failures / total * 100), 2) if total > 0 else 0.0

        # Failure type distribution (for pie chart)
        failure_dist = {}
        for row in all_preds.values('failure_type'):
            ft = row['failure_type']
            failure_dist[ft] = failure_dist.get(ft, 0) + 1

        # 7-day trend (for line chart)
        daily_counts = {}
        for i in range(7):
            day = (now - timedelta(days=i)).strftime('%Y-%m-%d')
            daily_counts[day] = 0

        recent_preds = all_preds.filter(created_at__gte=week_ago).values('created_at')
        for row in recent_preds:
            day = row['created_at'].strftime('%Y-%m-%d')
            if day in daily_counts:
                daily_counts[day] += 1

        trend = [
            {"date": k, "count": v}
            for k, v in sorted(daily_counts.items())
        ]

        # Machine health summary (for health cards overview)
        machines = Machine.objects.filter(is_active=True)
        health_summary = Counter(m.current_health_status for m in machines)

        logger.info(
            f"Admin '{request.user.username}' fetched dashboard stats | "
            f"total_predictions={total}"
        )

        return Response({
            'total_predictions': total,
            'today_predictions': today_count,
            'total_failures': total_failures,
            'failure_rate_percent': failure_rate,
            'failure_type_distribution': failure_dist,
            'prediction_trend_7days': trend,
            'machine_health_summary': dict(health_summary),
            'total_machines': machines.count(),
        })


class EDADataView(APIView):
    """
    GET /api/dashboard/eda/
    Admin only. Serves pre-computed EDA statistics from training dataset.
    Used for Chart.js charts (feature stats, failure distribution by type).
    """
    permission_classes = [IsAdminRole]

    def get(self, request):
        eda_file = Path(settings.BASE_DIR) / 'static' / 'data' / 'eda_stats.json'
        try:
            with open(eda_file, 'r') as f:
                data = json.load(f)
            logger.debug(
                f"Admin '{request.user.username}' fetched EDA stats"
            )
            return Response(data)
        except FileNotFoundError:
            logger.error(f"EDA file not found at: {eda_file}")
            return Response(
                {'error': 'EDA data file not found.'},
                status=404
            )
        except json.JSONDecodeError as e:
            logger.error(f"EDA file JSON parse error: {str(e)}")
            return Response(
                {'error': 'EDA data file is corrupted.'},
                status=500
            )


class OperatorStatsView(APIView):
    """
    GET /api/dashboard/operator-stats/
    Returns prediction counts scoped to the logged-in user.
    Admins see all, operators see only their own.
    Used for KPI cards on operator dashboard.
    """
    permission_classes = [IsOperatorOrAdmin]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        user = request.user

        if user.role == 'admin':
            qs = PredictionLog.objects.all()
        else:
            qs = PredictionLog.objects.filter(user=user)

        total = qs.count()
        today_count = qs.filter(created_at__gte=today_start).count()
        failures = qs.filter(predicted_failure=True).count()
        failure_rate = round((failures / total * 100), 2) if total > 0 else 0.0

        return Response({
            'total_predictions': total,
            'today_predictions': today_count,
            'total_failures': failures,
            'failure_rate_percent': failure_rate,
        })