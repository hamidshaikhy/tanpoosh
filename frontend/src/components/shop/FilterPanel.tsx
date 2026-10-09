"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { shop } from "@/content/fa";
import type { Filters } from "@/lib/api/types";
import { faDigits, sizeLabel, toAsciiDigits } from "@/lib/format";

/** Filters live in the URL: back/forward and shared links reproduce the exact result set. */
export function FilterPanel({
  filters,
  query,
  basePath,
  fixed,
}: {
  filters: Filters;
  query: Record<string, string | undefined>;
  basePath: string;
  fixed: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(query.min_price ? faDigits(query.min_price) : "");
  const [maxPrice, setMaxPrice] = useState(query.max_price ? faDigits(query.max_price) : "");

  const selected = (key: string) => (query[key] ? query[key]!.split(",").filter(Boolean) : []);

  const navigate = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "page") params.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const toggleList = (key: string, value: string) => {
    const current = selected(key);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    navigate({ [key]: next.join(",") || null });
  };

  const activeCount = ["category", "size", "color", "min_price", "max_price", "in_stock", "studio"].filter((k) => query[k] && !fixed[k]).length;

  const body = (
    <div className="flex flex-col gap-7 text-sm">
      <div className="flex items-center justify-between">
        <label htmlFor="sort" className="text-ink-soft">
          {shop.sort}
        </label>
        <select
          id="sort"
          value={query.sort || (query.q ? "newest" : "featured")}
          onChange={(e) => navigate({ sort: e.target.value })}
          className="h-10 border border-line bg-elevated px-2 text-sm"
        >
          {filters.sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {!fixed.category ? (
        <fieldset>
          <legend className="mb-3 font-medium">{shop.category}</legend>
          <ul className="flex flex-col gap-2">
            <li>
              <button type="button" onClick={() => navigate({ category: null })} className={`text-start ${!query.category ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`} aria-pressed={!query.category}>
                {shop.all}
              </button>
            </li>
            {filters.categories.map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => navigate({ category: query.category === c.slug ? null : c.slug })}
                  className={`flex w-full justify-between text-start ${query.category === c.slug ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
                  aria-pressed={query.category === c.slug}
                >
                  <span>{c.name}</span>
                  <span className="text-muted">{faDigits(c.product_count)}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="mb-3 font-medium">{shop.size}</legend>
        <div className="flex flex-wrap gap-2">
          {filters.sizes.map((s) => {
            const on = selected("size").includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleList("size", s)}
                aria-pressed={on}
                className={`ltr h-9 min-w-10 border px-2 ${on ? "border-ink bg-ink text-bg" : "border-line hover:border-ink"}`}
              >
                {sizeLabel(s)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-medium">{shop.color}</legend>
        <div className="flex flex-wrap gap-2.5">
          {filters.colors.map((c) => {
            const on = selected("color").includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggleList("color", c.code)}
                aria-pressed={on}
                title={c.name}
                aria-label={c.name}
                className={`size-8 rounded-full border border-ink/20 ring-offset-2 ring-offset-bg ${on ? "ring-2 ring-ink" : ""}`}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-medium">{shop.price}</legend>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const min = toAsciiDigits(minPrice).replace(/[^\d]/g, "");
            const max = toAsciiDigits(maxPrice).replace(/[^\d]/g, "");
            navigate({ min_price: min || null, max_price: max || null });
          }}
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">{shop.minPrice}</span>
            <input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="h-10 w-full border border-line bg-elevated px-2" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">{shop.maxPrice}</span>
            <input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-10 w-full border border-line bg-elevated px-2" />
          </label>
          <button type="submit" className="h-10 border border-ink px-3 hover:bg-ink hover:text-bg">
            {shop.apply}
          </button>
        </form>
      </fieldset>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="size-4 accent-ink" checked={query.in_stock === "1"} onChange={(e) => navigate({ in_stock: e.target.checked ? "1" : null })} />
          {shop.inStock}
        </label>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="size-4 accent-ink" checked={query.studio === "1"} onChange={(e) => navigate({ studio: e.target.checked ? "1" : null })} />
          {shop.studioOnly}
        </label>
      </div>

      {activeCount ? (
        <Link href={basePath} className="self-start underline decoration-accent decoration-2 underline-offset-8">
          {shop.clearFilters}
        </Link>
      ) : null}
    </div>
  );

  return (
    <aside aria-label={shop.filters} className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between border border-line px-4 py-3 text-sm lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-controls="filter-body"
      >
        <span className="flex items-center gap-2">
          <Icon name="grid" className="size-4" />
          {shop.filters}
          {activeCount ? <span className="bg-ink px-1.5 text-xs text-bg">{faDigits(activeCount)}</span> : null}
        </span>
        <Icon name="chevron-down" className={`size-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`} />
      </button>
      <div id="filter-body" className={`${mobileOpen ? "block" : "hidden"} mt-4 lg:sticky lg:top-6 lg:mt-0 lg:block`}>
        {body}
      </div>
      {pending ? (
        <div className="absolute -top-8 left-0 flex items-center gap-2 text-xs text-muted" role="status">
          <Spinner className="size-3.5" /> در حال به‌روزرسانی…
        </div>
      ) : null}
    </aside>
  );
}
