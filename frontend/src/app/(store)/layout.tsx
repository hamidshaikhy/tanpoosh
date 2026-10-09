import type { ReactNode } from "react";
import { connection } from "next/server";

import { CartDrawer } from "@/components/layout/CartDrawer";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { QuickAddDialog } from "@/components/product/QuickAddDialog";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { getSettings } from "@/lib/api/public";
import type { PublicSettings } from "@/lib/api/types";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  await connection();
  let settings: PublicSettings | null = null;
  try {
    settings = await getSettings();
  } catch {
    settings = null; // header/footer still render; pages show their own API error state
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <Header announcement={settings?.announcement || ""} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer settings={settings} />
      <CartDrawer />
      <SearchDialog />
      <QuickAddDialog />
    </div>
  );
}
