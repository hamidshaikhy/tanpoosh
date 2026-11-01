"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { faDigits, toman } from "@/lib/format";
import { useCart } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";
import type { RackItem } from "./catalog";
import { GarmentArtwork } from "./GarmentArtwork";
import { ProductInspector } from "./ProductInspector";
import { RackCanvas } from "./RackCanvas";
import "./rack.css";

export function RackApp({items}:{items:RackItem[]}) {
  const initial=Math.min(4,items.length-1);
  const [active,setActive]=useState(initial);
  const [inspecting,setInspecting]=useState(false);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const [progress,setProgress]=useState(0);
  const [help,setHelp]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const cartOpen=useUI(s=>s.cartOpen);
  const openCart=useUI(s=>s.openCart);
  const {data:cart}=useCart();
  const item=items[active];
  const choose=useCallback((index:number)=>{setActive(Math.max(0,Math.min(items.length-1,index)));},[items.length]);
  const open=useCallback(()=>{setInspecting(true);},[]);
  const close=useCallback(()=>{setInspecting(false);requestAnimationFrame(()=>trigger.current?.focus());},[]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(inspecting||cartOpen||help||event.altKey||event.ctrlKey||event.metaKey)return;
      if((event.target as HTMLElement)?.closest("button,a,input,select,textarea"))return;
      if(event.key==="ArrowRight"){event.preventDefault();choose(active+1);}
      if(event.key==="ArrowLeft"){event.preventDefault();choose(active-1);}
      if(event.key==="Home"){event.preventDefault();choose(0);}
      if(event.key==="End"){event.preventDefault();choose(items.length-1);}
    };
    window.addEventListener("keydown",keyboard);return()=>window.removeEventListener("keydown",keyboard);
  },[active,cartOpen,choose,help,inspecting,items.length]);

  return <div className={`rack-room ${ready?"is-ready":""}`} data-testid="rack-room">
    <header className="rack-header">
      <Link href="/" className="rack-back"><Icon name="arrow" flip /><span>بازگشت به فروشگاه</span></Link>
      <div className="rack-plaque"><BrandLogo className="rack-wordmark" /><h1>رگال تن‌پوش</h1></div>
      <div className="rack-header-actions">
        <button type="button" className="rack-icon-button rack-help" aria-label="راهنمای رگال" aria-expanded={help} onClick={()=>setHelp(!help)}><Icon name="info" /></button>
        <button type="button" className="rack-icon-button rack-bag-button" aria-label={`سبد خرید، ${faDigits(cart?.item_count??0)} کالا`} onClick={openCart} data-testid="rack-open-cart"><Icon name="bag" />{Boolean(cart?.item_count)&&<span>{faDigits(cart!.item_count)}</span>}</button>
      </div>
    </header>
    <main id="main" className="rack-stage" aria-label="رگال تعاملی لباس" tabIndex={-1}>
      {!failed&&<RackCanvas items={items} active={active} inspecting={false} angle={0} paused={inspecting||cartOpen||help} onSelect={choose} onInspect={open} onProgress={setProgress} onReady={()=>setReady(true)} onError={()=>{setFailed(true);setReady(true);}} />}
      {failed&&<div className="rack-fallback-scene" dir="ltr"><span className="rack-fallback-rail"/>{items.map((entry,index)=><button className={`rack-flat-garment ${index===active?"is-active":""}`} style={{left:`calc(50% + ${(index-active)*120}px)`}} key={entry.asset} type="button" tabIndex={index===active?0:-1} onClick={()=>index===active?open():choose(index)} aria-label={`${entry.product.name}، مشاهدهٔ محصول`}><GarmentArtwork asset={entry.asset}/></button>)}</div>}
      {!ready&&<div className="rack-loading" role="status"><BrandLogo className="rack-loading-logo"/><span>در حال آماده‌شدن رگال…</span><div className="rack-loading-track"><i style={{transform:`scaleX(${Math.max(.06,progress)})`}}/></div><small>{faDigits(Math.round(progress*100))}٪</small></div>}
      {help&&<div className="rack-help-panel" role="region" aria-label="راهنمای رگال"><button type="button" aria-label="بستن راهنما" onClick={()=>setHelp(false)}><Icon name="close" /></button><h2>با خیال راحت، ورق بزن.</h2><p>رگال را با ماوس یا انگشت بکش. با چرخ ماوس یا دکمه‌های کنار نام لباس هم می‌توانی جابه‌جا شوی.</p><p>روی لباس وسط بزن تا زاویه‌های دیگرش را ببینی، سایزت را انتخاب کنی و به سبد اضافه‌اش کنی.</p></div>}
      <span className="rack-edition" aria-hidden="true">منتخب تن‌پوش<span>لباس‌های روزمره، با دقت انتخاب‌شده</span></span>
    </main>
    <footer className="rack-bottom">
      <div className="rack-counter" aria-label={`لباس ${faDigits(active+1)} از ${faDigits(items.length)}`}><span>{faDigits(String(active+1).padStart(2,"0"))}</span><i/><span>{faDigits(String(items.length).padStart(2,"0"))}</span></div>
      <div className="rack-product-summary" aria-live="polite" aria-atomic="true">
        <button type="button" className="rack-nav-button" aria-label="لباس قبلی" onClick={()=>choose(active-1)} disabled={active===0} data-testid="rack-previous"><Icon name="chevron" /></button>
        <div className="rack-selected" key={item.product.slug}><h2 data-testid="rack-selected-name">{item.product.name}</h2><p className="num">{toman(item.product.price_min)}</p><button ref={trigger} type="button" onClick={open} className="rack-view-button" data-testid="rack-view-product">از نزدیک ببین<Icon name="plus" /></button></div>
        <button type="button" className="rack-nav-button" aria-label="لباس بعدی" onClick={()=>choose(active+1)} disabled={active===items.length-1} data-testid="rack-next"><Icon name="chevron" flip /></button>
      </div>
      <div className="rack-gesture"><Icon name="move" /><span>بکش و کشف کن</span></div>
    </footer>
    <nav className="rack-index" aria-label="انتخاب مستقیم لباس">{items.map((entry,index)=><button key={entry.asset} type="button" aria-label={entry.product.name} aria-current={index===active?"true":undefined} onClick={()=>choose(index)}><span/></button>)}</nav>
    {failed&&<p className="rack-compatibility" role="status">نمای تصویری فعال است؛ نمایش سه‌بعدی در این مرورگر در دسترس نیست.</p>}
    {inspecting&&<ProductInspector key={item.asset} item={item} onClose={close} />}
  </div>;
}
