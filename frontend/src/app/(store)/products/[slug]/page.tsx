import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { ProductCard } from "@/components/product/ProductCard";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductReviews } from "@/components/product/ProductReviews";
import { ErrorBlock } from "@/components/ui/States";
import { common, product as copy } from "@/content/fa";
import { getProduct, getRelated } from "@/lib/api/public";
import type { ProductCard as Card, ProductDetail } from "@/lib/api/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string; size?: string }> };

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8088";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug).catch(() => null);
  if (!p) return { title: "محصول" };
  const img = p.primary_image;
  return {
    title: p.seo_title || p.name,
    description: p.seo_description || p.short_description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description: p.short_description, images: img ? [{ url: img.url, width: img.width, height: img.height, alt: img.alt }] : [] },
  };
}

function jsonLd(p: ProductDetail): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.short_description || p.description,
    sku: p.variants[0]?.sku,
    image: p.media.map((m) => new URL(m.url, SITE).toString()),
    category: p.category.name,
    brand: { "@type": "Brand", name: "TANPOOSH" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "IRR",
      // schema.org expects ISO currency; IRR value derived from integer toman (×10).
      lowPrice: (p.price_min ?? 0) * 10,
      highPrice: (p.price_max ?? 0) * 10,
      offerCount: p.variants.length,
      availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE}/products/${p.slug}`,
    },
  };
  // Only real, approved review aggregates — never fabricated ratings.
  if (p.rating.count > 0 && p.rating.average !== null) {
    data.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count };
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  let p: ProductDetail | null;
  try {
    p = await getProduct(slug);
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <ErrorBlock message={common.serverDown} />
      </div>
    );
  }
  if (!p) notFound();
  const related: Card[] = await getRelated(slug).catch(() => []);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const initialColor = p.colors.some((c) => c.code === sp.color) ? sp.color! : (p.colors.find((c) => c.in_stock) ?? p.colors[0])?.code ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6 lg:px-8">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd(p) }} />
      <nav aria-label="مسیر" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              {common.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/shop?category=${p.category.slug}`} className="hover:text-ink">
              {p.category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {p.name}
          </li>
        </ol>
      </nav>
      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <ProductPurchase product={p} initialColor={initialColor} initialSize={sp.size ?? null} />
      </div>
      <ProductReviews slug={p.slug} rating={p.rating} />
      {related.length ? (
        <section className="mt-20" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-8 text-2xl font-bold">
            {copy.related}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
            {related.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
