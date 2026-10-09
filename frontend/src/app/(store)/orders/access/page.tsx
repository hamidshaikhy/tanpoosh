"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import { clearFragment, readFragment } from "@/lib/fragment";

/** Opens a guest order from the emailed signed link. The token lives in the URL fragment
 *  (never sent to servers/logs/referrers) and is removed from the address bar immediately. */
function OrderAccess() {
  const router = useRouter();
  const [token] = useState(() => readFragment().get("token"));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    clearFragment();
    if (!token) return;
    let active = true;
    api<{ order_id: string }>("/orders/access", { method: "POST", body: { token } })
      .then((r) => active && router.replace(`/orders/${r.order_id}`))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [router, token]);
  const message = token ? error : "پیوند ناقص است.";
  return <div className="mx-auto max-w-md px-4 py-20">{message ? <ErrorBlock message={message} /> : <LoadingBlock />}</div>;
}

const OrderAccessClient = dynamic(() => Promise.resolve({ default: OrderAccess }), { ssr: false });

export default function OrderAccessPage() {
  return <OrderAccessClient />;
}
