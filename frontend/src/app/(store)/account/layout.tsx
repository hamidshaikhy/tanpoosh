import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountShell } from "@/components/account/AccountShell";

export const metadata: Metadata = { title: "حساب کاربری", robots: { index: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
