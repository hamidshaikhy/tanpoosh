"use client";

import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { Icon } from "@/components/ui/Icon";
import type { ProductCard as Product } from "@/lib/api/types";
import { faDigits } from "@/lib/format";

export function ProductRail({ products }: { products: Product[] }) {
  const rail = useRef<HTMLUListElement>(null);
  const drag = useRef<{ pointerId: number; x: number; left: number; started: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ start: true, end: false, first: 1 });

  const finishDrag = () => {
    const gesture = drag.current;
    drag.current = null;
    if (!gesture?.started) return;
    suppressClickUntil.current = performance.now() + 250;
    const element = rail.current;
    if (element) {
      element.style.scrollSnapType = "";
      if (element.hasPointerCapture(gesture.pointerId)) element.releasePointerCapture(gesture.pointerId);
    }
    setDragging(false);
  };

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const distance = Math.abs(element.scrollLeft);
      const step = (element.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1;
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
      setPosition({ start: distance < 2, end: distance >= element.scrollWidth - element.clientWidth - 2, first: Math.min(products.length, Math.round(distance / (step + gap)) + 1) });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [products.length]);

  const move = (forward: boolean) => {
    const element = rail.current;
    if (!element) return;
    const card = element.children[0] as HTMLElement | undefined;
    const step = (card?.offsetWidth ?? element.clientWidth) + (parseFloat(getComputedStyle(element).columnGap) || 0);
    const perPage = Math.max(1, Math.floor((element.clientWidth + 1) / step));
    element.scrollBy({ left: (forward ? -1 : 1) * step * perPage, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return <div>
    <ul ref={rail} id="everyday-products" data-testid="everyday-products" aria-label="انتخاب‌های روزمره؛ فهرست قابل اسکرول" tabIndex={0}
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        const element = event.currentTarget;
        suppressClickUntil.current = 0;
        if ((event.target as HTMLElement).closest("button, input, select") || event.clientY >= element.getBoundingClientRect().top + element.clientHeight) return;
        drag.current = { pointerId: event.pointerId, x: event.clientX, left: element.scrollLeft, started: false };
      }}
      onPointerMove={event => {
        const gesture = drag.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (event.buttons === 0) { finishDrag(); return; }
        const distance = event.clientX - gesture.x;
        if (!gesture.started) {
          if (Math.abs(distance) < 6) return;
          gesture.started = true;
          event.currentTarget.style.scrollSnapType = "none";
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        event.preventDefault();
        event.currentTarget.scrollLeft = gesture.left - distance;
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      onPointerLeave={() => { if (drag.current && !drag.current.started) drag.current = null; }}
      onDragStart={event => event.preventDefault()}
      onClickCapture={event => {
        if (event.detail && performance.now() < suppressClickUntil.current) {
          event.preventDefault(); event.stopPropagation();
        }
      }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); move(event.key === "ArrowLeft");
      }}
      className={`product-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-5 select-none lg:gap-6 [&_button]:cursor-pointer ${dragging ? "cursor-grabbing [&_a]:cursor-grabbing" : "cursor-grab [&_a]:cursor-grab"}`}>
      {products.map(product => <li key={product.id} className="w-[72%] shrink-0 snap-start sm:w-[calc((100%_-_3rem)/3.2)] lg:w-[calc((100%_-_6rem)/4.2)]">
        <ProductCard product={product} />
      </li>)}
    </ul>
    <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-4">
      <p className="text-xs text-muted">برای انتخاب‌های بیشتر، با موس یا انگشت بکش <span className="ms-3 num text-ink" aria-live="polite">{faDigits(position.first)} / {faDigits(products.length)}</span></p>
      <div className="flex gap-2">
        <button type="button" aria-label="محصولات قبلی" aria-controls="everyday-products" disabled={position.start} onClick={() => move(false)} className="flex size-11 items-center justify-center border border-line transition-colors hover:border-ink disabled:opacity-25"><Icon name="arrow" className="size-5 rotate-180" /></button>
        <button type="button" aria-label="محصولات بعدی" aria-controls="everyday-products" disabled={position.end} onClick={() => move(true)} className="flex size-11 items-center justify-center border border-line transition-colors hover:border-ink disabled:opacity-25"><Icon name="arrow" className="size-5" /></button>
      </div>
    </div>
  </div>;
}
