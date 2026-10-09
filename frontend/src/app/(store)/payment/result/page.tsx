import type { Metadata } from "next";

import { PaymentResult } from "@/components/checkout/PaymentResult";

export const metadata: Metadata = { title: "نتیجهٔ پرداخت", robots: { index: false }, referrer: "no-referrer" };

export default async function PaymentResultPage({ searchParams }: { searchParams: Promise<{ order?: string; status?: string }> }) {
  const sp = await searchParams;
  const orderId = sp.order && /^[0-9a-f-]{36}$/i.test(sp.order) ? sp.order : null;
  return <PaymentResult orderId={orderId} />;
}
