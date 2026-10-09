"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageTitle } from "@/components/account/AccountShell";
import { Badge, EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { account as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { Review } from "@/lib/api/types";
import { faDigits, jalali } from "@/lib/format";

export default function MyReviewsPage() {
  const data = useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => api<{ reviews: Review[]; reviewable: { product_slug: string; product_name: string }[] }>("/account/reviews"),
  });
  return (
    <div className="flex flex-col gap-8">
      <PageTitle>{copy.reviews}</PageTitle>
      {data.isLoading ? <LoadingBlock /> : null}
      {data.isError ? <ErrorBlock message={errorMessage(data.error)} onRetry={() => data.refetch()} /> : null}
      {data.data?.reviewable.length ? (
        <section>
          <h2 className="mb-3 font-semibold">{copy.reviewable}</h2>
          <ul className="flex flex-wrap gap-3">
            {data.data.reviewable.map((p) => (
              <li key={p.product_slug}>
                <Link href={`/products/${p.product_slug}#reviews`} className="block border border-line px-4 py-2 text-sm hover:border-ink">
                  {p.product_name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.data && !data.data.reviews.length ? <EmptyBlock title={copy.noReviews} icon="star" /> : null}
      <ul className="divide-y divide-line-soft">
        {data.data?.reviews.map((r) => (
          <li key={r.id} className="py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/products/${r.product_slug}`} className="font-medium hover:underline">
                {r.product_name}
              </Link>
              <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "neutral"}>{r.status_label}</Badge>
            </div>
            <p className="mt-1 text-muted">
              {faDigits(r.rating)} از ۵ · {jalali(r.created_at)}
            </p>
            <p className="mt-2 whitespace-pre-line text-ink-soft">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
