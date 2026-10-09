"use client";

import NextImage from "next/image";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { search as copy } from "@/content/fa";
import { api } from "@/lib/api/client";
import type { Paginated, ProductCard } from "@/lib/api/types";
import { toman } from "@/lib/format";
import { useUI } from "@/lib/ui-store";

export function SearchDialog() {
  const open = useUI((s) => s.searchOpen);
  const setSearch = useUI((s) => s.setSearch);
  const router = useRouter();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const results = useQuery({
    queryKey: ["public", "search", deferred],
    queryFn: ({ signal }) => api<Paginated<ProductCard>>("/catalog/products", { query: { q: deferred, page_size: 6 }, signal }),
    enabled: open && deferred.length >= 2,
    staleTime: 60_000,
  });

  const submit = () => {
    if (!q.trim()) return;
    setSearch(false);
    router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <Dialog open={open} onClose={() => setSearch(false)} title={copy.label} size="lg">
      <form
        role="search"
        className="flex items-center gap-3 border-b border-line px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="search" className="size-5 text-muted" />
        <label htmlFor="site-search" className="sr-only">
          {copy.label}
        </label>
        <input
          id="site-search"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
          placeholder={copy.placeholder}
          className="h-11 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
          autoComplete="off"
        />
        <button type="submit" className="text-sm underline decoration-accent decoration-2 underline-offset-8">
          {copy.submit}
        </button>
      </form>
      <div className="px-5 py-4" aria-live="polite">
        {deferred.length >= 2 && results.data ? (
          results.data.results.length ? (
            <>
              <ul className="divide-y divide-line-soft">
                {results.data.results.map((p) => (
                  <li key={p.id}>
                    <Link href={`/products/${p.slug}`} onClick={() => setSearch(false)} className="flex items-center gap-4 py-3 hover:bg-surface-alt/40">
                      {p.primary_image ? <NextImage width={1600} height={2000} src={p.primary_image.thumb} alt="" className="aspect-[4/5] w-14 bg-surface object-cover" /> : null}
                      <span className="flex-1">{p.name}</span>
                      <span className="num text-sm text-ink-soft">{toman(p.price_min)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={submit} className="mt-3 text-sm underline decoration-accent decoration-2 underline-offset-8">
                {copy.seeAll}
              </button>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted">{copy.noResults}</p>
          )
        ) : null}
      </div>
    </Dialog>
  );
}
