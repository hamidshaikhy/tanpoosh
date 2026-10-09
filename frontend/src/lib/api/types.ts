/**
 * Response types for the TANPOOSH REST API (/api/v1). They mirror the backend payload builders;
 * `npm run api:check` verifies every path used by the client exists in the generated OpenAPI
 * schema (src/lib/api/openapi.d.ts, produced from Django by `npm run api:types`).
 */

export type Paginated<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    request_id?: string | null;
    [key: string]: unknown;
  };
};

export type Image = {
  id: number;
  url: string;
  thumb: string;
  alt: string;
  width: number;
  height: number;
  kind: string;
  color_code: string | null;
};

export type CardColor = { code: string; name: string; hex: string; in_stock: boolean; image: Image | null };

export type ProductCard = {
  id: number;
  slug: string;
  name: string;
  category: { slug: string; name: string };
  is_new: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  in_stock: boolean;
  colors: CardColor[];
  sizes: { code: string; in_stock: boolean }[];
  primary_image: Image | null;
  hover_image: Image | null;
  studio_slot: StudioSlot | "none";
  studio_supported: boolean;
  rating: { average: number | null; count: number };
};

export type PublicVariant = {
  id: number;
  sku: string;
  color_code: string;
  size: string;
  price_toman: number;
  in_stock: boolean;
  max_quantity: number;
  low_stock: boolean;
};

export type ProductDetail = ProductCard & {
  short_description: string;
  description: string;
  materials: string;
  care: string;
  fit_notes: string;
  size_chart: "tops" | "bottoms" | "shoes" | "none";
  studio_asset: string;
  seo_title: string;
  seo_description: string;
  media: Image[];
  variants: PublicVariant[];
  collections: { slug: string; name: string }[];
  updated_at: string;
};

export type Category = { slug: string; name: string; description: string; product_count: number; image: Image | null };
export type Collection = Category;

export type Filters = {
  sizes: string[];
  colors: { code: string; name: string; hex: string }[];
  price_min: number;
  price_max: number;
  categories: { slug: string; name: string; product_count: number }[];
  collections: { slug: string; name: string }[];
  sorts: { value: string; label: string }[];
};

export type Review = {
  id: number;
  rating: number;
  title: string;
  body: string;
  size_feedback: string;
  author: string;
  verified_purchase: boolean;
  created_at: string;
  status?: string;
  status_label?: string;
  product_slug?: string;
  product_name?: string;
};

export type ShippingMethodPublic = {
  code: string;
  name: string;
  fee_toman: number;
  free_threshold_toman: number | null;
  eta_text: string;
  description: string;
};

export type PublicSettings = {
  announcement: string;
  footer_about: string;
  contact: { email: string; phone: string; hours: string; address: string };
  social: { instagram: string; telegram: string };
  seo: { title: string; description: string };
  shipping_methods: ShippingMethodPublic[];
  version: number;
};

export type Home = {
  hero: { title: string; subtitle: string; primary: { label: string; href: string }; secondary: { label: string; href: string } };
  picks: { title: string; subtitle: string; products: ProductCard[] };
  eyewear: ProductCard[];
  categories: Category[];
  studio: { title: string; subtitle: string };
  featured_collection: Collection | null;
  settings: PublicSettings;
};

export type InfoBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "note"; text: string }
  | { type: "list"; items: string[] };

export type InfoPage = { slug: string; title: string; summary: string; blocks: InfoBlock[]; is_seed_content: boolean; updated_at: string };

export type MfaState = { enrolled: boolean; verified: boolean; required: boolean; dev_bypass: boolean };

export type Me = {
  authenticated: boolean;
  user: null | {
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    pending_email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role: "customer" | "owner" | "catalog_manager" | "order_manager" | "finance";
    role_label: string;
    is_staff: boolean;
    permissions: string[];
    mfa: MfaState;
  };
};

export type AuthResult = Me & { csrf_token: string; merge_notices?: { code: string; message: string }[] };

export type CartLine = {
  id: number;
  variant_id: number;
  product_slug: string;
  product_name: string;
  color_code: string;
  color_name: string;
  color_hex: string;
  size: string;
  sku: string;
  unit_price_toman: number;
  quantity: number;
  line_total_toman: number;
  image: string | null;
  image_alt: string;
  max_quantity: number;
  issue: null | "unavailable" | "out_of_stock" | "insufficient_stock";
};

export type Cart = {
  version: number;
  items: CartLine[];
  item_count: number;
  subtotal_toman: number;
  currency: string;
  has_issues: boolean;
};

export type ShippingOption = {
  code: string;
  name: string;
  description: string;
  eta_text: string;
  fee_toman: number;
  base_fee_toman: number;
  free_threshold_toman: number | null;
  is_free: boolean;
};

export type Quote = {
  fingerprint: string;
  purchasable: boolean;
  currency: string;
  subtotal_toman: number;
  discount_toman: number;
  shipping_toman: number;
  total_toman: number;
  coupon_code: string;
  coupon_error: { code: string; message: string } | null;
  shipping_method: string | null;
  shipping_options: ShippingOption[];
  issues: { code: string; message: string; variant_id?: number }[];
  lines: {
    variant_id: number;
    product_name: string;
    product_slug: string;
    color_name: string;
    size: string;
    quantity: number;
    unit_price_toman: number;
    line_total_toman: number;
    discount_share_toman: number;
    issue: string | null;
  }[];
};

export type Address = {
  id: string;
  title: string;
  recipient_name: string;
  phone: string;
  province: string;
  city: string;
  postal_code: string;
  line: string;
  plaque: string;
  unit: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Province = { name: string; cities: string[] };

export type OrderSummary = {
  id: string;
  number: string;
  placed_at: string;
  payment_status: string;
  payment_status_label: string;
  fulfillment_status: string;
  fulfillment_status_label: string;
  total_toman: number;
  currency: string;
  item_count: number;
  is_test: boolean;
  thumbnail: string;
};

export type OrderItem = {
  id: number;
  product_name: string;
  product_slug: string;
  color_name: string;
  color_code: string;
  size: string;
  sku: string;
  image: string;
  unit_price_toman: number;
  quantity: number;
  line_total_toman: number;
  discount_share_toman: number;
  returned_quantity: number;
};

export type PaymentAttemptSummary = {
  id: string;
  status: string;
  status_label: string;
  mode: string;
  ref_id: string;
  created_at: string;
  provider?: string;
  amount_toman?: number;
  provider_amount?: number;
  provider_currency?: string;
  authority?: string | null;
  provider_code?: number | null;
  failure_reason?: string;
  fee?: number | null;
  verified_at?: string | null;
  callback_count?: number;
  check_count?: number;
};

export type OrderDetail = OrderSummary & {
  contact: { name: string; phone: string; email: string };
  shipping_address: { recipient_name: string; phone: string; province: string; city: string; postal_code: string; line: string; plaque: string; unit: string };
  shipping_method: { code: string; name: string };
  subtotal_toman: number;
  discount_toman: number;
  shipping_toman: number;
  refunded_toman: number;
  coupon_code: string;
  customer_note: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  reservation_expires_at: string | null;
  payment_mode: string;
  payment_reference: string;
  can_pay: boolean;
  can_cancel: boolean;
  can_return: boolean;
  return_deadline: string | null;
  returnable: { order_item_id: number; remaining: number }[];
  items: OrderItem[];
  events: { kind: string; from_status: string; to_status: string; message: string; created_at: string; actor?: string }[];
  shipments: { carrier: string; tracking_code: string; shipped_at: string; delivered_at: string | null }[];
  returns: {
    id: string;
    status: string;
    status_label: string;
    reason: string;
    reason_label: string;
    created_at: string;
    staff_note: string;
    items: { order_item_id: number; quantity: number; accepted_quantity: number | null }[];
  }[];
  payment_attempts: PaymentAttemptSummary[];
  // staff-only
  version?: number;
  user_id?: string | null;
  is_guest?: boolean;
  review_reason?: string;
  refunds?: RefundRow[];
};

export type RefundRow = {
  id: string;
  amount_toman: number;
  status: string;
  status_label: string;
  reason: string;
  reference: string;
  evidence_note: string;
  failure_reason: string;
  return_id?: string | null;
  created_at: string;
  completed_at: string | null;
  version: number;
  order_id?: string;
  order_number?: string;
  method?: string;
  is_test?: boolean;
  requested_by?: string;
  approved_by?: string;
};

export type PaymentStatus = {
  order_id: string;
  number: string;
  payment_status: string;
  payment_status_label: string;
  fulfillment_status: string;
  total_toman: number;
  payment_reference: string;
  is_test: boolean;
  payment_mode: string;
  can_pay: boolean;
  last_attempt: PaymentAttemptSummary | null;
};

export type StudioSlot = "top" | "outerwear" | "bottom" | "shoes" | "accessory";

export type StudioImage = {
  file: string;
  width: number;
  height: number;
  bytes: number;
  placement?: { scale: number; scale_y?: number; x: number; y: number };
};

export type StudioImageSet = {
  id: string;
  slot: StudioSlot;
  label: string;
  colors: Record<string, StudioImage>;
  origin: string;
};

export type StudioManifest = {
  version: 2;
  mode: "layers" | "looks";
  notice: string;
  model: StudioImage & { id: string; name: string };
  garments: StudioImageSet[];
  looks: { id: string; name: string; selections: Partial<Record<StudioSlot, { slug: string; color: string }>>; image: StudioImage }[];
};

export type StudioProduct = ProductCard & { studio_asset: string; variants: PublicVariant[] };

export type SavedLook = {
  id: string;
  name: string;
  items: { slot: StudioSlot; product_id: number; color_code: string; size: string; product_slug: string; product_name: string; available: boolean }[];
  shared: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
};

export type WishlistEntry = { product: ProductCard & { available: boolean }; color_code: string; created_at: string };

export type SessionRow = { id: string; current: boolean; created_at: string; last_seen_at: string | null; ip_prefix: string; user_agent: string };

export type SupportMessage = {
  id: string;
  topic: string;
  topic_label: string;
  subject: string;
  body: string;
  order_number: string;
  status: string;
  status_label: string;
  created_at: string;
  replies: { body: string; author: string; created_at: string }[];
};
