"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { studio as copy } from "@/content/fa";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { Cart, SavedLook, StudioManifest, StudioProduct, StudioSlot } from "@/lib/api/types";
import { faDigits, toman } from "@/lib/format";
import { keys, useMe } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

import { OutfitPanel } from "./OutfitPanel";
import { sanitizeOutfit } from "./looks";
import { decodeOutfit, encodeOutfit, loadDraft, saveDraft, SLOTS, useStudio, type Outfit } from "./store";
import { PhotoPreview } from "./PhotoPreview";
import { Wardrobe } from "./Wardrobe";

type StudioCatalog = { manifest: StudioManifest | null; products: StudioProduct[] };

export function StudioApp() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const openCart = useUI((s) => s.openCart);
  const catalog = useQuery({ queryKey: ["public", "studio"], queryFn: () => api<StudioCatalog>("/studio/catalog"), staleTime: 60_000 });
  const outfit = useStudio((s) => s.outfit);
  const replace = useStudio((s) => s.replace);
  const setSlot = useStudio((s) => s.set);
  const savedLookId = useStudio((s) => s.savedLookId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Partial<Record<StudioSlot, string>>>({});
  const initialized = useRef(false);

  // Explicit link > saved/shared look > product entry > local draft > empty selection.
  useEffect(() => {
    if (!catalog.data || initialized.current) return;
    initialized.current = true;
    const products = catalog.data.products;
    const init = async () => {
      let start: Outfit | null = null;
      let lookId: string | null = null;
      const outfitParam = params.get("outfit");
      const share = params.get("share");
      const look = params.get("look");
      const productSlug = params.get("product");
      try {
        if (outfitParam) start = decodeOutfit(outfitParam);
        else if (share) {
          const shared = await api<{ name: string; items: SavedLook["items"] }>(`/looks/shared/${encodeURIComponent(share)}`);
          start = Object.fromEntries(shared.items.map((i) => [i.slot, { slug: i.product_slug, color: i.color_code, size: i.size || null }]));
        } else if (look && /^[0-9a-f-]{36}$/i.test(look)) {
          const saved = await api<SavedLook>(`/account/looks/${look}`);
          start = Object.fromEntries(saved.items.map((i) => [i.slot, { slug: i.product_slug, color: i.color_code, size: i.size || null }]));
          lookId = saved.id;
        }
      } catch (e) {
        toast.error(e instanceof ApiError && e.status === 404 ? copy.sharedMissing : errorMessage(e));
      }
      if (!start) {
        start = loadDraft() ?? {};
      }
      if (productSlug) {
        const p = products.find((x) => x.slug === productSlug);
        if (p && p.studio_slot !== "none" && p.studio_supported && p.studio_asset) {
          start = { ...start, [p.studio_slot]: { slug: p.slug, color: params.get("color") || p.colors[0]?.code, size: params.get("size") } };
        } else if (p) toast.info(copy.unsupportedEntry);
      }
      const { outfit: clean, dropped } = sanitizeOutfit(start, products, {supportedOnly:true});
      if (dropped) toast.info(copy.unsupportedEntry);
      replace(clean, { record: false, savedLookId: dropped ? null : lookId });
    };
    void init();
  }, [catalog.data, params, replace]);

  // Guest-safe local draft (selections only).
  useEffect(() => {
    if (initialized.current) saveDraft(outfit);
  }, [outfit]);

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const manifest = catalog.data?.manifest ?? null;
  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const lines = SLOTS.flatMap((slot) => {
    const sel = outfit[slot];
    const p = sel ? bySlug.get(sel.slug) : null;
    return sel && p ? [{ slot, sel, product: p }] : [];
  });
  const total = lines.reduce((sum, l) => {
    const v = l.product.variants.find((x) => x.color_code === l.sel.color && (!l.sel.size || x.size === l.sel.size));
    return sum + (v?.price_toman ?? l.product.price_min ?? 0);
  }, 0);

  const addLook = useMutation({
    mutationFn: async () => {
      const errs: Partial<Record<StudioSlot, string>> = {};
      const items: { variant_id: number; quantity: number }[] = [];
      for (const l of lines) {
        const v = l.product.variants.find((x) => x.color_code === l.sel.color && x.size === l.sel.size);
        if (!l.sel.size || !v) errs[l.slot] = copy.sizeRequired;
        else if (!v.in_stock) errs[l.slot] = "این سایز ناموجود است";
        else items.push({ variant_id: v.id, quantity: 1 });
      }
      setItemErrors(errs);
      if (Object.keys(errs).length) throw new Error("validation");
      return api<Cart>("/cart/items/batch", { method: "POST", body: { items } });
    },
    onSuccess: (cart) => {
      qc.setQueryData(keys.cart, cart);
      toast.success(copy.added, { label: "سبد خرید", href: "/bag" });
      setSheetOpen(false);
      openCart();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        toast.error(e.message);
        // batch_invalid: server listed the problematic variants; bag was not modified.
      } else if ((e as Error).message !== "validation") toast.error(errorMessage(e));
      else toast.error(copy.sizeRequired);
    },
  });

  const saveLook = useMutation({
    mutationFn: () =>
      api<SavedLook>("/account/looks", {
        method: "POST",
        body: {
          name: `${copy.defaultLookName} ${new Intl.DateTimeFormat("fa-IR", { month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(new Date())}`,
          items: lines.map((l) => ({ slot: l.slot, product_id: l.product.id, color_code: l.sel.color, size: l.sel.size ?? "" })),
        },
      }),
    onSuccess: (look) => {
      useStudio.setState({ savedLookId: look.id });
      qc.invalidateQueries({ queryKey: keys.looks });
      toast.success(copy.saved, { label: "استایل‌های من", href: "/account/looks" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const share = useMutation({
    mutationFn: async () => {
      if (savedLookId && me?.authenticated) {
        const look = await api<SavedLook>(`/account/looks/${savedLookId}/share`, { method: "POST" });
        return `${window.location.origin}/looks/${look.share_token}`;
      }
      return `${window.location.origin}/studio?outfit=${encodeURIComponent(encodeOutfit(outfit))}`;
    },
    onSuccess: async (url) => {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(copy.copied);
      } catch {
        setShareUrl(url);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onSave = () => {
    if (!lines.length) return;
    if (!me?.authenticated) {
      saveDraft(outfit);
      toast.info(copy.savedLocal);
      router.push(`/login?next=${encodeURIComponent(`/studio?outfit=${encodeOutfit(outfit)}`)}`);
      return;
    }
    saveLook.mutate();
  };

  if (catalog.isLoading) return <LoadingBlock className="min-h-[70vh]" label={copy.loading} />;
  if (catalog.isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorBlock message={errorMessage(catalog.error)} onRetry={() => catalog.refetch()} />
      </div>
    );
  }

  const panelProps = {
    lines,
    total,
    errors: itemErrors,
    onAddLook: () => addLook.mutate(),
    adding: addLook.isPending,
    onSave,
    saving: saveLook.isPending,
    onShare: () => share.mutate(),
    sharing: share.isPending,
    onClearError: (slot: StudioSlot) => setItemErrors((e) => ({ ...e, [slot]: undefined })),
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_220px_auto] overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:grid-rows-1 xl:grid-cols-[340px_minmax(0,1fr)_360px]" data-testid="studio-workspace">
      {/* Wardrobe: inline-start (RIGHT in RTL) */}
      <aside className="order-2 min-h-0 min-w-0 overflow-y-auto overscroll-contain border-line bg-bg lg:order-1 lg:border-e" aria-label={copy.wardrobe} data-testid="wardrobe-panel">
        <Wardrobe products={products} onPick={(slot, p, selectedColor) => {
          if (!p.studio_supported || !p.studio_asset) return;
          const previous = outfit[slot]?.slug === p.slug ? outfit[slot] : null;
          const color = selectedColor ?? previous?.color ?? p.colors[0]?.code ?? "";
          const available = p.variants.filter((v) => v.color_code === color && v.in_stock);
          const size = available.some((v) => v.size === previous?.size) ? previous!.size : available.length === 1 && available[0].size === "ONE" ? "ONE" : null;
          setSlot(slot, {slug:p.slug,color,size});
        }} />
      </aside>

      {/* Prepared photograph: centre */}
      <section className="relative order-1 flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#ebe6dd] lg:order-2" aria-label={copy.live}>
        <PhotoPreview manifest={manifest} products={products} />
      </section>

      {/* Outfit summary: inline-end (LEFT in RTL) — desktop column, mobile bar + sheet */}
      <aside className="order-3 hidden min-h-0 min-w-0 overflow-y-auto overscroll-contain border-line bg-bg lg:block lg:border-s" aria-label={copy.yourStyle}>
        <OutfitPanel {...panelProps} />
      </aside>
      <div className="z-30 order-3 flex items-center gap-3 border-t border-line bg-bg px-4 py-2 lg:hidden">
        <div className="flex-1 text-sm">
          <p className="text-muted">
            {copy.yourStyle} · {copy.pieces(faDigits(lines.length))}
          </p>
          <p className="num font-semibold">{toman(total)}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          {copy.openOutfit}
        </Button>
      </div>
      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title={copy.yourStyle} side="bottom">
        <OutfitPanel {...panelProps} compact />
      </Dialog>
      <Dialog open={Boolean(shareUrl)} onClose={() => setShareUrl(null)} title={copy.share} size="md">
        <div className="flex flex-col gap-3 p-5">
          <label htmlFor="share-url" className="text-sm text-ink-soft">
            پیوند استایل
          </label>
          <input id="share-url" readOnly value={shareUrl ?? ""} className="ltr h-11 border border-line bg-elevated px-3 text-sm" onFocus={(e) => e.target.select()} />
        </div>
      </Dialog>
    </div>
  );
}
