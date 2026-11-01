import { useId } from "react";
import { ARTWORK } from "./artwork";

/** Native vector clipping preserves the original product photo and clean garment edges. */
export function GarmentArtwork({ asset, className = "", title }: {asset: string; className?: string; title?: string}) {
  const id = `cloth-${useId().replaceAll(":", "")}`;
  const art = ARTWORK[asset];
  if (!art) return null;
  return <svg viewBox={art.viewBox} preserveAspectRatio="xMidYMin meet" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    <defs><clipPath id={id}><path d={art.path} /></clipPath></defs>
    <image href={`/rack/${asset}.webp`} width="1122" height="1402" clipPath={`url(#${id})`} />
  </svg>;
}
