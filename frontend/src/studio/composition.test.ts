import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { StudioManifest, StudioSlot } from "@/lib/api/types";
import { compositionLayers, FACE_CLEAR, FRAME, HEAD_END } from "./composition";
import neckOutline from "./head-neck-outline.json";

const manifest = JSON.parse(readFileSync("public/studio-images/manifest.json", "utf8")) as StudioManifest;
const registration = JSON.parse(readFileSync("../docs/STUDIO_REGISTRATION.json", "utf8")) as {
  records: { id: string; color: string; slot: StudioSlot; source_alpha_bounds: number[]; anchors: Record<string, number | number[]> }[];
};
const file = (slot: StudioSlot) => Object.values(manifest.garments.find(g => g.slot === slot)!.colors)[0].file;
const body = [file("shoes"), file("bottom"), file("top")];

it("uses one complete registered face for each pair of sunglasses", () => {
  for (const set of manifest.garments.filter(g => g.slot === "accessory")) {
    for (const image of Object.values(set.colors)) {
      const layers = compositionLayers(manifest, [...body, image.file]);
      expect(layers.filter(l => l.head)).toHaveLength(1);
      expect(layers[0].image.file).toBe(image.file);
      expect(layers[0].image.file).toContain("-head-v2.webp");
      expect(layers[0].matrix).toEqual([1, 0, 0, 1, 0, 0]);
      expect(layers[0].headSilhouette).toBe(manifest.model.file);
      expect(layers.some(l => l.image.file === manifest.model.file)).toBe(false);
    }
  }
});

it("keeps the original face without eyewear and protects it from collars", () => {
  const layers = compositionLayers(manifest, body);
  expect(layers[0].image.file).toBe(manifest.model.file);
  expect(layers[0].headSilhouette).toBeUndefined();
  expect(layers.filter(l => l.head)).toHaveLength(1);
  expect(layers.filter(l => l.protectFace).map(l => l.slot)).toEqual(["top"]);
  expect(FACE_CLEAR).toBe(244);
  expect(HEAD_END).toBeGreaterThan(FACE_CLEAR);
  expect(neckOutline.every(([x, y]) => x >= 430 && x <= 595 && y >= FACE_CLEAR && y <= HEAD_END)).toBe(true);
});

it("registers all 28 body photographs to the measured neck, cuffs, waist and floor", () => {
  expect(registration.records).toHaveLength(28);
  for (const record of registration.records) {
    const image = manifest.garments.find(g => g.id === record.id)!.colors[record.color];
    const layer = compositionLayers(manifest, [image.file]).find(l => l.image.file === image.file)!;
    const [sx, , , sy, tx, ty] = layer.matrix;
    const [left, top, right, bottom] = record.source_alpha_bounds;
    const a = record.anchors;
    const x = (source: number) => source * sx + tx;
    const y = (source: number) => source * sy + ty;
    if (record.slot === "top") {
      expect(y(a.source_neck as number)).toBeCloseTo(244, 3);
      expect(y(bottom)).toBeCloseTo(860, 3);
      (a.source_palms as number[]).forEach((source, i) => expect(x(source)).toBeCloseTo([326, 695][i], 3));
    } else {
      expect(x((left + right) / 2)).toBeCloseTo(FRAME.width / 2, 3);
      expect((right - left) * sx).toBeCloseTo(record.slot === "bottom" ? 294 : 340, 3);
      expect(y(bottom)).toBeCloseTo(record.slot === "bottom" ? 1319 : 1410, 3);
      if (record.slot === "bottom") expect(y(top)).toBeCloseTo(596, 3);
    }
  }
});

it("displays a prepared complete photograph without head or clothing masks", () => {
  const image = { file: "/studio-images/complete.webp", width: 1024, height: 1536, bytes: 10 };
  const complete: StudioManifest = { ...manifest, mode: "looks", looks: [{ id: "complete", name: "", image, selections: {} }] };
  const layers = compositionLayers(complete, [image.file]);
  expect(layers).toHaveLength(1);
  expect(layers[0].head).toBe(false);
  expect(layers[0].protectFace).toBe(false);
});
