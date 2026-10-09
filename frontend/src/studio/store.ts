"use client";

import { create } from "zustand";

import type { StudioSlot } from "@/lib/api/types";

export const SLOTS: StudioSlot[] = ["top", "bottom", "shoes", "accessory"];

/** Retired slots cannot return through old drafts, shared links or undo history. */
const activeOutfit = (outfit: Outfit): Outfit => Object.fromEntries(SLOTS.filter(slot => outfit[slot]).map(slot => [slot, outfit[slot]]));

export type Selection = { slug: string; color: string; size: string | null };
export type Outfit = Partial<Record<StudioSlot, Selection>>;

type StudioState = {
  outfit: Outfit;
  past: Outfit[];
  future: Outfit[];
  savedLookId: string | null;
  set: (slot: StudioSlot, sel: Selection | null) => void;
  update: (slot: StudioSlot, patch: Partial<Selection>) => void;
  replace: (outfit: Outfit, opts?: { record?: boolean; savedLookId?: string | null }) => void;
  undo: () => void;
  redo: () => void;

};

const MAX_HISTORY = 30;

export const useStudio = create<StudioState>((set, get) => {
  const commit = (next: Outfit) => {
    next = activeOutfit(next);
    const { outfit, past } = get();
    if (JSON.stringify(outfit) === JSON.stringify(next)) return;
    set({ outfit: next, past: [...past, outfit].slice(-MAX_HISTORY), future: [], savedLookId: null });
  };
  return {
    outfit: {},
    past: [],
    future: [],
    savedLookId: null,
    set: (slot, sel) => {
      const next = { ...get().outfit };
      if (sel) next[slot] = sel;
      else delete next[slot];
      commit(next);
    },
    update: (slot, patch) => {
      const current = get().outfit[slot];
      if (!current) return;
      commit({ ...get().outfit, [slot]: { ...current, ...patch } });
    },
    replace: (outfit, opts = {}) => {
      const hadRetiredSlot = Boolean(outfit.outerwear);
      outfit = activeOutfit(outfit);
      if (hadRetiredSlot) opts = { ...opts, savedLookId: null };
      if (opts.record === false) set({ outfit, past: [], future: [], savedLookId: opts.savedLookId ?? null });
      else {
        commit(outfit);
        if (opts.savedLookId !== undefined) set({ savedLookId: opts.savedLookId });
      }
    },
    undo: () => {
      const { past, outfit, future } = get();
      if (!past.length) return;
      set({ outfit: past[past.length - 1], past: past.slice(0, -1), future: [outfit, ...future].slice(0, MAX_HISTORY), savedLookId: null });
    },
    redo: () => {
      const { past, outfit, future } = get();
      if (!future.length) return;
      set({ outfit: future[0], future: future.slice(1), past: [...past, outfit].slice(-MAX_HISTORY), savedLookId: null });
    },

  };
});

/** Guest draft persistence: only non-sensitive clothing selections, best-effort. */
const DRAFT_KEY = "tp-studio-draft-v2";

export function loadDraft(): Outfit | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Outfit;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(outfit: Outfit): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(outfit));
  } catch {
    // storage unavailable (private mode) — drafts are optional
  }
}

/** Share URL format: ?outfit=slot.slug.color.size~... (public catalog identifiers only). */
export function encodeOutfit(outfit: Outfit): string {
  return SLOTS.filter((s) => outfit[s])
    .map((s) => [s, outfit[s]!.slug, outfit[s]!.color, outfit[s]!.size ?? ""].join("."))
    .join("~");
}

export function decodeOutfit(value: string): Outfit {
  const out: Outfit = {};
  // Older links have five entries, with eyewear after the now-retired coat.
  for (const part of value.split("~").slice(0, 5)) {
    const [slot, slug, color, size] = part.split(".");
    if (!SLOTS.includes(slot as StudioSlot) || !/^[a-z0-9-]{1,120}$/.test(slug || "") || !/^[a-z0-9-]{1,32}$/.test(color || "")) continue;
    out[slot as StudioSlot] = { slug, color, size: size && /^[A-Z0-9]{1,8}$/.test(size) ? size : null };
  }
  return out;
}
