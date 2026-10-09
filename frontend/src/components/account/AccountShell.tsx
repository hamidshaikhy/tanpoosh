"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { account as copy } from "@/content/fa";
import { errorMessage } from "@/lib/api/client";
import { useMe } from "@/lib/queries";

const LINKS = [
  { href: "/account", label: copy.overview, icon: "grid" },
  { href: "/account/orders", label: copy.orders, icon: "box" },
  { href: "/account/addresses", label: copy.addresses, icon: "truck" },
  { href: "/account/wishlist", label: copy.wishlist, icon: "heart" },
  { href: "/account/looks", label: copy.looks, icon: "bookmark" },
  { href: "/account/reviews", label: copy.reviews, icon: "star" },
  { href: "/account/support", label: copy.support, icon: "message" },
  { href: "/account/security", label: copy.security, icon: "shield" },
] as const;

/** Client-side guard is UX only: every account API enforces ownership/authentication itself. */
export function AccountShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError, error, refetch } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (me && !me.authenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me, pathname, router]);

  if (isLoading || (me && !me.authenticated)) return <LoadingBlock className="min-h-[50vh]" />;
  if (isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
      <nav aria-label={copy.title} className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-4 text-sm text-muted">{copy.greeting(me?.user?.first_name || me?.user?.username || "")}</p>
        <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
          {LINKS.map((l) => {
            const active = l.href === "/account" ? pathname === "/account" : pathname.startsWith(l.href);
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm ${active ? "bg-ink text-bg" : "hover:bg-surface-alt"}`}
                >
                  <Icon name={l.icon} className="size-4.5" />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line-soft pb-5">
      <h1 className="text-2xl font-bold">{children}</h1>
      {action}
    </div>
  );
}
