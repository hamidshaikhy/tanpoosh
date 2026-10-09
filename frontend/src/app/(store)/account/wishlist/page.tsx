"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageTitle } from "@/components/account/AccountShell";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { account as copy, product } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { WishlistEntry } from "@/lib/api/types";
import { keys } from "@/lib/queries";

export default function WishlistPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: keys.wishlist, queryFn: () => api<WishlistEntry[]>("/account/wishlist") });
  const remove = useMutation({
    mutationFn: (slug: string) => api(`/account/wishlist/${encodeURIComponent(slug)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wishlist }),
  });
  return (
    <div>
      <PageTitle>{copy.wishlist}</PageTitle>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
      {list.data && !list.data.length ? <EmptyBlock title={copy.noWishlist} icon="heart" /> : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
        {list.data?.map((w) => (
          <div key={w.product.id} className="flex flex-col gap-2">
            <ProductCard product={w.product} />
            {!w.product.available ? <p className="text-xs text-danger">این محصول دیگر فروخته نمی‌شود.</p> : null}
            <button type="button" className="self-start text-sm text-muted underline hover:text-danger" onClick={() => remove.mutate(w.product.slug)}>
              {product.wishlistRemove}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
