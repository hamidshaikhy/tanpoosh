import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { auth } from "@/content/fa";

export const metadata: Metadata = { title: "ورود", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title={auth.loginTitle}
      subtitle={auth.loginSubtitle}
      footer={
        <>
          {auth.noAccount}{" "}
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-ink underline decoration-accent decoration-2 underline-offset-8">
            {auth.submitSignup}
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
