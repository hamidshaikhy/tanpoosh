import { ErrorBlock } from "@/components/ui/States";
import { getProduct } from "@/lib/api/public";
import { RACK_EDIT, type RackItem } from "@/rack/catalog";
import { RackApp } from "@/rack/RackApp";

export default async function RackPage() {
  const loaded=await Promise.allSettled(RACK_EDIT.map(async entry=>{
    const product=await getProduct(entry.slug);
    if(!product||!product.colors.some(c=>c.code===entry.color))return null;
    return {product,color:entry.color,asset:entry.asset,kind:entry.kind} satisfies RackItem;
  }));
  const items=loaded.flatMap(result=>result.status==="fulfilled"&&result.value?[result.value]:[]);
  if(!items.length)return <main id="main" className="mx-auto max-w-xl px-5 pt-32"><ErrorBlock message="رگال در حال حاضر در دسترس نیست. کمی بعد دوباره امتحان کن."/><a href="/shop" className="mt-6 block underline">بازگشت به فروشگاه</a></main>;
  return <RackApp items={items}/>;
}
