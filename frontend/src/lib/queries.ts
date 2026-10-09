"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bag as bagCopy } from "@/content/fa";
import { toast } from "@/components/ui/Toast";

import { api, ApiError, errorMessage, setCsrfToken } from "./api/client";
import type { AuthResult, Cart, Me } from "./api/types";
import { useUI } from "./ui-store";

export const keys = {
  me: ["me"] as const,
  cart: ["cart"] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["orders", id] as const,
  addresses: ["addresses"] as const,
  wishlist: ["wishlist"] as const,
  looks: ["looks"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>("/auth/me"),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCart() {
  return useQuery({
    queryKey: keys.cart,
    queryFn: () => api<Cart>("/cart"),
    staleTime: 15_000,
    retry: 1,
  });
}

/** Apply a server response that carries a new auth state (login/signup/logout/MFA). */
export function useApplyAuth() {
  const qc = useQueryClient();
  return (result: Partial<AuthResult>, { clearPrivate = false } = {}) => {
    if (result.csrf_token) setCsrfToken(result.csrf_token);
    if (result.authenticated !== undefined) {
      qc.setQueryData(keys.me, { authenticated: result.authenticated, user: result.user ?? null });
    }
    if (clearPrivate) {
      // Keep active observers attached: removing the me query stranded login/MFA
      // consumers on their old auth snapshot. Reset other private data immediately.
      void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "public" && q.queryKey[0] !== "me" });
    }
    qc.invalidateQueries({ queryKey: keys.cart });
  };
}

export function useLogout() {
  const apply = useApplyAuth();
  return useMutation({
    mutationFn: () => api<AuthResult>("/auth/logout", { method: "POST" }),
    onSuccess: (data) => apply(data, { clearPrivate: true }),
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  const openCart = useUI((s) => s.openCart);
  return useMutation({
    mutationFn: (vars: { variant_id: number; quantity?: number }) =>
      api<Cart>("/cart/items", { method: "POST", body: { variant_id: vars.variant_id, quantity: vars.quantity ?? 1 } }),
    onSuccess: (cart) => {
      qc.setQueryData(keys.cart, cart);
      openCart();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCartLine() {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (vars: { id: number; quantity: number; version: number }) =>
      api<Cart>(`/cart/items/${vars.id}`, { method: "PATCH", body: { quantity: vars.quantity, cart_version: vars.version } }),
    onSuccess: (cart) => qc.setQueryData(keys.cart, cart),
    onError: (err) => {
      if (err instanceof ApiError && err.code === "stale_cart") qc.invalidateQueries({ queryKey: keys.cart });
      toast.error(errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<Cart>(`/cart/items/${id}`, { method: "DELETE" }),
    onSuccess: (cart) => qc.setQueryData(keys.cart, cart),
    onError: (err) => toast.error(errorMessage(err)),
  });
  return { update, remove };
}

export function cartCountLabel(count: number): string {
  return bagCopy.count(String(count));
}
