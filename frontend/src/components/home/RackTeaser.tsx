import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { GarmentArtwork } from "@/rack/GarmentArtwork";
import "./rack-teaser.css";

const clothes=["oxford-sky","chino-sand","polo-navy","crew-oatmeal","tee-black"];

export function RackTeaser() {
  return <section className="rack-teaser-section" aria-labelledby="rack-discover-title" data-testid="rack-discovery">
    <div className="rack-teaser-copy">
      <span className="rack-teaser-label"><span className="rack-teaser-dot" /> یک جور دیگر انتخاب کن</span>
      <h2 id="rack-discover-title">رگال را ورق بزن.</h2>
      <p>لباس‌ها را کنار هم ببین، بچرخان و جزئیاتشان را از نزدیک کشف کن. این‌بار، فروشگاه به کمدت نزدیک‌تر است.</p>
      <Link href="/rack" className="rack-teaser-cta">ورود به رگال <Icon name="arrow" /></Link>
      <span className="rack-teaser-note">انتخاب لباس، با حس یک فروشگاه واقعی</span>
    </div>
    <Link href="/rack" className="rack-teaser-preview" aria-label="باز کردن رگال تعاملی تن‌پوش" tabIndex={-1}>
      <div className="rack-teaser-plaque"><BrandLogo className="rack-teaser-logo" /><span>رگال تن‌پوش</span></div>
      <div className="rack-teaser-rail" />
      <div className="rack-teaser-garments" dir="ltr">
        {clothes.map((asset,index)=><div key={asset} className={`rack-teaser-garment ${index===2?"rack-teaser-center":""}`}>
          <svg viewBox="0 0 160 55" className="rack-teaser-hanger" aria-hidden="true"><path d="M80 19v-6c0-10 14-10 14-3 0 5-7 7-7 10L151 46Q155 51 148 51H12Q5 51 9 46L80 19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg>
          <GarmentArtwork asset={asset} className="rack-teaser-cloth" />
          <span className="rack-teaser-shadow" />
        </div>)}
      </div>
      <span className="rack-teaser-explore"><Icon name="move" /> بکش و کشف کن</span>
    </Link>
  </section>;
}
