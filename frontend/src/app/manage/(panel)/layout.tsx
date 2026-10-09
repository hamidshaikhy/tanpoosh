import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ManageShell } from "@/manage/ManageShell";

export const metadata: Metadata = { title: { default: "پنل مدیریت", template: "%s | مدیریت تن‌پوش" }, robots: { index: false, follow: false } };

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <ManageShell>{children}</ManageShell>;
}
