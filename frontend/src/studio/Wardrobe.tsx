"use client";

import NextImage from "next/image";
import Link from "next/link";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { studio as copy } from "@/content/fa";
import type { StudioProduct, StudioSlot } from "@/lib/api/types";

import { SLOTS, useStudio } from "./store";
import { PREBUILT, sanitizeOutfit } from "./looks";

export function Wardrobe({ products, onPick }: { products: StudioProduct[]; onPick: (slot: StudioSlot, p: StudioProduct, color?: string) => void }) {
  const [tab, setTab] = useState<StudioSlot>("top");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const outfit = useStudio((s) => s.outfit);
  const replace = useStudio((s) => s.replace);
  const list = products.filter((p) => p.studio_slot === tab && (showUnavailable || (p.studio_supported && p.studio_asset)))
    .sort((a, b) => Number(b.studio_supported) - Number(a.studio_supported));

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-5">
      <div role="tablist" aria-label={copy.wardrobe} className="sticky -top-3 z-10 flex shrink-0 overflow-x-auto border-b border-line bg-bg scrollbar-none lg:-top-5">
        {SLOTS.map((slot) => (
          <button
            key={slot}
            role="tab"
            type="button"
            id={`tab-${slot}`}
            aria-selected={tab === slot}
            aria-controls={`panel-${slot}`}
            onClick={() => setTab(slot)}
            className={`flex-1 shrink-0 px-3 py-2.5 text-[15px] whitespace-nowrap ${tab === slot ? "border-b-2 border-ink font-semibold" : "text-ink-soft"}`}
          >
            {copy.slots[slot]}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-ink-soft">{copy.pickHint}</p>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} className="accent-ink" />
        {copy.showUnavailable}
      </label>
      {!list.length ? <p className="text-sm text-muted">{copy.noPreviewInSlot}</p> : null}
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex gap-3 overflow-x-auto pb-1 scrollbar-none lg:grid lg:grid-cols-2 lg:overflow-visible">
        {list.map((p) => {
          const selected = outfit[tab]?.slug === p.slug;
          const img = p.colors.find((c) => c.code === (selected ? outfit[tab]?.color : p.colors[0]?.code))?.image ?? p.primary_image;
          return (
            <article
              key={p.id}
              className={`relative flex w-36 shrink-0 flex-col gap-2 border bg-surface p-2 text-start transition-colors lg:w-auto ${selected ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-line"}`}
              data-product={p.slug}
            >
              <button
                type="button"
                disabled={!p.studio_supported || !p.studio_asset}
                onClick={() => onPick(tab, p)}
                aria-pressed={selected}
                aria-label={`${copy.pickForPreview}: ${p.name}`}
                className="flex flex-col gap-2 text-start disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="wardrobe-item"
              >
                {img ? <NextImage width={640} height={640} src={img.thumb} alt="" className="aspect-square w-full object-cover mix-blend-multiply" loading="lazy" /> : <span className="aspect-square w-full" />}
                <span className="text-sm font-medium">{p.name}</span>
                {p.studio_supported ? <span className={`flex items-center gap-1 text-[11px] ${selected ? "font-semibold text-ink" : "text-ink-soft"}`}>
                  {selected ? <Icon name="check" className="size-3" /> : <Icon name="plus" className="size-3" />}
                  {selected ? copy.selected : copy.pickForPreview}
                </span> : <span className="text-[11px] text-warning">{copy.unsupported}</span>}
              </button>
              {p.studio_supported ? <div className="flex gap-2" role="group" aria-label={`رنگ ${p.name}`}>
                {p.colors.map((c) => <button key={c.code} type="button" aria-label={`${c.name}، ${p.name}`} aria-pressed={selected && outfit[tab]?.color === c.code}
                  onClick={() => onPick(tab, p, c.code)} title={c.name}
                  className={`size-5 rounded-full border border-ink/20 ${selected && outfit[tab]?.color === c.code ? "ring-1 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
                  style={{backgroundColor:c.hex}} />)}
              </div> : <Link href={`/products/${p.slug}`} className="text-xs underline underline-offset-4">{copy.viewProduct}</Link>}
            </article>
          );
        })}
      </div>

      <section aria-labelledby="prebuilt-title">
        <h2 id="prebuilt-title" className="mb-3 text-sm font-semibold">
          {copy.prebuilt}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {PREBUILT.map((look) => (
            <li key={look.name}>
              <button
                type="button"
                onClick={() => replace(sanitizeOutfit(look.outfit, products, {supportedOnly:true}).outfit)}
                className="border border-line px-3 py-1.5 text-sm hover:border-ink"
              >
                {look.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="flatlay-title" className="hidden lg:block">
        <h2 id="flatlay-title" className="mb-3 border-t border-line pt-4 text-sm font-semibold">
          {copy.preview}
        </h2>
        <ul className="grid grid-cols-4 gap-2" aria-live="polite">
          {SLOTS.map((slot) => {
            const sel = outfit[slot];
            const p = sel ? products.find((x) => x.slug === sel.slug) : null;
            const img = p?.colors.find((c) => c.code === sel?.color)?.image ?? p?.primary_image;
            return (
              <li key={slot} className="flex aspect-[4/5] items-center justify-center bg-surface" title={copy.slots[slot]}>
                {img ? <NextImage width={1600} height={2000} src={img.thumb} alt={`${copy.slots[slot]}: ${p?.name}`} className="size-full object-cover mix-blend-multiply" /> : <span className="text-[11px] text-muted">{copy.slots[slot]}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
