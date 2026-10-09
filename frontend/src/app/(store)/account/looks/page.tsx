"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { PageTitle } from "@/components/account/AccountShell";
import { Badge, EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { account as copy, studio } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { SavedLook } from "@/lib/api/types";
import { jalali, sizeLabel } from "@/lib/format";
import { keys } from "@/lib/queries";

export default function LooksPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: keys.looks, queryFn: () => api<SavedLook[]>("/account/looks") });
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.looks });
  const share = useMutation({
    mutationFn: (look: SavedLook) => api<SavedLook>(`/account/looks/${look.id}/share`, { method: look.shared ? "DELETE" : "POST" }),
    onSuccess: async (look) => {
      invalidate();
      if (look.share_token) {
        const url = `${window.location.origin}/looks/${look.share_token}`;
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        toast.success(studio.copied);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/account/looks/${id}`, { method: "DELETE" }), onSuccess: invalidate });
  return (
    <div>
      <PageTitle>{copy.looks}</PageTitle>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
      {list.data && !list.data.length ? (
        <EmptyBlock
          title={copy.noLooks}
          icon="bookmark"
          action={
            <Link href="/studio" className="text-sm underline decoration-accent decoration-2 underline-offset-8">
              ورود به استودیو تن‌پوش
            </Link>
          }
        />
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.map((look) => (
          <li key={look.id} className="flex flex-col gap-3 border border-line p-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{look.name}</span>
              {look.shared ? <Badge tone="accent">{copy.shared}</Badge> : null}
            </div>
            <ul className="text-ink-soft">
              {look.items.map((i) => (
                <li key={i.slot}>
                  {studio.slots[i.slot]}: {i.product_name || "—"}
                  {i.size ? (
                    <>
                      {" "}
                      (<bdi className="ltr">{sizeLabel(i.size)}</bdi>)
                    </>
                  ) : null}
                  {!i.available ? <span className="text-danger"> — ناموجود</span> : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{jalali(look.updated_at)}</p>
            <div className="flex flex-wrap gap-4">
              <Link href={`/studio?look=${look.id}`} className="underline">
                {copy.openInStudio}
              </Link>
              <button type="button" className="underline" onClick={() => share.mutate(look)}>
                {look.shared ? copy.unshare : copy.share}
              </button>
              <button type="button" className="text-danger underline" onClick={() => remove.mutate(look.id)}>
                {copy.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
