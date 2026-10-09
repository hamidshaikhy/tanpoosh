import type { Metadata } from "next";

import { ShopView } from "@/components/shop/ShopView";

export const metadata: Metadata = {
  title: "پوشاک",
  description: "کاپشن، تیشرت، شلوار و کفش مردانه با فیلتر سایز، رنگ و قیمت.",
  alternates: { canonical: "/shop" },
};

const KEYS = ["category", "collection", "size", "color", "min_price", "max_price", "in_stock", "is_new", "studio", "q", "sort", "page"] as const;

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    const v = sp[k];
    query[k] = Array.isArray(v) ? v[0] : v;
  }
  return <ShopView query={query} basePath="/shop" />;
}
