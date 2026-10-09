import { expect, it } from "vitest";
import type { StudioProduct } from "@/lib/api/types";
import { sanitizeOutfit } from "./looks";

const products = [{ slug: "polo-shirt", studio_slot: "top", colors: [{ code: "ecru" }], variants: [{ color_code: "ecru", size: "M" }] }] as StudioProduct[];

it("drops removed products and resets missing variant choices", () => {
  expect(sanitizeOutfit({ top: { slug: "polo-shirt", color: "gone", size: "XXL" }, bottom: { slug: "removed", color: "black", size: "32" } }, products))
    .toEqual({ outfit: { top: { slug: "polo-shirt", color: "ecru", size: null } }, dropped: 1 });
});
it("retains supported catalog choices", () => {
  const look = { top: { slug: "polo-shirt", color: "ecru", size: "M" } };
  expect(sanitizeOutfit(look, products)).toEqual({ outfit: look, dropped: 0 });
});
it("counts retired coats as removed so a saved look must be saved again", () => {
  const top = {slug:"polo-shirt",color:"ecru",size:"M"};
  expect(sanitizeOutfit({top,outerwear:{slug:"navy-blazer",color:"navy",size:"M"}},products)).toEqual({outfit:{top},dropped:1});
});
it("removes products without studio photographs without replacing valid preview items", () => {
  const supported = {...products[0],slug:"oxford-shirt",studio_supported:true,studio_asset:"oxford-shirt"};
  const unavailable = {...products[0],studio_supported:false,studio_asset:""};
  const shirt={slug:"oxford-shirt",color:"ecru",size:"M"};
  expect(sanitizeOutfit({top:shirt},[supported,unavailable],{supportedOnly:true})).toEqual({outfit:{top:shirt},dropped:0});
  expect(sanitizeOutfit({top:{slug:"polo-shirt",color:"ecru",size:"M"}},[supported,unavailable],{supportedOnly:true})).toEqual({outfit:{},dropped:1});
});
