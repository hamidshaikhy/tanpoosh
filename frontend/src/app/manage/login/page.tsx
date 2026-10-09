import type { Metadata } from "next";
import { Suspense } from "react";

import { ManageLogin } from "@/manage/ManageLogin";

export const metadata: Metadata = { title: "ورود به پنل مدیریت", robots: { index: false } };

export default function ManageLoginPage() {
  return (
    <Suspense>
      <ManageLogin />
    </Suspense>
  );
}
