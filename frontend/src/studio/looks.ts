import type { StudioProduct } from "@/lib/api/types";

import { SLOTS, type Outfit } from "./store";

export const PREBUILT: { name: string; outfit: Outfit }[] = [
  {
    name: "اولد مانی روزمره",
    outfit: {
      top: { slug: "knit-polo", color: "ivory", size: null },
      bottom: { slug: "chino-trousers", color: "sand", size: null },
      shoes: { slug: "suede-loafers", color: "brown", size: null },
      accessory: { slug: "tortoise-sunglasses", color: "tortoise", size: "ONE" },
    },
  },
  {
    name: "کلاسیک رسمی",
    outfit: {
      top: { slug: "oxford-shirt", color: "sky", size: null },
      bottom: { slug: "tailored-trousers", color: "black", size: null },
      shoes: { slug: "derby-shoes", color: "black", size: null },
    },
  },
  {
    name: "کلاسیک با عینک",
    outfit: {
      top: { slug: "oxford-shirt", color: "white", size: null },
      bottom: { slug: "tailored-trousers", color: "charcoal", size: null },
      shoes: { slug: "derby-shoes", color: "black", size: null },
      accessory: { slug: "tortoise-sunglasses", color: "tortoise", size: "ONE" },
    },
  },
  {
    name: "آخر هفته",
    outfit: {
      top: { slug: "basic-tee", color: "ivory", size: null },
      bottom: { slug: "straight-jeans", color: "indigo", size: null },
      shoes: { slug: "leather-sneakers", color: "white", size: null },
    },
  },
];

export function sanitizeOutfit(outfit: Outfit, products: StudioProduct[], opts: { supportedOnly?: boolean } = {}): { outfit: Outfit; dropped: number } {
  const out: Outfit = {};
  let dropped = outfit.outerwear ? 1 : 0;
  for (const slot of SLOTS) {
    const sel = outfit[slot];
    if (!sel) continue;
    const p = products.find((x) => x.slug === sel.slug && x.studio_slot === slot);
    if (!p || (opts.supportedOnly && (!p.studio_supported || !p.studio_asset))) {
      dropped++;
      continue;
    }
    const color = p.colors.some((c) => c.code === sel.color) ? sel.color : p.colors[0]?.code;
    if (!color) {
      dropped++;
      continue;
    }
    const size = sel.size && p.variants.some((v) => v.color_code === color && v.size === sel.size) ? sel.size : null;
    out[slot] = { slug: p.slug, color, size };
  }
  return { outfit: out, dropped };
}
