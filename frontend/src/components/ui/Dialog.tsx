"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { common } from "@/content/fa";

import { Icon } from "./Icon";

/**
 * Accessible modal built on the native <dialog> element (showModal): the rest of the page is
 * inert (focus trapped), Escape closes, and focus returns to the opener on close.
 * `side` renders it as a sheet: "end" (left edge in RTL), "start" or "bottom" (mobile sheet).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  side,
  size = "md",
  labelledBy,
  hideTitle = false,
  className = "",
  tone = "light",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "start" | "end" | "bottom";
  size?: "sm" | "md" | "lg" | "xl";
  labelledBy?: string;
  hideTitle?: boolean;
  className?: string;
  tone?: "light" | "night";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const generatedTitleId = useId();
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement as HTMLElement | null;
      el.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => {
      document.documentElement.style.overflow = "";
      opener.current?.focus?.();
      if (open) onClose();
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("close", handleClose);
    el.addEventListener("cancel", handleCancel);
    return () => {
      el.removeEventListener("close", handleClose);
      el.removeEventListener("cancel", handleCancel);
    };
  }, [open, onClose]);

  useEffect(() => () => {
    document.documentElement.style.overflow = "";
  }, []);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;
  const placement =
    side === "end"
      ? "m-0 ms-auto me-0 h-dvh max-h-dvh w-full sm:max-w-md left-0 right-auto animate-[slide-up_0.25s_ease-out]"
      : side === "start"
        ? "m-0 h-dvh max-h-dvh w-full sm:max-w-sm right-0 left-auto"
        : side === "bottom"
          ? "m-0 mt-auto w-full max-w-none max-h-[88dvh] bottom-0"
          : `m-auto w-[calc(100%-2rem)] ${widths[size]} max-h-[90dvh]`;
  const toneClass = tone === "night" ? "bg-night text-night-ink" : "bg-bg text-ink";
  const titleId = labelledBy || `dialog-title-${generatedTitleId}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${placement} ${toneClass} border border-line p-0 shadow-soft backdrop:bg-ink/40 backdrop:backdrop-blur-[1px] open:flex open:flex-col ${className}`}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
        <h2 id={titleId} className={`text-lg ${hideTitle ? "sr-only" : ""}`}>
          {title}
        </h2>
        <button type="button" onClick={onClose} className="-m-2 p-2 text-muted hover:text-ink" aria-label={common.close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </dialog>
  );
}
