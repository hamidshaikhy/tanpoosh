"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { api, errorMessage } from "@/lib/api/client";
import type { Cart } from "@/lib/api/types";
import { sizeLabel, toman } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { RackItem } from "./catalog";
import { GarmentArtwork } from "./GarmentArtwork";
import { RackCanvas } from "./RackCanvas";

const views=[{label:"روبه‌رو",angle:0},{label:"نمای راست",angle:-1.18},{label:"نمای چپ",angle:1.18}];
const noop=()=>{};

export function ProductInspector({item,onClose}:{item:RackItem;onClose:()=>void}) {
  const [size,setSize]=useState<string|null>(null);
  const [view,setView]=useState(0);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const [phase,setPhase]=useState<"idle"|"packing"|"added">("idle");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const queryClient=useQueryClient();
  const variants=item.product.variants.filter(v=>v.color_code===item.color);
  const selected=variants.find(v=>v.size===size);
  const color=item.product.colors.find(c=>c.code===item.color);
  const add=useMutation({
    mutationFn:(variant_id:number)=>api<Cart>("/cart/items",{method:"POST",body:{variant_id,quantity:1}}),
    onSuccess:cart=>{
      queryClient.setQueryData(keys.cart,cart);
      setPhase("packing");
      timer.current=setTimeout(()=>setPhase("added"),1600);
    },
  });
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const busy=add.isPending||phase==="packing";
  return <Dialog open onClose={onClose} title={item.product.name} size="xl" hideTitle className="rack-product-dialog">
    <div className="rack-product-grid" data-testid="rack-product">
      <div className="rack-product-visual" dir="ltr">
        {!failed&&<RackCanvas items={[item]} active={0} inspecting={false} angle={views[view].angle} paused={false} productView onSelect={noop} onInspect={noop} onProgress={noop} onReady={()=>setReady(true)} onError={()=>setFailed(true)} />}
        {(!ready||failed)&&<div className="rack-product-photo"><GarmentArtwork asset={item.asset} title={item.product.name} /></div>}
        <span className="rack-detail-label">{item.product.category.name}</span>
        <div className="rack-view-controls" role="group" aria-label="زاویهٔ نمایش لباس">
          {views.map((v,index)=><button key={v.label} type="button" aria-label={v.label} aria-pressed={view===index} onClick={()=>setView(index)} disabled={failed&&index!==0} className={view===index?"is-current":""}>
            <GarmentArtwork asset={item.asset} className={`rack-view-thumb rack-view-${index}`} />
          </button>)}
        </div>
        <p className="rack-visual-hint"><Icon name="rotate" /> زاویهٔ لباس را انتخاب کن</p>
      </div>
      <div className="rack-product-info">
        <div className="rack-product-title"><span>از رگال تن‌پوش</span><h2>{item.product.name}</h2><p className="num" data-testid="rack-product-price">{toman(selected?.price_toman??item.product.price_min)}</p></div>
        <p className="rack-description">{item.product.short_description}</p>
        <div className="rack-color-line"><span>رنگ</span><span><i style={{background:color?.hex}} />{color?.name}</span></div>
        <fieldset className="rack-sizes" disabled={busy}>
          <legend>سایزت را انتخاب کن</legend>
          <div dir="ltr">{variants.map(variant=><button type="button" key={variant.id} disabled={!variant.in_stock} aria-pressed={size===variant.size} onClick={()=>{setSize(variant.size);setPhase("idle");add.reset();}} className={size===variant.size?"is-selected":""} data-testid={`rack-size-${variant.size}`}>{sizeLabel(variant.size)}</button>)}</div>
        </fieldset>
        <div className="rack-material"><Icon name="tag" /><span>{item.product.materials || item.product.fit_notes || "جزئیات بیشتر در صفحهٔ محصول"}</span></div>
        <div className="rack-purchase">
          <div role="status" aria-live="polite" className={`rack-purchase-status ${add.isError?"is-error":""}`}>
            {add.isError?errorMessage(add.error):phase==="added"?"لباس با سایز انتخابی به سبدت اضافه شد.":!size?"برای افزودن به سبد، یک سایز انتخاب کن.":selected?.low_stock?"تعداد محدودی از این سایز باقی مانده است.":""}
          </div>
          <button className="rack-add-button" type="button" disabled={!selected?.in_stock||busy||phase==="added"} onClick={()=>{if(selected?.in_stock)add.mutate(selected.id);}} data-testid="rack-add-to-cart">
            {busy?<><span className="rack-spinner" />{phase==="packing"?"در حال بسته‌بندی…":"در حال افزودن…"}</>:phase==="added"?<><Icon name="check" />به سبدت اضافه شد</>:<>افزودن به سبد<Icon name="bag" /></>}
          </button>
          <Link href={`/products/${item.product.slug}?color=${item.color}`} className="rack-full-product">جزئیات و رنگ‌های دیگر<Icon name="arrow" /></Link>
        </div>
      </div>
    </div>
    {phase==="packing"&&<div className="rack-packing" aria-hidden="true">
      <div className="rack-packing-cloth"><GarmentArtwork asset={item.asset} /></div>
      <div className="rack-paper-bag"><div className="rack-bag-handle"/><BrandLogo className="rack-bag-logo"/><span>تن‌پوش، به سبک تو</span></div>
    </div>}
  </Dialog>;
}
