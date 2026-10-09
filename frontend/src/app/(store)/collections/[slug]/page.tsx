import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShopView } from "@/components/shop/ShopView";
import { getCollection } from "@/lib/api/public";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCollection(slug).catch(() => null);
  if (!c) return { title: "کالکشن" };
  return { title: c.name, description: c.description, alternates: { canonical: `/collections/${slug}` } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const c = await getCollection(slug).catch(() => null);
  if (!c) notFound();
  const sp = await searchParams;
  const query: Record<string, string | undefined> = {};
  for (const k of ["size", "color", "min_price", "max_price", "in_stock", "studio", "sort", "page", "category"]) {
    const v = sp[k];
    query[k] = Array.isArray(v) ? v[0] : v;
  }
  return <ShopView query={query} basePath={`/collections/${slug}`} title={c.name} intro={c.description} fixed={{ collection: slug }} />;
}
