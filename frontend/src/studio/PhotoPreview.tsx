"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/States";
import { studio as copy } from "@/content/fa";
import type { StudioManifest, StudioProduct } from "@/lib/api/types";
import { previewFiles, previewKey, REQUIRED_SLOTS } from "./preview";
import { useStudio } from "./store";
import { PhotoComposition } from "./PhotoComposition";
import { compositionLayers, FRAME, paintComposition } from "./composition";


function loadPhoto(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const photo = new window.Image();
    photo.onload = () => { photo.decode().then(() => resolve(photo), reject); };
    photo.onerror = () => reject(new Error(copy.loadError));
    photo.src = file;
  });
}

export function PhotoPreview({ manifest, products }: { manifest: StudioManifest | null; products: StudioProduct[] }) {
  const outfit = useStudio(s => s.outfit);
  const undo = useStudio(s => s.undo), redo = useStudio(s => s.redo), replace = useStudio(s => s.replace);
  const canUndo = useStudio(s => s.past.length > 0), canRedo = useStudio(s => s.future.length > 0);
  const [result, setResult] = useState<{ key: string; files: string[]; names: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const request = useRef(0);
  const currentKey = previewKey(outfit);
  const dirty = result !== null && result.key !== currentKey;
  const missing = REQUIRED_SLOTS.filter(slot => !outfit[slot]);
  const files = manifest ? previewFiles(manifest, outfit, products) : null;

  useEffect(() => () => { request.current++; }, []);

  const show = async () => {
    if (!manifest || !files) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      await Promise.all([manifest.model.file,...files].map(loadPhoto));
      if (token !== request.current) return;
      if (previewKey(useStudio.getState().outfit) !== currentKey) return;
      const names = Object.values(outfit).map(selection => products.find(p => p.slug === selection?.slug)?.name).filter(Boolean).join("، ");
      setResult({ key: currentKey, files, names });
    } catch {
      if (token === request.current) setError(copy.loadError);
    } finally {
      if (token === request.current) setBusy(false);
    }
  };

  const download = async () => {
    if (!result || !manifest || dirty) return;
    setDownloading(true);
    setError("");
    try {
      const layers = compositionLayers(manifest,result.files);
      const photoFiles = [...new Set([manifest.model.file,...layers.map(layer => layer.image.file)])];
      const photos = await Promise.all(photoFiles.map(loadPhoto));
      const canvas = document.createElement("canvas");
      canvas.width = FRAME.width;
      canvas.height = FRAME.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image export unavailable");
      paintComposition(ctx,layers,new Map(photoFiles.map((file,index)=>[file,photos[index]])));
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image export failed")), "image/jpeg", 0.95));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tanpoosh-my-look.jpg";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(copy.downloadError);
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    request.current++;
    setBusy(false);
    setError("");
    setResult(null);
    setExpanded(false);
    replace({});
  };

  const photo = (large = false) => manifest ? <div className={`relative aspect-[2/3] ${large ? "w-full max-w-[calc(65dvh*2/3)] mx-auto" : "w-[min(100cqw,calc(100cqh*2/3))]"} ${dirty ? "opacity-40" : ""}`} data-testid={large ? "expanded-photo" : "model-photo"} data-preview-key={result?.key ?? "reference"}>
    {result ? <PhotoComposition manifest={manifest} files={result.files} label={`${copy.resultAlt}: ${result.names}`} /> : <NextImage src={manifest.model.file} alt={copy.modelAlt} fill className="object-contain" preload />}
  </div> : null;

  return <>
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/50 px-4 py-3 lg:px-6">
      <div>
        <h1 className="text-lg font-semibold lg:text-2xl">{copy.headline}</h1>
        <p className="mt-1 hidden text-xs text-ink-soft sm:block">{copy.photoHint}</p>
      </div>
      <span className="shrink-0 rounded-full border border-line bg-bg/70 px-3 py-1 text-[11px]">{result && !dirty ? copy.lookReady : copy.chooseFirst}</span>
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2" style={{ containerType: "size" }} data-testid="photo-stage" aria-busy={busy}>
      {manifest ? photo() : <Notice tone="warning">{copy.loadError}</Notice>}
      {result && !dirty ? <button type="button" onClick={() => setExpanded(true)} aria-label={copy.expandPhoto} className="absolute start-3 top-3 z-20 rounded-full border border-line bg-bg/90 p-2"><Icon name="zoom-in" /></button> : null}
      {!result ? <p className="absolute bottom-3 rounded-full bg-bg/90 px-3 py-1 text-[11px] text-ink-soft">{copy.modelReference}</p> : null}
      {dirty ? <div className="absolute inset-x-4 bottom-4 z-20 border border-line bg-bg/95 px-4 py-3 text-center text-xs" role="status">{copy.changedLook}</div> : null}
      {busy ? <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/60" role="status"><span className="bg-bg px-5 py-3 text-sm">{copy.loading}</span></div> : null}
    </div>
    <div className="z-20 flex shrink-0 flex-col gap-2 border-t border-line/50 bg-bg/80 px-4 py-3 lg:px-6">
      {missing.length ? <p className="text-center text-xs text-ink-soft">{copy.requiredSelection(missing.map(slot => copy.slots[slot]).join("، "))}</p>
        : !files ? <p className="text-center text-xs text-warning">{copy.noMatchingImage}</p> : null}
      {error ? <p className="text-center text-xs text-danger" role="alert">{error}</p> : null}
      <div className="flex items-center justify-center gap-3">
        <Button size="lg" onClick={show} disabled={!files || busy} loading={busy} icon={<Icon name="arrow" />} className="min-w-48 justify-between" data-testid="show-look">
          {dirty ? copy.updatePreview : copy.showLook}
        </Button>
        <button type="button" onClick={undo} disabled={!canUndo} aria-label={copy.undo} className="p-2 disabled:opacity-30"><Icon name="undo" /></button>
        <button type="button" onClick={redo} disabled={!canRedo} aria-label={copy.redo} className="p-2 disabled:opacity-30"><Icon name="redo" /></button>
        <button type="button" onClick={reset} aria-label={copy.resetLook} className="p-2"><Icon name="rotate" /></button>
      </div>
      {result && !dirty ? <button type="button" onClick={download} disabled={downloading} className="self-center text-xs underline underline-offset-4 disabled:opacity-40" data-testid="download-look">{downloading ? copy.loading : copy.downloadPhoto}</button> : null}
      <p className="hidden text-center text-[11px] text-muted lg:block">{copy.photoDisclaimer}</p>
    </div>
    <Dialog open={expanded} onClose={() => setExpanded(false)} title={copy.resultAlt} size="lg">
      <div className="overflow-hidden bg-surface px-3 py-4">{photo(true)}</div>
      <button type="button" onClick={download} disabled={downloading || dirty} className="border-t border-line py-3 text-sm underline disabled:opacity-40">{copy.downloadPhoto}</button>
    </Dialog>
  </>;
}
