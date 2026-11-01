import type { ProductDetail } from "@/lib/api/types";

/** Each mesh is registered against a real catalog product and its photographed color. */
export const RACK_EDIT = [
  { slug: "oxford-shirt", color: "sky", asset: "oxford-sky", kind: "shirt" },
  { slug: "chino-trousers", color: "sand", asset: "chino-sand", kind: "trousers" },
  { slug: "basic-tee", color: "black", asset: "tee-black", kind: "shirt" },
  { slug: "knit-polo", color: "ivory", asset: "knit-polo", kind: "shirt" },
  { slug: "polo-shirt", color: "navy", asset: "polo-navy", kind: "shirt" },
  { slug: "straight-jeans", color: "indigo", asset: "jeans-indigo", kind: "trousers" },
  { slug: "crew-knit", color: "oatmeal", asset: "crew-oatmeal", kind: "shirt" },
  { slug: "overshirt", color: "charcoal", asset: "overshirt-charcoal", kind: "shirt" },
] as const;

export type RackItem = {
  product: ProductDetail;
  color: string;
  asset: string;
  kind: "shirt" | "trousers";
};

export function rackImage(item: RackItem) {
  return item.product.media.find(m => m.color_code === item.color && m.kind === "front")
    ?? item.product.colors.find(c => c.code === item.color)?.image
    ?? item.product.primary_image;
}
