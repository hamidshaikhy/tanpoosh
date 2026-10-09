import type { Metadata } from "next";

import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

export const metadata: Metadata = { title: "تسویه حساب", robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutFlow devTools={process.env.NEXT_PUBLIC_DEV_TOOLS === "true"} />;
}
