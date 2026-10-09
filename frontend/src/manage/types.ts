import type { Image } from "@/lib/api/types";

export type ManageProductRow = {
  id: number;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  status_label: string;
  category: string;
  is_new: boolean;
  thumb: string | null;
  variant_count: number;
  price_min: number | null;
  price_max: number | null;
  on_hand: number;
  available: number;
  studio_supported: boolean;
  updated_at: string;
  version: number;
};

export type ManageColor = { id?: number; code: string; name: string; hex: string; sort_order: number };
export type ManageVariant = {
  id?: number;
  color_code: string;
  size: string;
  sku: string;
  price_toman: number;
  is_active: boolean;
  weight_grams: number;
  on_hand?: number;
  reserved?: number;
  initial_stock?: number;
};

export type ManageProduct = ManageProductRow & {
  category_id: number;
  collection_ids: number[];
  short_description: string;
  description: string;
  materials: string;
  care: string;
  fit_notes: string;
  size_chart: string;
  studio_slot: string;
  studio_asset: string;
  seo_title: string;
  seo_description: string;
  sort_order: number;
  published_at: string | null;
  publish_problems: string[];
  colors: ManageColor[];
  variants: ManageVariant[];
  media: (Image & { sort_order: number })[];
};

export type CatalogMeta = {
  categories: { id: number; name: string; slug: string; is_visible: boolean }[];
  collections: { id: number; name: string; slug: string; is_visible: boolean }[];
  size_charts: { value: string; label: string }[];
  studio_slots: { value: string; label: string }[];
  studio_garments: { id: string; slot: string; label: string }[];
  size_presets: Record<string, string[]>;
  media_kinds: { value: string; label: string }[];
};
