"use client";

import NextImage from "next/image";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { product as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { ProductDetail } from "@/lib/api/types";
import { toman } from "@/lib/format";
import { useAddToCart } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

import { ColorPicker, SizePicker } from "./VariantPicker";

export function QuickAddDialog() {
  const slug = useUI((s) => s.quickAddSlug);
  const close = useUI((s) => s.closeQuickAdd);
  const query = useQuery({
    queryKey: ["public", "product", slug],
    queryFn: () => api<ProductDetail>(`/catalog/products/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug),
  });
  const p = query.data;
  return (
    <Dialog open={Boolean(slug)} onClose={close} title={p ? copy.quickAddTitle(p.name) : copy.quickAdd} size="lg">
      {query.isLoading ? <LoadingBlock /> : null}
      {query.isError ? <ErrorBlock message={errorMessage(query.error)} onRetry={() => query.refetch()} className="m-5" /> : null}
      {p ? <QuickAddBody key={p.slug} product={p} onDone={close} /> : null}
    </Dialog>
  );
}

function QuickAddBody({ product, onDone }: { product: ProductDetail; onDone: () => void }) {
  const firstInStock = product.colors.find((c) => c.in_stock) ?? product.colors[0];
  const [color, setColor] = useState<string | null>(firstInStock?.code ?? null);
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string>();
  const add = useAddToCart();

  const variant = useMemo(() => product.variants.find((v) => v.color_code === color && v.size === size), [product, color, size]);
  const image = product.media.find((m) => m.color_code === color) ?? product.primary_image;

  return (
    <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,220px)_1fr]">
      {image ? <NextImage width={1600} height={2000} src={image.thumb} alt={image.alt} className="aspect-[4/5] w-full bg-surface object-cover" /> : <div className="aspect-[4/5] bg-surface" />}
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-lg font-medium">{product.name}</p>
          <p className="num mt-1 text-[15px]">{toman(variant?.price_toman ?? product.price_min)}</p>
        </div>
        <ColorPicker
          colors={product.colors}
          value={color}
          onChange={(c) => {
            setColor(c);
            setSize(null);
          }}
          name="quick"
        />
        <SizePicker
          variants={product.variants}
          color={color}
          value={size}
          onChange={(s) => {
            setSize(s);
            setSizeError(undefined);
          }}
          name="quick"
          error={sizeError}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button
            loading={add.isPending}
            onClick={() => {
              if (!variant) {
                setSizeError(copy.selectSizeFirst);
                return;
              }
              add.mutate({ variant_id: variant.id }, { onSuccess: onDone });
            }}
            data-testid="quick-add-submit"
          >
            {copy.addToBag}
          </Button>
          <Link href={`/products/${product.slug}`} className="text-sm underline decoration-accent decoration-2 underline-offset-8" onClick={onDone}>
            جزئیات محصول
          </Link>
        </div>
      </div>
    </div>
  );
}
