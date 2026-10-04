# accounts/urls.py
from django.urls import path
from .views import (
    LoginView,
    TokenRefreshCustomView,
    LogoutView,
    ProfileView,
    UserListCreateView,
    UserDetailView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshCustomView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('users/', UserListCreateView.as_view(), name='user_list_create'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user_detail'),
]