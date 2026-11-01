import type { Outfit } from "@/studio/store";
import assets from "./hero-assets.json";

export const HERO_LOOKS = [
  {
    id:"navy",name:"سرمه‌ای و شنی",swatch:"#222c3c",image:assets.navy,
    alt:"چیدمان پولوشرت سرمه‌ای، شلوار شنی، لوفر قهوه‌ای و عینک روی میز روشن",
    outfit:{top:{slug:"polo-shirt",color:"navy",size:null},bottom:{slug:"chino-trousers",color:"sand",size:null},shoes:{slug:"suede-loafers",color:"brown",size:null},accessory:{slug:"tortoise-sunglasses",color:"tortoise",size:"ONE"}},
  },
  {
    id:"ivory",name:"شیری و ذغالی",swatch:"#eee6d7",image:assets.ivory,
    alt:"چیدمان پولوی شیری، شلوار ذغالی، کفش چرمی مشکی و عینک روی میز روشن",
    outfit:{top:{slug:"knit-polo",color:"ivory",size:null},bottom:{slug:"tailored-trousers",color:"charcoal",size:null},shoes:{slug:"derby-shoes",color:"black",size:null},accessory:{slug:"black-sunglasses",color:"black",size:"ONE"}},
  },
  {
    id:"weekend",name:"تیشرت و جین",swatch:"#61738b",image:assets.weekend,
    alt:"چیدمان تیشرت شیری، شلوار جین، کتانی سفید و عینک روی میز روشن",
    outfit:{top:{slug:"basic-tee",color:"ivory",size:null},bottom:{slug:"straight-jeans",color:"indigo",size:null},shoes:{slug:"leather-sneakers",color:"white",size:null},accessory:{slug:"tortoise-sunglasses",color:"tortoise",size:"ONE"}},
  },
] satisfies {id:string;name:string;swatch:string;image:{src:string;width:number;height:number;background:string};alt:string;outfit:Outfit}[];

/** Keep administrator-written copy; replace only the previous seeded wording. */
export function heroWording(hero:{title:string;subtitle:string;primary:{label:string;href:string};secondary:{label:string;href:string}}){
  return {
    title:hero.title==="خوش‌پوش، به سبک خودت"?"استایلت را خودت بچین.":hero.title,
    subtitle:hero.subtitle==="لباس‌های روزمره، انتخاب‌های شخصی"?"چند انتخاب ساده، یک ترکیب مخصوص تو.":hero.subtitle,
    studioLabel:hero.secondary.label==="ورود به استودیو"?"ساخت استایل من":hero.secondary.label,
    shopLabel:hero.primary.label==="مشاهده کالکشن"?"دیدن پوشاک":hero.primary.label,
    shopHref:hero.primary.label==="مشاهده کالکشن"&&["/shop","/collections/old-money"].includes(hero.primary.href)?"/shop":hero.primary.href,
  };
}
