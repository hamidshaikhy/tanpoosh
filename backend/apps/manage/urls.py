from django.urls import path

from . import admin_views as a
from . import catalog_views as c
from . import order_views as o

urlpatterns = [
    path("dashboard", a.DashboardView.as_view()),
    # catalog
    path("catalog/meta", c.CatalogMetaView.as_view()),
    path("products", c.ProductListCreateView.as_view()),
    path("products/<int:product_id>", c.ProductDetailView.as_view()),
    path("products/<int:product_id>/status", c.ProductStatusView.as_view()),
    path("products/<int:product_id>/media", c.ProductMediaView.as_view()),
    path("products/<int:product_id>/media/reorder", c.ProductMediaReorderView.as_view()),
    path("products/<int:product_id>/media/<int:media_id>", c.ProductMediaDetailView.as_view()),
    path("categories", c.CategoryListCreateView.as_view()),
    path("categories/<int:pk>", c.CategoryDetailView.as_view()),
    path("collections", c.CollectionListCreateView.as_view()),
    path("collections/<int:pk>", c.CollectionDetailView.as_view()),
    path("inventory", c.InventoryListView.as_view()),
    path("inventory/<int:variant_id>/adjust", c.InventoryAdjustView.as_view()),
    path("inventory/<int:variant_id>/threshold", c.InventoryThresholdView.as_view()),
    path("inventory/<int:variant_id>/movements", c.InventoryMovementsView.as_view()),
    # orders & money
    path("orders", o.OrderListView.as_view()),
    path("orders/<uuid:order_id>", o.OrderDetailView.as_view()),
    path("orders/<uuid:order_id>/fulfillment", o.OrderFulfillmentView.as_view()),
    path("orders/<uuid:order_id>/cancel", o.OrderCancelView.as_view()),
    path("orders/<uuid:order_id>/note", o.OrderNoteView.as_view()),
    path("orders/<uuid:order_id>/resolve-review", o.ResolveReviewView.as_view()),
    path("orders/<uuid:order_id>/refunds", o.OrderRefundCreateView.as_view()),
    path("payments", o.PaymentListView.as_view()),
    path("payments/reconcile", o.PaymentReconcileAllView.as_view()),
    path("payments/export", o.PaymentExportView.as_view()),
    path("payments/<uuid:attempt_id>/reconcile", o.PaymentReconcileView.as_view()),
    path("refunds", o.RefundListView.as_view()),
    path("refunds/<uuid:refund_id>/<str:action>", o.RefundActionView.as_view()),
    path("returns", o.ReturnListView.as_view()),
    path("returns/<uuid:return_id>", o.ReturnDetailView.as_view()),
    path("returns/<uuid:return_id>/decide", o.ReturnDecideView.as_view()),
    path("returns/<uuid:return_id>/receive", o.ReturnReceiveView.as_view()),
    # marketing / settings
    path("coupons", a.CouponListCreateView.as_view()),
    path("coupons/<int:coupon_id>", a.CouponDetailView.as_view()),
    path("shipping", a.ShippingListView.as_view()),
    path("shipping/<int:method_id>", a.ShippingDetailView.as_view()),
    path("content/settings", a.ContentSettingsView.as_view()),
    path("content/pages", a.ContentPagesView.as_view()),
    path("content/pages/<slug:slug>", a.ContentPageDetailView.as_view()),
    # people
    path("customers", a.CustomerListView.as_view()),
    path("customers/<uuid:customer_id>", a.CustomerDetailView.as_view()),
    path("staff", a.StaffListCreateView.as_view()),
    path("staff/<uuid:user_id>", a.StaffDetailView.as_view()),
    path("reviews", a.ReviewListView.as_view()),
    path("reviews/<int:review_id>/moderate", a.ReviewModerateView.as_view()),
    path("support", a.SupportListView.as_view()),
    path("support/<uuid:message_id>", a.SupportDetailView.as_view()),
    path("audit", a.AuditListView.as_view()),
]
