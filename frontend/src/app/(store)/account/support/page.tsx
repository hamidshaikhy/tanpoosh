"use client";

import { useQuery } from "@tanstack/react-query";

import { PageTitle } from "@/components/account/AccountShell";
import { SupportForm } from "@/components/support/SupportForm";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { account as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { SupportMessage } from "@/lib/api/types";
import { jalali } from "@/lib/format";

export default function SupportPage() {
  const list = useQuery({ queryKey: ["support"], queryFn: () => api<SupportMessage[]>("/account/support") });
  return (
    <div className="flex flex-col gap-10">
      <PageTitle>{copy.support}</PageTitle>
      <section className="border border-line bg-elevated p-5">
        <h2 className="mb-4 font-semibold">{copy.newMessage}</h2>
        <SupportForm onSent={() => list.refetch()} />
      </section>
      <section>
        {list.isLoading ? <LoadingBlock /> : null}
        {list.isError ? <ErrorBlock message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
        {list.data && !list.data.length ? <p className="text-sm text-muted">{copy.noMessages}</p> : null}
        <ul className="flex flex-col gap-4">
          {list.data?.map((m) => (
            <li key={m.id} className="border border-line p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{m.subject}</span>
                <Badge>{m.status_label}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {m.topic_label} · {jalali(m.created_at, { time: true })}
              </p>
              <p className="mt-3 whitespace-pre-line text-ink-soft">{m.body}</p>
              {m.replies.map((r, i) => (
                <div key={i} className="mt-4 border-s-2 border-accent ps-4">
                  <p className="text-xs text-muted">
                    {copy.supportReply} · {jalali(r.created_at, { time: true })}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{r.body}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
