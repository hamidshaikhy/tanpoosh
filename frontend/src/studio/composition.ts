import type { StudioImage, StudioManifest, StudioSlot } from "@/lib/api/types";
import neckOutline from "./head-neck-outline.json";

export const FRAME = { width: 1024, height: 1536 };
export const HEAD_END = 290;
export const FACE_CLEAR = 244;
export const NECK_BLEND_END = 264;
export const HEAD_RECTS = [
  [0, 0, FRAME.width, FACE_CLEAR],
] as const;
export const HEAD_NECK_PATH = `M ${neckOutline.map(point=>point.join(" ")).join(" L ")} Z`;
export type PhotoLayer = {
  image: StudioImage;
  slot: StudioSlot | "model";
  selected: boolean;
  matrix: [number, number, number, number, number, number];
  protectFace: boolean;
  head: boolean;
  headSilhouette?: string;
};

export function compositionLayers(manifest: StudioManifest, files: string[]): PhotoLayer[] {
  const images = files.map(file => {
    const set = manifest.garments.find(g => Object.values(g.colors).some(image => image.file === file));
    const image = set ? Object.values(set.colors).find(image => image.file === file)! : manifest.looks.find(look => look.image.file === file)!.image;
    return {image,slot:set?.slot ?? "model" as const};
  });
  const eyewear = images.find(item => item.slot === "accessory");
  const head = eyewear ?? {image:manifest.model,slot:"model" as const};
  const ordered = manifest.mode === "layers" ? [head,...images.filter(item => item.slot !== "accessory")] : images;
  return ordered.map(({image,slot}) => {
    const p=image.placement;
    return {
      image,slot,selected:slot !== "model",
      matrix:[p?.scale ?? 1,0,0,p?.scale_y ?? p?.scale ?? 1,(p?.x ?? 0)*FRAME.width,(p?.y ?? 0)*FRAME.height],
      protectFace:manifest.mode === "layers" && slot === "top",
      head:manifest.mode === "layers" && (slot === "model" || slot === "accessory"),
      headSilhouette:manifest.mode === "layers" && slot === "accessory" ? manifest.model.file : undefined,
    };
  });
}

/** Same pixel-space registration and masks as the SVG view, used by JPEG export. */
export function paintComposition(ctx: CanvasRenderingContext2D, layers: PhotoLayer[], photos: Map<string, HTMLImageElement>) {
  ctx.fillStyle="#ece8df";
  ctx.fillRect(0,0,FRAME.width,FRAME.height);
  for(const layer of layers) {
    const source=photos.get(layer.image.file);
    if(!source)throw new Error("Missing decoded photograph");
    const buffer=document.createElement("canvas");
    buffer.width=FRAME.width;buffer.height=FRAME.height;
    const target=buffer.getContext("2d");
    if(!target)throw new Error("Photo export unavailable");
    target.save();
    if(layer.head) {
      const clipping=new Path2D(HEAD_NECK_PATH);
      for(const rect of HEAD_RECTS)clipping.rect(rect[0],rect[1],rect[2],rect[3]);
      target.clip(clipping);
    }
    target.transform(...layer.matrix);
    target.drawImage(source,0,0,FRAME.width,FRAME.height);
    target.restore();
    if(layer.headSilhouette) {
      const silhouette=photos.get(layer.headSilhouette);
      if(!silhouette)throw new Error("Missing decoded head silhouette");
      target.globalCompositeOperation="destination-in";
      target.drawImage(silhouette,0,0,FRAME.width,FRAME.height);
    }
    if(layer.protectFace) {
      target.globalCompositeOperation="destination-in";
      const mask=target.createLinearGradient(0,FACE_CLEAR,0,NECK_BLEND_END);
      mask.addColorStop(0,"rgba(255,255,255,0)");mask.addColorStop(1,"white");
      target.fillStyle=mask;target.fillRect(0,0,FRAME.width,FRAME.height);
    }
    ctx.drawImage(buffer,0,0);
  }
}
