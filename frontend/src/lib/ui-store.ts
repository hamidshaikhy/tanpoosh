"use client";

import { create } from "zustand";

/** Transient UI state only (drawers/dialogs). Never holds money, credentials or addresses. */
type UIState = {
  cartOpen: boolean;
  searchOpen: boolean;
  navOpen: boolean;
  quickAddSlug: string | null;
  openCart: () => void;
  closeCart: () => void;
  setSearch: (open: boolean) => void;
  setNav: (open: boolean) => void;
  openQuickAdd: (slug: string) => void;
  closeQuickAdd: () => void;
};

export const useUI = create<UIState>((set) => ({
  cartOpen: false,
  searchOpen: false,
  navOpen: false,
  quickAddSlug: null,
  openCart: () => set({ cartOpen: true, searchOpen: false, navOpen: false }),
  closeCart: () => set({ cartOpen: false }),
  setSearch: (open) => set({ searchOpen: open, cartOpen: false, navOpen: false }),
  setNav: (open) => set({ navOpen: open }),
  openQuickAdd: (slug) => set({ quickAddSlug: slug }),
  closeQuickAdd: () => set({ quickAddSlug: null }),
}));
