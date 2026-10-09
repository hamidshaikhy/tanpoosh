"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageTitle } from "@/components/account/AccountShell";
import { OrderList } from "@/components/account/OrderList";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { account as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { OrderSummary, Paginated } from "@/lib/api/types";
import { keys, useMe } from "@/lib/queries";

export default function AccountOverview() {
  const { data: me } = useMe();
  const user = me?.user;
  const orders = useQuery({ queryKey: [...keys.orders, 1], queryFn: () => api<Paginated<OrderSummary>>("/orders", { query: { page: 1 } }) });
  const resend = useMutation({
    mutationFn: () => api<{ detail: string }>("/auth/email/resend", { method: "POST" }),
    onSuccess: (r) => toast.success(r.detail),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!user) return null;
  return (
    <div className="flex flex-col gap-8">
      <PageTitle>{copy.overview}</PageTitle>
      {!user.email_verified ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{copy.verifyBanner}</span>
            <Button size="sm" variant="secondary" onClick={() => resend.mutate()} loading={resend.isPending}>
              {copy.resend}
            </Button>
          </div>
        </Notice>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["/account/orders", copy.orders],
          ["/account/addresses", copy.addresses],
          ["/account/looks", copy.looks],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="border border-line bg-elevated p-5 hover:border-ink">
            {label}
          </Link>
        ))}
      </section>
      <section>
        <h2 className="mb-4 font-semibold">سفارش‌های اخیر</h2>
        <OrderList query={orders} compact />
      </section>
      {user.is_staff ? (
        <Link href="/manage" className="self-start underline decoration-accent decoration-2 underline-offset-8">
          مدیریت فروشگاه
        </Link>
      ) : null}
    </div>
  );
}
