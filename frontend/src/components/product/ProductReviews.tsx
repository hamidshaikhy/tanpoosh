"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextareaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { product as copy } from "@/content/fa";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Paginated, Review } from "@/lib/api/types";
import { faDigits, jalali } from "@/lib/format";
import { useMe } from "@/lib/queries";

function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={label ?? `${faDigits(value)} از ۵ ستاره`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" className={`size-4 ${i <= value ? "text-ink" : "text-line"}`} fill={i <= value ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

export function ProductReviews({ slug, rating }: { slug: string; rating: { average: number | null; count: number } }) {
  const [page, setPage] = useState(1);
  const reviews = useQuery({
    queryKey: ["public", "reviews", slug, page],
    queryFn: () => api<Paginated<Review>>(`/catalog/products/${encodeURIComponent(slug)}/reviews`, { query: { page } }),
  });
  return (
    <section id="reviews" className="mt-20 scroll-mt-8 border-t border-line pt-10" aria-labelledby="reviews-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 id="reviews-title" className="text-2xl font-bold">
          {copy.reviews}
        </h2>
        {rating.count > 0 && rating.average !== null ? (
          <div className="flex items-center gap-3 text-sm text-ink-soft">
            <Stars value={Math.round(rating.average)} />
            <span>{copy.ratingLabel(faDigits(rating.average.toFixed(1).replace(".", "٫")), faDigits(rating.count))}</span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          {reviews.isLoading ? <LoadingBlock /> : null}
          {reviews.isError ? <ErrorBlock message={errorMessage(reviews.error)} onRetry={() => reviews.refetch()} /> : null}
          {reviews.data && reviews.data.results.length === 0 ? <p className="text-ink-soft">{copy.noReviews}</p> : null}
          <ul className="divide-y divide-line-soft">
            {reviews.data?.results.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={r.rating} />
                  <span className="text-sm font-medium">{r.author}</span>
                  {r.verified_purchase ? <span className="text-xs text-success">{copy.verifiedPurchase}</span> : null}
                  <span className="text-xs text-muted">{jalali(r.created_at)}</span>
                </div>
                {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
                <p className="mt-1 whitespace-pre-line leading-8 text-ink-soft">{r.body}</p>
              </li>
            ))}
          </ul>
          {reviews.data && reviews.data.total_pages > 1 ? (
            <div className="mt-4 flex gap-4 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="underline disabled:no-underline disabled:opacity-40">
                قبلی
              </button>
              <button type="button" disabled={page >= reviews.data.total_pages} onClick={() => setPage((p) => p + 1)} className="underline disabled:no-underline disabled:opacity-40">
                بعدی
              </button>
            </div>
          ) : null}
        </div>
        <ReviewForm slug={slug} />
      </div>
    </section>
  );
}

function ReviewForm({ slug }: { slug: string }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const submit = useMutation({
    mutationFn: () => api<{ detail: string }>(`/catalog/products/${encodeURIComponent(slug)}/reviews`, { method: "POST", body: { rating, title, body } }),
  });
  if (!me?.authenticated) {
    return (
      <div className="border border-line bg-elevated p-5 text-sm text-ink-soft">
        برای ثبت نظر{" "}
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="underline decoration-accent decoration-2 underline-offset-8">
          وارد شوید
        </Link>
        . فقط خریدارانی که سفارششان تحویل شده می‌توانند نظر بنویسند.
      </div>
    );
  }
  if (submit.isSuccess) return <Notice tone="success">{submit.data.detail}</Notice>;
  const errors = fieldErrors(submit.error);
  return (
    <form
      className="flex flex-col gap-4 border border-line bg-elevated p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <h3 className="font-medium">{copy.writeReview}</h3>
      <fieldset>
        <legend className="mb-2 text-sm text-ink-soft">امتیاز</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className="cursor-pointer p-1">
              <input type="radio" name="rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="peer sr-only" />
              <Icon name="star" className={`size-6 peer-focus-visible:outline-2 ${i <= rating ? "text-ink" : "text-line"}`} fill={i <= rating ? "currentColor" : "none"} />
              <span className="sr-only">{faDigits(i)} ستاره</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="عنوان" optionalLabel="اختیاری" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} error={errors.title} />
      <TextareaField label="متن نظر" required value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} error={errors.body} />
      {submit.error instanceof ApiError && !Object.keys(errors).length ? <Notice tone="danger">{submit.error.message}</Notice> : null}
      <Button type="submit" loading={submit.isPending}>
        {copy.writeReview}
      </Button>
    </form>
  );
}
