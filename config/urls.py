"""
config/urls.py — Main URL router.
Connects all app-level url files.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from dashboard.views import login_page, operator_dashboard_page, admin_dashboard_page

urlpatterns = [
    # Django admin panel
    path('django-admin/', admin.site.urls),

    # API routes
    path('api/auth/', include('accounts.urls')),
    path('api/predictions/', include('predictions.urls')),
    path('api/machines/', include('machines.urls')),
    path('api/dashboard/', include('dashboard.urls')),

    # Frontend HTML page routes (served directly — NOT prefixed with api/)
    path('', login_page, name='login_page'),
    path('operator/', operator_dashboard_page, name='operator_dashboard'),
    path('admin-panel/', admin_dashboard_page, name='admin_dashboard'),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)