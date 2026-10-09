"use client";

import { create } from "zustand";

import { Icon } from "./Icon";

type Toast = { id: number; tone: "success" | "error" | "info"; message: string; action?: { label: string; href: string } };

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), t.tone === "error" ? 7000 : 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string, action?: Toast["action"]) => useToasts.getState().push({ tone: "success", message, action }),
  error: (message: string) => useToasts.getState().push({ tone: "error", message }),
  info: (message: string) => useToasts.getState().push({ tone: "info", message }),
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-3 border px-4 py-3 text-sm shadow-soft ${
            t.tone === "error" ? "border-danger/40 bg-danger-bg text-danger" : t.tone === "success" ? "border-line bg-ink text-bg" : "border-line bg-elevated text-ink"
          }`}
        >
          <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "info"} className="mt-0.5 size-4.5" />
          <p className="flex-1 leading-6">{t.message}</p>
          {t.action ? (
            <a href={t.action.href} className="shrink-0 underline decoration-accent decoration-2 underline-offset-4">
              {t.action.label}
            </a>
          ) : null}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="بستن پیام" className="-m-1 p-1 opacity-70 hover:opacity-100">
            <Icon name="close" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
