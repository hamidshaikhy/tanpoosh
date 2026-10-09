"use client";

import { Icon } from "@/components/ui/Icon";
import { product as copy } from "@/content/fa";
import { useUI } from "@/lib/ui-store";

/** Quick-add never guesses a size: it opens the variant selector. */
export function QuickAddButton({ slug, name, disabled }: { slug: string; name: string; disabled?: boolean }) {
  const open = useUI((s) => s.openQuickAdd);
  return (
    <button
      type="button"
      onClick={() => open(slug)}
      disabled={disabled}
      className="flex size-10 items-center justify-center bg-ink text-bg transition-colors hover:bg-ink-soft disabled:bg-line disabled:text-muted"
      aria-label={disabled ? `${name} — ${copy.outOfStock}` : `${copy.quickAdd}: ${name}`}
      data-testid="quick-add"
    >
      <Icon name="plus" className="size-5" />
    </button>
  );
}
