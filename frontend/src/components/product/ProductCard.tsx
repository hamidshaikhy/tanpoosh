import NextImage from "next/image";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { home, product as copy } from "@/content/fa";
import type { ProductCard as Card } from "@/lib/api/types";
import { toman } from "@/lib/format";

import { QuickAddButton } from "./QuickAddButton";

export function Price({ min, max, className = "" }: { min: number | null; max: number | null; className?: string }) {
  if (min === null) return null;
  return (
    <p className={`num text-[15px] ${className}`}>
      {max !== null && max !== min ? <span className="text-muted">{copy.from} </span> : null}
      {toman(min)}
    </p>
  );
}

export function Swatches({ colors, max = 4, size = "md" }: { colors: Card["colors"]; max?: number; size?: "sm" | "md" }) {
  const shown = colors.slice(0, max);
  const dim = size === "sm" ? "size-3.5" : "size-[18px]";
  return (
    <ul className="flex items-center gap-1.5" aria-label={`رنگ‌ها: ${colors.map((c) => c.name).join("، ")}`}>
      {shown.map((c) => (
        <li key={c.code}>
          <span
            className={`block ${dim} rounded-full border border-ink/15 ${c.in_stock ? "" : "opacity-40"}`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
          />
        </li>
      ))}
      {colors.length > max ? <li className="text-xs text-muted">+{colors.length - max}</li> : null}
    </ul>
  );
}

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const img = product.primary_image;
  const hover = product.hover_image;
  const firstColor = product.colors[0]?.code;
  return (
    <article className="group relative flex flex-col gap-3" data-testid="product-card">
      <div className="relative">
        <Link href={`/products/${product.slug}`} className="block overflow-hidden bg-surface" tabIndex={-1} aria-hidden="true">
          <div className="relative aspect-[4/5]">
            {img ? (
              <NextImage
                src={img.thumb}
                alt=""
                width={img.width}
                height={img.height}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : undefined}
                className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted">
                <Icon name="box" className="size-8" />
              </div>
            )}
            {hover ? (
              <NextImage width={1600} height={2000} src={hover.thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            ) : null}
          </div>
        </Link>
        {product.is_new ? (
          <span className="pointer-events-none absolute top-3 right-3 bg-accent px-2.5 py-0.5 text-[13px] font-medium text-accent-ink">{home.newBadge}</span>
        ) : null}
        {!product.in_stock ? (
          <span className="pointer-events-none absolute bottom-3 right-3 bg-ink/85 px-2.5 py-0.5 text-[13px] text-bg">{copy.outOfStock}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium">
          <Link href={`/products/${product.slug}`} className="hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-8">
            {product.name}
          </Link>
        </h3>
        <Price min={product.price_min} max={product.price_max} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Swatches colors={product.colors} />
        <QuickAddButton slug={product.slug} name={product.name} disabled={!product.in_stock} />
      </div>
      {product.studio_supported ? (
        <Link
          href={`/studio?product=${encodeURIComponent(product.slug)}${firstColor ? `&color=${encodeURIComponent(firstColor)}` : ""}`}
          className="flex items-center gap-1.5 self-start text-sm text-ink-soft hover:text-ink"
        >
          <Icon name="user" className="size-4" />
          {copy.tryOn}
          <span className="sr-only"> — {product.name}</span>
        </Link>
      ) : null}
    </article>
  );
}
