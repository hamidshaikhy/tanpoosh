"use client";

import { useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import type { ProductCard } from "@/lib/api/types";
import { toman, faDigits } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function EyewearEdit({ products }: { products: ProductCard[] }) {
  const [selected, setSelected] = useState(0);
  const product = products[selected];
  if (!product) return null;
  return <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20 lg:px-8" aria-labelledby="eyewear-title" data-testid="eyewear-edit">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-xs text-muted">جزئیات، تفاوت می‌سازند</p><h2 id="eyewear-title" className="text-3xl font-bold sm:text-[2.1rem]">عینک آفتابی</h2></div>
      <Link href="/shop?category=sunglasses" className="flex items-center gap-2 text-sm underline decoration-accent decoration-2 underline-offset-8">همهٔ عینک‌ها<Icon name="arrow" className="size-4" /></Link>
    </div>
    <div className="grid overflow-hidden border border-line-soft md:grid-cols-[1fr_1.15fr]">
      <div className="flex flex-col justify-center px-5 py-8 sm:p-10">
        <p className="max-w-sm text-2xl leading-relaxed font-medium">قابِ نگاهت را انتخاب کن.</p>
        <p className="mt-2 text-sm leading-7 text-ink-soft">فرم‌های کلاسیک، برای امضای آخر استایل تو.</p>
        <div role="group" aria-label="انتخاب مدل عینک" className="mt-7 flex flex-wrap gap-3">
          {products.map((item, index) => <button key={item.id} type="button" aria-label={item.name} aria-pressed={selected === index} aria-controls="eyewear-detail" onClick={() => setSelected(index)}
            className={`w-20 border p-1 transition-colors sm:w-24 ${selected === index ? "border-ink bg-surface" : "border-line-soft hover:border-ink/50"}`}>
            {item.primary_image ? <NextImage src={item.primary_image.thumb} alt="" width={160} height={120} className="aspect-[4/3] w-full object-cover mix-blend-multiply" loading="lazy" /> : <span>{item.name}</span>}
            <span className="mt-1 block text-[10px] text-muted">{faDigits(`0${index + 1}`)}</span>
          </button>)}
        </div>
        <div id="eyewear-detail" aria-live="polite" className="mt-6">
          <h3 className="text-base font-semibold">{product.name}</h3>
          <p className="num mt-2 text-sm text-ink-soft">{toman(product.price_min)}</p>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-5">
          <ButtonLink href={`/products/${product.slug}`} icon={<Icon name="arrow" className="size-4" />}>مشاهدهٔ جزئیات</ButtonLink>
          {product.studio_supported ? <Link href={`/studio?product=${product.slug}`} className="text-sm underline underline-offset-8">روی مدل ببین</Link> : null}
        </div>
      </div>
      <div className="relative flex aspect-[5/4] items-center justify-center bg-surface md:aspect-auto md:min-h-[420px]">
        {products.map((item, index) => item.primary_image ? <NextImage key={item.id} src={item.primary_image.url} alt={index === selected ? item.name : ""} aria-hidden={index !== selected}
          fill sizes="(min-width: 768px) 600px, 100vw" loading="lazy" className={`object-contain mix-blend-multiply motion-safe:transition-opacity motion-safe:duration-300 ${index === selected ? "opacity-100" : "opacity-0"}`} /> : null)}
        <span className="absolute right-5 bottom-5 text-[10px] tracking-[0.2em] text-muted" dir="ltr">TANPOOSH EYEWEAR</span>
      </div>
    </div>
  </section>;
}
