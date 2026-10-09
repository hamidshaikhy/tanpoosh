import type { StudioManifest, StudioProduct, StudioSlot } from "@/lib/api/types";
import { SLOTS, type Outfit } from "./store";

export const REQUIRED_SLOTS: StudioSlot[] = ["top", "bottom", "shoes"];

/** Size chooses a stock variant; it never changes the photographed pose. */
export function previewKey(outfit: Outfit): string {
  return SLOTS.map(slot => `${slot}:${outfit[slot]?.slug ?? ""}:${outfit[slot]?.color ?? ""}`).join("|");
}

export function previewFiles(manifest: StudioManifest, outfit: Outfit, products?: StudioProduct[]): string[] | null {
  if (REQUIRED_SLOTS.some(slot => !outfit[slot])) return null;
  if (manifest.mode === "looks") {
    const look = manifest.looks.find(item => SLOTS.every(slot => {
      const expected = item.selections[slot], actual = outfit[slot];
      return expected ? actual?.slug === expected.slug && actual.color === expected.color : !actual;
    }));
    return look ? [look.image.file] : null;
  }
  const order: StudioSlot[] = ["shoes", "bottom", "top", "accessory"];
  const files: string[] = [];
  for (const slot of order) {
    const selection = outfit[slot];
    if (!selection) continue;
    const assetId = products?.find(p => p.slug === selection.slug)?.studio_asset ?? selection.slug;
    const image = manifest.garments.find(g => g.id === assetId && g.slot === slot)?.colors[selection.color];
    if (!image) return null;
    files.push(image.file);
  }
  return files;
}
