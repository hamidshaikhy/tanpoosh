import type { Metadata } from "next";

import { OrderView } from "@/components/account/OrderView";

export const metadata: Metadata = { title: "جزئیات سفارش", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderView id={id} />;
}
