import "server-only";

import type { Category, Collection, Filters, Home, InfoPage, Paginated, ProductCard, ProductDetail, PublicSettings, StudioManifest, StudioProduct } from "./types";
import { publicGet, publicGetOrNull } from "./server";

/** Cached public reads for Server Components (tags are invalidated by Django). */
export const getHome = () => publicGet<Home>("/content/home", { tags: ["content"] });
export const getStudioCatalog = () => publicGet<{manifest: StudioManifest | null; products: StudioProduct[]}>("/studio/catalog");
export const getSettings = () => publicGet<PublicSettings>("/content/settings", { tags: ["content"] });
export const getCategories = () => publicGet<Category[]>("/catalog/categories");
export const getCollections = () => publicGet<Collection[]>("/catalog/collections");
export const getCollection = (slug: string) => publicGetOrNull<Collection>(`/catalog/collections/${encodeURIComponent(slug)}`);
export const getFilters = () => publicGet<Filters>("/catalog/filters");
export const getProduct = (slug: string) =>
  publicGetOrNull<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}`, { tags: [`product:${slug}`] });
export const getRelated = (slug: string) =>
  publicGet<ProductCard[]>(`/catalog/products/${encodeURIComponent(slug)}/related`, { tags: [`product:${slug}`] });
export const getProducts = (query: Record<string, string | undefined>) =>
  publicGet<Paginated<ProductCard>>("/catalog/products", { query, revalidate: 120 });
export const getPage = (slug: string) => publicGetOrNull<InfoPage>(`/content/pages/${encodeURIComponent(slug)}`, { tags: ["content", `page:${slug}`] });
