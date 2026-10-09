from django.conf import settings
from django.urls import include, path, re_path

from apps.accounts import urls as accounts_urls
from apps.accounts.views import ProvincesView
from apps.carts import views as cart_views
from apps.catalog import views as catalog_views
from apps.content import views as content_views
from apps.core import views as core_views
from apps.looks import views as look_views
from apps.orders import views as order_views
from apps.payments import views as payment_views
from apps.reviews import views as review_views
from apps.support import views as support_views

catalog = [
    path("products", catalog_views.ProductListView.as_view()),
    path("products/<slug:slug>", catalog_views.ProductDetailView.as_view()),
    path("products/<slug:slug>/related", catalog_views.RelatedProductsView.as_view()),
    path("products/<slug:slug>/reviews", review_views.ProductReviewsView.as_view()),
    path("categories", catalog_views.CategoryListView.as_view()),
    path("collections", catalog_views.CollectionListView.as_view()),
    path("collections/<slug:slug>", catalog_views.CollectionDetailView.as_view()),
    path("filters", catalog_views.FiltersView.as_view()),
    path("variants", catalog_views.VariantLookupView.as_view()),
]

cart = [
    path("", cart_views.CartView.as_view()),
    path("items", cart_views.CartItemsView.as_view()),
    path("items/batch", cart_views.CartBatchView.as_view()),
    path("items/<int:item_id>", cart_views.CartItemDetailView.as_view()),
]

checkout = [
    path("quote", order_views.CheckoutQuoteView.as_view()),
    path("orders", order_views.CheckoutOrderView.as_view()),
]

orders = [
    path("", order_views.OrderListView.as_view()),
    path("lookup", order_views.GuestOrderLookupView.as_view()),
    path("access", order_views.GuestOrderAccessView.as_view()),
    path("<uuid:order_id>", order_views.OrderDetailView.as_view()),
    path("<uuid:order_id>/cancel", order_views.OrderCancelView.as_view()),
    path("<uuid:order_id>/pay", order_views.OrderPayView.as_view()),
    path("<uuid:order_id>/returns", order_views.OrderReturnView.as_view()),
    path("<uuid:order_id>/payment-status", payment_views.PaymentStatusView.as_view()),
]

payments = [
    path("callback", payment_views.PaymentCallbackView.as_view()),
]
if settings.PAYMENT_MOCK_ENABLED and not settings.IS_PRODUCTION:
    payments += [
        path("mock/<str:authority>", payment_views.MockGatewayView.as_view()),
        path("mock/<str:authority>/complete", payment_views.MockGatewayCompleteView.as_view()),
    ]

account = accounts_urls.account_urlpatterns + [
    path("wishlist", cart_views.WishlistView.as_view()),
    path("wishlist/<slug:product_slug>", cart_views.WishlistItemView.as_view()),
    path("looks", look_views.LookListView.as_view()),
    path("looks/<uuid:look_id>", look_views.LookDetailView.as_view()),
    path("looks/<uuid:look_id>/share", look_views.LookShareView.as_view()),
    path("reviews", review_views.OwnReviewsView.as_view()),
    path("support", support_views.SupportOwnListView.as_view()),
]

content = [
    path("home", content_views.HomeView.as_view()),
    path("settings", content_views.PublicSettingsView.as_view()),
    path("pages", content_views.InfoPageListView.as_view()),
    path("pages/<slug:slug>", content_views.InfoPageView.as_view()),
]

api_v1 = [
    path("health/live", core_views.LivenessView.as_view()),
    path("health/ready", core_views.ReadinessView.as_view()),
    path("auth/", include(accounts_urls.auth_urlpatterns)),
    path("account/", include(account)),
    path("geo/provinces", ProvincesView.as_view()),
    path("catalog/", include(catalog)),
    path("studio/catalog", catalog_views.StudioCatalogView.as_view()),
    path("looks/shared/<str:token>", look_views.SharedLookView.as_view()),
    path("cart", cart_views.CartView.as_view()),
    path("cart/", include(cart)),
    path("checkout/", include(checkout)),
    path("orders", order_views.OrderListView.as_view()),
    path("orders/", include(orders)),
    path("payments/", include(payments)),
    path("support/messages", support_views.SupportMessageView.as_view()),
    path("content/", include(content)),
    path("manage/", include("apps.manage.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
]

if settings.SERVE_MEDIA:
    urlpatterns.append(re_path(r"^media/(?P<path>.+)$", core_views.serve_media))

if settings.API_DOCS_ENABLED:
    from drf_spectacular.views import SpectacularAPIView

    urlpatterns.append(path("api/v1/schema", SpectacularAPIView.as_view(), name="schema"))

handler404 = "apps.core.views.json_404"
handler500 = "apps.core.views.json_500"
