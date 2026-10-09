"use client";

import NextImage from "next/image";

import { useMemo, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { product as copy } from "@/content/fa";
import type { Image, ProductDetail } from "@/lib/api/types";
import { faDigits } from "@/lib/format";

/** Variant-correct gallery: images for the selected color first, then shared images. */
export function ProductGallery({ product, color }: { product: ProductDetail; color: string | null }) {
  const images = useMemo<Image[]>(() => {
    const forColor = product.media.filter((m) => m.color_code === color);
    const shared = product.media.filter((m) => !m.color_code);
    const list = [...forColor, ...shared];
    return list.length ? list : product.media;
  }, [product.media, color]);
  const [selected, setSelected] = useState<{ color: string | null; index: number }>({ color, index: 0 });
  const index = selected.color === color ? selected.index : 0;
  const setIndex = (i: number) => setSelected({ color, index: i });
  const [zoom, setZoom] = useState(false);
  const current = images[Math.min(index, images.length - 1)];

  if (!current) {
    return <div className="aspect-[4/5] bg-surface" aria-label={copy.galleryLabel} />;
  }
  return (
    <section aria-label={copy.galleryLabel} className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative block cursor-zoom-in overflow-hidden bg-surface"
        aria-label={`${copy.zoom}: ${current.alt}`}
      >
        <NextImage src={current.url} alt={current.alt} width={current.width} height={current.height} className="aspect-[4/5] w-full object-cover" fetchPriority="high" />
        <span className="absolute bottom-3 left-3 flex size-10 items-center justify-center bg-bg/85 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Icon name="zoom-in" />
        </span>
      </button>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto scrollbar-none" role="list">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`block w-20 border bg-surface ${i === index ? "border-ink" : "border-transparent hover:border-line"}`}
                aria-label={copy.imageOf(i + 1, images.length).replace(/\d+/g, (d) => faDigits(d))}
                aria-current={i === index}
              >
                <NextImage width={1600} height={2000} src={img.thumb} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog open={zoom} onClose={() => setZoom(false)} title={current.alt} size="xl">
        <div className="bg-surface">
          <NextImage width={1600} height={2000} src={current.url} alt={current.alt} className="mx-auto max-h-[78dvh] w-auto object-contain" />
        </div>
      </Dialog>
    </section>
  );
}
