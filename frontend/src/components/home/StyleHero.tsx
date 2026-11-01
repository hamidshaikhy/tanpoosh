"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Home, StudioProduct } from "@/lib/api/types";
import { encodeOutfit } from "@/studio/store";
import { sanitizeOutfit } from "@/studio/looks";
import { HERO_LOOKS, heroWording } from "./hero-looks";
import "./style-hero.css";

export function StyleHero({hero,products}:{hero:Home["hero"];products:StudioProduct[]}){
  const available=HERO_LOOKS.filter(look=>Object.values(look.outfit).every(selection=>products.some(product=>product.slug===selection.slug&&product.studio_supported&&product.studio_asset&&product.colors.some(color=>color.code===selection.color))));
  const looks=available.length?available:[HERO_LOOKS[0]];
  const [selected,setSelected]=useState(0);
  const [pending,setPending]=useState<number|null>(null);
  const [failed,setFailed]=useState(false);
  const [photoFailed,setPhotoFailed]=useState(false);
  const request=useRef(0);
  const look=looks[selected]??looks[0];
  const wording=heroWording(hero);
  const outfit=sanitizeOutfit(look.outfit,products,{supportedOnly:true});
  const studioHref=available.length&&hero.secondary.href==="/studio"?`/studio?outfit=${encodeURIComponent(encodeOutfit(outfit.outfit))}`:hero.secondary.href;
  const top=products.find(product=>product.slug===look.outfit.top.slug);
  const bottom=products.find(product=>product.slug===look.outfit.bottom.slug);
  const choose=async(index:number)=>{
    const token=++request.current;
    setFailed(false);
    if(index===selected){setPending(null);return;}
    setPending(index);
    try{
      const image=new Image();image.src=looks[index].image.src;await image.decode();
      if(request.current===token){setSelected(index);setPending(null);setPhotoFailed(false);}
    }catch{if(request.current===token){setPending(null);setFailed(true);}}
  };

  return <section aria-labelledby="hero-title" className="style-hero" data-testid="style-hero" style={{"--hero-background":look.image.background} as CSSProperties}>
    <div className={`style-hero-art ${photoFailed?"photo-unavailable":""}`}>
      <NextImage key={look.id} src={look.image.src} alt={look.alt} width={look.image.width} height={look.image.height} fetchPriority="high" loading="eager" className="style-hero-photo" onError={()=>setPhotoFailed(true)} data-testid="hero-look-image" />
      {!photoFailed&&available.length>0&&<div className="style-hero-points">
        {top&&<Link href={`/products/${top.slug}?color=${look.outfit.top.color}`} className="style-hero-point style-hero-point-top" aria-label={`مشاهدهٔ ${top.name}`} data-testid="hero-top-product"><i/><span>{top.name}</span></Link>}
        {bottom&&<Link href={`/products/${bottom.slug}?color=${look.outfit.bottom.color}`} className="style-hero-point style-hero-point-bottom" aria-label={`مشاهدهٔ ${bottom.name}`} data-testid="hero-bottom-product"><i/><span>{bottom.name}</span></Link>}
      </div>}
    </div>
    <div className="style-hero-content">
      <div className="style-hero-copy">
        <h1 id="hero-title">{wording.title==="استایلت را خودت بچین."?<><span>استایلت را</span>{" "}<span>خودت بچین.</span></>:wording.title}</h1>
        <p>{wording.subtitle}</p>
        <div className="style-hero-actions">
          <Link href={studioHref} className="style-hero-primary" data-testid="hero-studio-link">{wording.studioLabel}<Icon name="arrow"/></Link>
          <Link href={wording.shopHref} className="style-hero-secondary">{wording.shopLabel}</Link>
        </div>
      </div>
    </div>
    {looks.length>1&&<div className="style-hero-selector">
      <p id="hero-look-label">ترکیب امروز</p>
      <div role="group" aria-labelledby="hero-look-label" className="style-hero-swatches">
        {looks.map((entry,index)=><button key={entry.id} type="button" onClick={()=>void choose(index)} aria-label={`انتخاب ترکیب ${entry.name}`} aria-pressed={selected===index} aria-busy={pending===index||undefined} className={selected===index?"is-selected":""} data-testid={`hero-look-${entry.id}`}><span style={{background:entry.swatch}}/>{pending===index&&<i/>}</button>)}
      </div>
      <p className={`style-hero-look-status ${failed?"has-error":""}`} role="status" aria-live="polite">{failed?"تصویر آماده نشد؛ دوباره انتخاب کن.":pending!==null?"در حال آماده‌شدن ترکیب…":look.name}</p>
    </div>}
  </section>;
}
