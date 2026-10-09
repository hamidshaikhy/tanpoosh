"use client";

import { useId } from "react";
import type { StudioManifest } from "@/lib/api/types";
import { compositionLayers, FACE_CLEAR, FRAME, HEAD_NECK_PATH, HEAD_RECTS, NECK_BLEND_END } from "./composition";

export function PhotoComposition({manifest,files,label}:{manifest:StudioManifest;files:string[];label:string}) {
  const id=useId().replaceAll(":","");
  const layers=compositionLayers(manifest,files);
  const face=`${id}-face`, blend=`${id}-blend`, head=`${id}-head`, silhouette=`${id}-silhouette`;
  return <svg viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} role="img" aria-label={label} className="size-full" data-testid="photo-composition" data-face-clear={FACE_CLEAR}>
    <defs>
      <linearGradient id={blend} gradientUnits="userSpaceOnUse" x1="0" y1={FACE_CLEAR} x2="0" y2={NECK_BLEND_END}>
        <stop offset="0" stopColor="black" /><stop offset="1" stopColor="white" />
      </linearGradient>
      <mask id={face} maskUnits="userSpaceOnUse" x="0" y="0" width={FRAME.width} height={FRAME.height} style={{maskType:"luminance"}}>
        <rect width={FRAME.width} height={FRAME.height} fill={`url(#${blend})`} />
      </mask>
      <clipPath id={head}><path d={HEAD_NECK_PATH} />{HEAD_RECTS.map((rect,i)=><rect key={i} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} />)}</clipPath>
      <mask id={silhouette} maskUnits="userSpaceOnUse" x="0" y="0" width={FRAME.width} height={FRAME.height} style={{maskType:"alpha"}}>
        <image href={manifest.model.file} width={FRAME.width} height={FRAME.height} preserveAspectRatio="none" />
      </mask>
    </defs>
    <rect width={FRAME.width} height={FRAME.height} fill="#ece8df" />
    {layers.map(layer=><g key={layer.image.file} mask={layer.protectFace?`url(#${face})`:layer.headSilhouette?`url(#${silhouette})`:undefined} clipPath={layer.head?`url(#${head})`:undefined}>
      <image href={layer.image.file} width={FRAME.width} height={FRAME.height} preserveAspectRatio="none" transform={`matrix(${layer.matrix.join(" ")})`} data-testid={layer.selected?"outfit-photo-layer":undefined} data-slot={layer.slot} />
    </g>)}
  </svg>;
}
