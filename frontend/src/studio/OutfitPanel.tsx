"use client";

import NextImage from "next/image";

import Link from "next/link";
import { useId } from "react";

import { SizeGuideButton } from "@/components/product/SizeGuide";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { studio as copy } from "@/content/fa";
import type { StudioProduct, StudioSlot } from "@/lib/api/types";
import { faDigits, sizeLabel, toman } from "@/lib/format";
import { sizeSortKey } from "@/lib/sizes";

import { useStudio, type Selection } from "./store";

type Line = { slot: StudioSlot; sel: Selection; product: StudioProduct };

export function OutfitPanel({
  lines,
  total,
  errors,
  onAddLook,
  adding,
  onSave,
  saving,
  onShare,
  sharing,
  onClearError,
  compact = false,
}: {
  lines: Line[];
  total: number;
  errors: Partial<Record<StudioSlot, string>>;
  onAddLook: () => void;
  adding: boolean;
  onSave: () => void;
  saving: boolean;
  onShare: () => void;
  sharing: boolean;
  onClearError: (slot: StudioSlot) => void;
  compact?: boolean;
}) {
  const panelId = useId();
  const update = useStudio((s) => s.update);
  const setSlot = useStudio((s) => s.set);
  return (
    <div className={`flex flex-col gap-5 ${compact ? "p-4" : "p-5 xl:p-6"}`}>
      {!compact ? (
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="text-2xl font-bold">{copy.yourStyle}</h2>
          <span className="text-sm text-muted">{copy.pieces(faDigits(lines.length))}</span>
        </div>
      ) : null}
      {!lines.length ? <p className="py-6 text-sm text-muted">{copy.empty}</p> : null}
      <ul className="flex flex-col divide-y divide-line-soft" data-testid="outfit-lines">
        {lines.map(({ slot, sel, product }) => {
          const variants = product.variants.filter((v) => v.color_code === sel.color).sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
          const variant = variants.find((v) => v.size === sel.size);
          const img = product.colors.find((c) => c.code === sel.color)?.image ?? product.primary_image;
          const selectId = `size-${slot}-${panelId}`;
          return (
            <li key={slot} className="flex gap-3 py-4">
              {img ? <NextImage width={1600} height={2000} src={img.thumb} alt="" className="aspect-square w-20 bg-surface object-cover mix-blend-multiply xl:w-24" /> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">{copy.slots[slot]}</p>
                    <Link href={`/products/${product.slug}?color=${sel.color}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                  </div>
                  <button type="button" onClick={() => setSlot(slot, null)} className="-m-1 p-1 text-muted hover:text-ink" aria-label={`${copy.remove}: ${product.name}`}>
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
                <p className="num text-sm">{toman(variant?.price_toman ?? product.price_min)}</p>
                {!product.studio_supported ? <p className="text-[11px] text-warning">{copy.unsupported}</p> : null}
                <div className="flex items-center gap-1.5" role="radiogroup" aria-label={`رنگ ${product.name}`}>
                  {product.colors.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      role="radio"
                      aria-checked={sel.color === c.code}
                      aria-label={c.name}
                      title={c.name}
                      onClick={() => {
                        const available = product.variants.filter((v) => v.color_code === c.code && v.in_stock);
                        const size = available.some((v) => v.size === sel.size) ? sel.size : available.length === 1 && available[0].size === "ONE" ? "ONE" : null;
                        update(slot, { color: c.code, size });
                        onClearError(slot);
                      }}
                      className={`size-5 rounded-full border border-ink/20 ring-offset-2 ring-offset-bg ${sel.color === c.code ? "ring-2 ring-ink" : ""}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={selectId} className="sr-only">
                    سایز {product.name}
                  </label>
                  <select
                    id={selectId}
                    value={sel.size ?? ""}
                    onChange={(e) => {
                      update(slot, { size: e.target.value || null });
                      onClearError(slot);
                    }}
                    className={`ltr h-9 min-w-24 border bg-elevated px-2 text-sm ${errors[slot] ? "border-danger" : "border-line"}`}
                    aria-invalid={errors[slot] ? true : undefined}
                    aria-describedby={errors[slot] ? `${selectId}-err` : undefined}
                  >
                    <option value="">سایز…</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.size} disabled={!v.in_stock}>
                        {sizeLabel(v.size)}
                        {!v.in_stock ? " — ناموجود" : ""}
                      </option>
                    ))}
                  </select>
                  <SizeGuideButton chart={slot === "shoes" ? "shoes" : slot === "bottom" ? "bottoms" : "tops"} />
                </div>
                {errors[slot] ? (
                  <p id={`${selectId}-err`} className="text-xs text-danger" role="alert">
                    {errors[slot]}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="text-lg font-semibold">{copy.total}</span>
        <span className="num text-xl font-bold" data-testid="studio-total">
          {toman(total)}
        </span>
      </div>
      <Button size="lg" onClick={onAddLook} loading={adding} disabled={!lines.length} icon={<Icon name="arrow" />} className="justify-between" data-testid="add-look">
        {copy.addLook}
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onSave} loading={saving} disabled={!lines.length} icon={<Icon name="bookmark" />}>
          {copy.saveLook}
        </Button>
        <Button variant="secondary" onClick={onShare} loading={sharing} disabled={!lines.length} icon={<Icon name="share" />}>
          {copy.share}
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted">{copy.fitDisclaimer}</p>
    </div>
  );
}
