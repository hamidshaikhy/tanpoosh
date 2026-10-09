from django.urls import path

from . import views

auth_urlpatterns = [
    path("csrf", views.CsrfView.as_view()),
    path("me", views.MeView.as_view()),
    path("login", views.LoginView.as_view()),
    path("logout", views.LogoutView.as_view()),
    path("signup", views.SignupView.as_view()),
    path("email/verify", views.VerifyEmailView.as_view()),
    path("email/resend", views.ResendVerificationView.as_view()),
    path("email/change", views.ChangeEmailView.as_view()),
    path("password/forgot", views.ForgotPasswordView.as_view()),
    path("password/reset", views.ResetPasswordView.as_view()),
    path("password/change", views.ChangePasswordView.as_view()),
    path("sessions", views.SessionsView.as_view()),
    path("sessions/revoke-others", views.RevokeOtherSessionsView.as_view()),
    path("sessions/<str:session_id>", views.SessionDetailView.as_view()),
    path("mfa/enroll", views.MfaEnrollView.as_view()),
    path("mfa/confirm", views.MfaConfirmView.as_view()),
    path("mfa/verify", views.MfaVerifyView.as_view()),
    path("mfa/recovery-codes", views.MfaRecoveryCodesView.as_view()),
    path("reauth", views.ReauthView.as_view()),
]

account_urlpatterns = [
    path("profile", views.ProfileView.as_view()),
    path("addresses", views.AddressListView.as_view()),
    path("addresses/<uuid:address_id>", views.AddressDetailView.as_view()),
]
