"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Badge, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { home, product as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { ProductDetail, WishlistEntry } from "@/lib/api/types";
import { faDigits, toman } from "@/lib/format";
import { keys, useAddToCart, useMe } from "@/lib/queries";

import { ProductGallery } from "./ProductGallery";
import { SizeGuideButton } from "./SizeGuide";
import { ColorPicker, SizePicker } from "./VariantPicker";

export function ProductPurchase({ product, initialColor, initialSize }: { product: ProductDetail; initialColor: string | null; initialSize: string | null }) {
  const [color, setColor] = useState<string | null>(initialColor);
  const [size, setSize] = useState<string | null>(
    initialSize && product.variants.some((v) => v.color_code === initialColor && v.size === initialSize && v.in_stock) ? initialSize : null,
  );
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState<string>();
  const add = useAddToCart();
  const variant = useMemo(() => product.variants.find((v) => v.color_code === color && v.size === size), [product.variants, color, size]);
  const colorInStock = product.colors.find((c) => c.code === color)?.in_stock ?? false;
  const studioHref = `/studio?product=${encodeURIComponent(product.slug)}${color ? `&color=${encodeURIComponent(color)}` : ""}${size ? `&size=${encodeURIComponent(size)}` : ""}`;

  return (
    <>
      <ProductGallery product={product} color={color} />
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {product.is_new ? <Badge tone="accent">{home.newBadge}</Badge> : null}
            {!product.in_stock ? <Badge tone="dark">{copy.outOfStock}</Badge> : null}
          </div>
          <h1 className="text-3xl font-bold leading-[1.4]">{product.name}</h1>
          <p className="num text-xl">{toman(variant?.price_toman ?? product.price_min)}</p>
          {product.rating.count > 0 && product.rating.average !== null ? (
            <a href="#reviews" className="flex items-center gap-1.5 text-sm text-ink-soft">
              <Icon name="star" className="size-4 text-ink" fill="currentColor" />
              {copy.ratingLabel(faDigits(product.rating.average.toFixed(1).replace(".", "٫")), faDigits(product.rating.count))}
            </a>
          ) : null}
          {product.short_description ? <p className="leading-8 text-ink-soft">{product.short_description}</p> : null}
        </div>

        <ColorPicker
          colors={product.colors}
          value={color}
          onChange={(c) => {
            setColor(c);
            setSize(null);
            setQty(1);
          }}
          name="pdp"
        />
        <div className="flex flex-col gap-2">
          <SizePicker
            variants={product.variants}
            color={color}
            value={size}
            onChange={(s) => {
              setSize(s);
              setSizeError(undefined);
              setQty(1);
            }}
            name="pdp"
            error={sizeError}
          />
          <SizeGuideButton chart={product.size_chart} />
        </div>
        {variant?.low_stock ? <p className="text-sm text-warning">{copy.lowStock}</p> : null}
        {!colorInStock ? <Notice tone="warning">این رنگ در حال حاضر ناموجود است.</Notice> : null}

        <div className="flex flex-wrap items-stretch gap-3">
          <label className="sr-only" htmlFor="pdp-qty">
            {copy.quantity}
          </label>
          <select
            id="pdp-qty"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="h-12 border border-line bg-elevated px-3"
            disabled={!variant}
          >
            {Array.from({ length: Math.max(1, variant?.max_quantity ?? 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {faDigits(n)}
              </option>
            ))}
          </select>
          <Button
            size="lg"
            className="flex-1"
            loading={add.isPending}
            disabled={!product.in_stock}
            onClick={() => {
              if (!variant) {
                setSizeError(copy.selectSizeFirst);
                document.getElementById("pdp-size-error")?.scrollIntoView({ block: "center" });
                return;
              }
              add.mutate({ variant_id: variant.id, quantity: qty });
            }}
            data-testid="add-to-bag"
          >
            <Icon name="bag" />
            {copy.addToBag}
          </Button>
          <WishlistButton slug={product.slug} color={color} />
        </div>

        {product.studio_supported ? (
          <Link href={studioHref} className="flex items-center gap-2 self-start text-[15px] underline decoration-accent decoration-2 underline-offset-8">
            <Icon name="user" className="size-4.5" />
            {copy.tryOn}
          </Link>
        ) : product.studio_slot !== "none" ? (
          <p className="text-sm text-muted">{copy.studioUnsupported}</p>
        ) : null}

        <div className="divide-y divide-line-soft border-y border-line-soft">
          {[
            [copy.description, product.description],
            [copy.materials, product.materials],
            [copy.fit, product.fit_notes],
            [copy.care, product.care],
          ]
            .filter(([, text]) => text)
            .map(([title, text], i) => (
              <details key={title} className="group py-4" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                  {title}
                  <Icon name="chevron-down" className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-8 text-ink-soft">{text}</p>
              </details>
            ))}
        </div>
        <Link href="/pages/shipping" className="text-sm text-muted hover:text-ink">
          {copy.shippingNote}
        </Link>
      </div>
    </>
  );
}

function WishlistButton({ slug, color }: { slug: string; color: string | null }) {
  const { data: me, isLoading: authLoading } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const wishlist = useQuery({
    queryKey: keys.wishlist,
    queryFn: () => api<WishlistEntry[]>("/account/wishlist"),
    enabled: Boolean(me?.authenticated),
  });
  const saved = wishlist.data?.some((w) => w.product.slug === slug) ?? false;
  const toggle = useMutation({
    mutationFn: () =>
      saved
        ? api(`/account/wishlist/${encodeURIComponent(slug)}`, { method: "DELETE" })
        : api("/account/wishlist", { method: "POST", body: { product_slug: slug, color_code: color ?? "" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wishlist });
      toast.success(saved ? "از علاقه‌مندی‌ها حذف شد" : "به علاقه‌مندی‌ها اضافه شد");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <button
      type="button"
      className="flex size-12 items-center justify-center border border-line hover:border-ink"
      aria-pressed={saved}
      aria-label={saved ? copy.wishlistRemove : copy.wishlistAdd}
      disabled={toggle.isPending || authLoading}
      onClick={() => {
        if (!me?.authenticated) {
          toast.info(copy.wishlistLogin);
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        toggle.mutate();
      }}
    >
      <Icon name={saved ? "heart-fill" : "heart"} />
    </button>
  );
}
