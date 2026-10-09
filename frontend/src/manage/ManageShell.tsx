"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { LoadingBlock } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { useLogout, useMe } from "@/lib/queries";

import { ReauthProvider } from "./reauth";

type NavItem = { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"]; perm: string };

export const MANAGE_NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ href: "/manage", label: "پیشخوان", icon: "chart", perm: "dashboard.view" }] },
  {
    group: "فروشگاه",
    items: [
      { href: "/manage/products", label: "محصولات", icon: "tag", perm: "catalog.view" },
      { href: "/manage/categories", label: "دسته‌بندی و کالکشن", icon: "grid", perm: "catalog.view" },
      { href: "/manage/inventory", label: "موجودی انبار", icon: "box", perm: "inventory.view" },
    ],
  },
  {
    group: "فروش",
    items: [
      { href: "/manage/orders", label: "سفارش‌ها", icon: "file", perm: "orders.view" },
      { href: "/manage/payments", label: "پرداخت‌ها", icon: "card", perm: "payments.view" },
      { href: "/manage/refunds", label: "بازپرداخت‌ها", icon: "refund", perm: "payments.view" },
      { href: "/manage/returns", label: "مرجوعی‌ها", icon: "undo", perm: "returns.view" },
      { href: "/manage/coupons", label: "کدهای تخفیف", icon: "tag", perm: "coupons.manage" },
      { href: "/manage/shipping", label: "روش‌های ارسال", icon: "truck", perm: "shipping.manage" },
    ],
  },
  {
    group: "مشتریان و محتوا",
    items: [
      { href: "/manage/customers", label: "مشتریان", icon: "users", perm: "customers.view" },
      { href: "/manage/support", label: "پیام‌های پشتیبانی", icon: "message", perm: "support.manage" },
      { href: "/manage/reviews", label: "نظرات", icon: "star", perm: "reviews.moderate" },
      { href: "/manage/content", label: "محتوای سایت", icon: "edit", perm: "content.manage" },
    ],
  },
  {
    group: "امنیت",
    items: [
      { href: "/manage/staff", label: "کارکنان و نقش‌ها", icon: "shield", perm: "staff.manage" },
      { href: "/manage/audit", label: "گزارش رویدادها", icon: "file", perm: "audit.view" },
      { href: "/manage/security", label: "امنیت حساب من", icon: "lock", perm: "dashboard.view" },
    ],
  },
];

/** UX guard only — every /api/v1/manage endpoint enforces staff role, MFA and permission. */
export function ManageShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
  const navOpen = navOpenOn === pathname;
  const setNavOpen = (v: boolean) => setNavOpenOn(v ? pathname : null);
  const user = me?.authenticated ? me.user : null;
  const allowed = Boolean(user?.is_staff && user.mfa.verified);

  useEffect(() => {
    if (!isLoading && !allowed) router.replace(`/manage/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, allowed, pathname, router]);

  if (isLoading || !allowed || !user) return <LoadingBlock className="min-h-dvh" />;
  const perms = new Set(user.permissions);

  const nav = (
    <nav aria-label="پنل مدیریت" className="flex flex-col gap-5 text-sm">
      {MANAGE_NAV.map((g) => {
        const items = g.items.filter((i) => perms.has(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group || "main"}>
            {g.group ? <p className="mb-1.5 px-3 text-xs text-night-ink/50">{g.group}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => {
                const active = i.href === "/manage" ? pathname === "/manage" : pathname.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2 ${active ? "bg-night-ink text-night" : "text-night-ink/85 hover:bg-white/5"}`}
                    >
                      <Icon name={i.icon} className="size-4.5" />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <ReauthProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-night px-3 py-5 text-night-ink lg:flex">
          <Link href="/manage" className="px-3" aria-label="پیشخوان مدیریت تن‌پوش">
            <BrandLogo variant="light-wordmark" className="h-4 w-auto" />
          </Link>
          {nav}
        </aside>
        {navOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="منوی مدیریت">
            <div className="w-72 overflow-y-auto bg-night px-3 py-5 text-night-ink">{nav}</div>
            <button type="button" className="flex-1 bg-ink/40" aria-label="بستن منو" onClick={() => setNavOpen(false)} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-line bg-elevated px-4">
            <button type="button" className="p-2 lg:hidden" onClick={() => setNavOpen(true)} aria-label="منو">
              <Icon name="menu" />
            </button>
            <Link href="/" className="text-sm text-muted hover:text-ink">
              مشاهدهٔ فروشگاه
            </Link>
            <div className="ms-auto flex items-center gap-3 text-sm">
              {user.mfa.dev_bypass ? <span className="bg-warning-bg px-2 py-0.5 text-xs text-warning">{auth.devBypass}</span> : null}
              <span className="text-ink-soft">
                {user.first_name || user.username} · <span className="text-muted">{user.role_label}</span>
              </span>
              <button
                type="button"
                onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/manage/login") })}
                className="flex items-center gap-1 text-muted hover:text-danger"
              >
                <Icon name="logout" className="size-4" />
                خروج
              </button>
            </div>
          </header>
          <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </ReauthProvider>
  );
}

export function useCan() {
  const { data: me } = useMe();
  const perms = new Set(me?.user?.permissions ?? []);
  return (perm: string) => perms.has(perm);
}
