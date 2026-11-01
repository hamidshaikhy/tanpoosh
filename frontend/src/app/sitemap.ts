import type { MetadataRoute } from "next";

import { getCollections, getProducts } from "@/lib/api/public";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8088";

export const dynamic = "force-dynamic";

/** Public, indexable pages only (no account/checkout/admin/private data). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = ["", "/shop", "/collections", "/studio", "/rack", "/pages/about", "/pages/contact", "/pages/shipping", "/pages/returns", "/pages/size-guide", "/pages/privacy", "/pages/terms"].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: "weekly",
  }));
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await getProducts({ page: String(page) });
      for (const p of res.results) entries.push({ url: `${SITE}/products/${p.slug}`, changeFrequency: "daily" });
      if (page >= res.total_pages) break;
    }
    for (const c of await getCollections()) entries.push({ url: `${SITE}/collections/${c.slug}`, changeFrequency: "weekly" });
  } catch {
    // API unavailable: still serve the static part of the sitemap.
  }
  return entries;
}
