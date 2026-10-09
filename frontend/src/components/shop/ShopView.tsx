import Link from "next/link";

import { ProductCard } from "@/components/product/ProductCard";
import { EmptyBlock, ErrorBlock } from "@/components/ui/States";
import { common, shop } from "@/content/fa";
import { getFilters, getProducts } from "@/lib/api/public";
import { ServerApiError } from "@/lib/api/server";
import type { Filters, Paginated, ProductCard as Card } from "@/lib/api/types";
import { faDigits } from "@/lib/format";

import { FilterPanel } from "./FilterPanel";

export async function ShopView({
  query,
  basePath,
  title,
  intro,
  fixed = {},
}: {
  query: Record<string, string | undefined>;
  basePath: string;
  title?: string;
  intro?: string;
  fixed?: Record<string, string>;
}) {
  let data: Paginated<Card> | null = null;
  let filters: Filters | null = null;
  let error: string | null = null;
  try {
    [data, filters] = await Promise.all([getProducts({ ...query, ...fixed, page_size: "24" }), getFilters()]);
  } catch (err) {
    error = err instanceof ServerApiError && err.status === 400 ? "فیلتر واردشده معتبر نیست." : err instanceof ServerApiError && err.status === 404 ? "این صفحه از نتایج وجود ندارد." : common.serverDown;
  }
  const heading = title ?? (query.q ? shop.searchResults(query.q) : query.is_new ? shop.newest : shop.title);
  const page = Number(query.page || 1);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "page") params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line-soft pb-6">
        <div>
          <h1 className="text-3xl font-bold">{heading}</h1>
          {intro ? <p className="mt-2 max-w-2xl text-ink-soft">{intro}</p> : null}
        </div>
        {data ? (
          <p className="text-sm text-muted" aria-live="polite">
            {shop.results(faDigits(data.count))}
          </p>
        ) : null}
      </div>
      {error ? <ErrorBlock message={error} /> : null}
      {data && filters ? (
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <FilterPanel filters={filters} query={query} basePath={basePath} fixed={fixed} />
          <section aria-label="نتایج">
            {data.results.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6">
                {data.results.map((p, i) => (
                  <ProductCard key={p.id} product={p} priority={i < 3} />
                ))}
              </div>
            ) : (
              <EmptyBlock
                title={shop.empty}
                hint={shop.emptyHint}
                icon="search"
                action={
                  <Link href={basePath} className="text-sm underline decoration-accent decoration-2 underline-offset-8">
                    {shop.clearFilters}
                  </Link>
                }
              />
            )}
            {data.total_pages > 1 ? (
              <nav className="mt-12 flex items-center justify-center gap-6 text-sm" aria-label="صفحه‌بندی">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="underline decoration-accent decoration-2 underline-offset-8" rel="prev">
                    {shop.prev}
                  </Link>
                ) : (
                  <span className="text-muted">{shop.prev}</span>
                )}
                <span className="text-muted">{shop.page(faDigits(data.page), faDigits(data.total_pages))}</span>
                {page < data.total_pages ? (
                  <Link href={pageHref(page + 1)} className="underline decoration-accent decoration-2 underline-offset-8" rel="next">
                    {shop.next}
                  </Link>
                ) : (
                  <span className="text-muted">{shop.next}</span>
                )}
              </nav>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
