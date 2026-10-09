"use client";

import { useRef, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { ButtonLink, Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { StudioManifest, StudioProduct } from "@/lib/api/types";
import { faDigits } from "@/lib/format";
import { PREBUILT, sanitizeOutfit } from "@/studio/looks";
import { PhotoComposition } from "@/studio/PhotoComposition";
import { previewFiles } from "@/studio/preview";
import { encodeOutfit, SLOTS } from "@/studio/store";

const descriptions = ["بافت روشن، کتان و لوفر جیر", "پیراهن آبی و شلوار پارچه‌ای", "تیشرت ساده، جین و کتانی"];

export function LookDiscovery({ manifest, products }: { manifest: StudioManifest; products: StudioProduct[] }) {
  const looks = [PREBUILT[0], PREBUILT[1], PREBUILT[3]].map((look, index) => {
    const { outfit, dropped } = sanitizeOutfit(look.outfit, products, { supportedOnly: true });
    return { ...look, outfit, description: descriptions[index], files: dropped ? null : previewFiles(manifest, outfit, products) };
  }).filter(look => look.files);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const look = looks[selected];
  if (!look) return null;

  const choose = async (index: number) => {
    const token = ++request.current;
    setError(false);
    if (index === selected) { setPending(null); return; }
    setPending(index);
    try {
      await Promise.all([manifest.model.file, ...looks[index].files!].map(async file => {
        const image = new Image(); image.src = file; await image.decode();
      }));
      if (request.current === token) { setSelected(index); setPending(null); }
    } catch {
      if (request.current === token) { setPending(null); setError(true); }
    }
  };

  return <section aria-labelledby="discover-title" className="border-y border-line-soft bg-[#e7e2d8]" data-testid="look-discovery">
    <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
      <div className="order-1 px-5 pt-10 pb-6 sm:px-10 lg:pb-0 lg:pt-16">
        <p className="flex items-center gap-3 text-xs text-ink-soft"><span className="h-px w-8 bg-ink" />استودیو تن‌پوش</p>
        <h2 id="discover-title" className="mt-5 text-3xl leading-relaxed font-bold sm:text-4xl">چند انتخاب، یک استایل.</h2>
        <p className="mt-3 max-w-sm text-sm leading-7 text-ink-soft">از یک ترکیب شروع کن؛ ببینش و در استودیو به سلیقهٔ خودت تغییرش بده.</p>
      </div>
      <div className="order-3 px-5 pt-5 pb-10 sm:px-10 lg:order-2 lg:pt-7 lg:pb-16">
        <div className="flex border-t border-ink/15 lg:block" role="group" aria-label="انتخاب استایل پیشنهادی">
          {looks.map((item, index) => <button key={item.name} type="button" aria-pressed={selected === index} aria-controls="discovery-photo" onClick={() => void choose(index)}
            className={`group flex min-w-0 flex-1 flex-col items-start gap-2 border-b border-ink/15 px-2 py-3 text-start transition-colors lg:w-full lg:flex-row lg:items-center lg:gap-4 lg:px-3 lg:py-4 ${selected === index ? "bg-bg/70" : "hover:bg-bg/30"}`}>
            <span className={`num flex size-6 shrink-0 items-center justify-center text-xs lg:size-8 ${selected === index ? "bg-accent text-ink" : "text-muted"}`}>{faDigits(`0${index + 1}`)}</span>
            <span className="flex-1"><span className="block text-xs font-semibold sm:text-sm">{item.name}</span><span className="mt-1 hidden text-xs text-ink-soft lg:block">{item.description}</span></span>
            <span className="hidden lg:block">{pending === index ? <Spinner /> : <Icon name="arrow" className="size-4" />}</span>
          </button>)}
        </div>
        <div className="mt-5 flex gap-2" aria-label={`اجزای ${look.name}`}>
          {SLOTS.flatMap(slot => {
            const selection = look.outfit[slot];
            const product = products.find(p => p.slug === selection?.slug);
            const photo = product?.colors.find(c => c.code === selection?.color)?.image ?? product?.primary_image;
            return product && photo ? [<Link key={slot} href={`/products/${product.slug}?color=${selection?.color}`} title={product.name} className="group flex size-16 items-center justify-center border border-ink/10 bg-bg/50 transition-colors hover:border-ink">
              <NextImage src={photo.thumb} alt={product.name} width={96} height={120} className="size-full object-contain mix-blend-multiply motion-safe:transition-transform motion-safe:group-hover:scale-105" loading="lazy" />
            </Link>] : [];
          })}
        </div>
        <p role="status" className="mt-2 min-h-5 text-xs text-ink-soft">{pending !== null ? "در حال آماده شدن تصویر…" : error ? "تصویر بارگیری نشد؛ دوباره انتخاب کن." : ""}</p>
        <ButtonLink href={`/studio?outfit=${encodeURIComponent(encodeOutfit(look.outfit))}`} className="mt-3 w-full justify-between sm:w-auto sm:min-w-64" size="lg" icon={<Icon name="arrow" />}>این استایل را تغییر بده</ButtonLink>
      </div>
      <div id="discovery-photo" aria-busy={pending !== null} className="relative order-2 flex min-w-0 flex-col items-center justify-center overflow-hidden bg-[#ece8df] px-4 py-4 lg:order-3 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:py-6">
        <span className="absolute top-6 left-6 text-[10px] tracking-[0.2em] text-muted" dir="ltr">THE EVERYDAY EDIT</span>
        <div className="h-[330px] w-full sm:h-[420px] lg:h-[580px]">
          <PhotoComposition manifest={manifest} files={look.files!} label={`پیش‌نمایش ${look.name}`} />
        </div>
        <p className="mt-2 text-xs text-ink-soft" aria-live="polite">{look.name} <span className="mx-2 text-line">/</span> {faDigits(selected + 1)} از {faDigits(looks.length)}</p>
      </div>
    </div>
  </section>;
}
