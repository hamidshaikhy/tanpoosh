import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CartDrawer } from "@/components/layout/CartDrawer";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { StudioHeader } from "@/components/layout/StudioHeader";

export const metadata: Metadata = {
  title: "استودیو تن‌پوش",
  description: "لباس‌ها را روی مدل ببین، استایل خودت را بساز و یکجا به سبد اضافه کن.",
  alternates: { canonical: "/studio" },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg" data-testid="studio-shell">
      <StudioHeader />
      <main id="main" className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>
      <CartDrawer />
      <SearchDialog />
    </div>
  );
}
