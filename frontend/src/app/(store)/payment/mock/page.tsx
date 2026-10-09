import type { Metadata } from "next";

import { MockGateway } from "@/components/checkout/MockGateway";

export const metadata: Metadata = { title: "درگاه آزمایشی توسعه", robots: { index: false } };

/** DEVELOPMENT/TEST-ONLY: the backend serves the mock endpoints only when PAYMENT_MOCK_ENABLED
 *  and never in production; this page shows 404-style messaging otherwise. */
export default async function MockGatewayPage({ searchParams }: { searchParams: Promise<{ authority?: string }> }) {
  const { authority } = await searchParams;
  return <MockGateway authority={authority && /^MOCK[0-9A-F]{28}$/.test(authority) ? authority : null} />;
}
