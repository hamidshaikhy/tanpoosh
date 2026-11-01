import NextImage from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/api/types";
import { home } from "@/content/fa";
import "./category-display.css";

const illustrated=new Set(["jackets","t-shirts","trousers","shoes","sunglasses"]);

export function CategoryDisplay({categories}:{categories:Category[]}){
  if(!categories.length)return null;
  return <section className="category-display" aria-label="دسته‌بندی‌ها" data-testid="category-display">
    <div className="category-display-inner">
      <div className="category-display-heading"><h2>از کجا شروع کنیم؟</h2><Link href="/shop">همهٔ محصولات</Link></div>
      <ul className="category-display-grid">
        {categories.map(category=>{
          const label=category.slug==="sunglasses"?"عینک":home.categoryLabels[category.slug]??category.name;
          const image=illustrated.has(category.slug)?`/editorial/home/categories/${category.slug}.webp`:category.image?.url;
          return <li key={category.slug}><Link href={`/shop?category=${encodeURIComponent(category.slug)}`} aria-label={home.categoryLabels[category.slug]??category.name} className={`category-display-link category-display-${category.slug}`}>
            <div className="category-display-photo">{image&&<NextImage src={image} alt="" fill sizes="(max-width: 640px) 43vw, (max-width: 1000px) 18vw, 250px" loading="lazy" className={illustrated.has(category.slug)?"":"category-photo-fallback"}/>}</div>
            <span>{label}</span>
          </Link></li>;
        })}
      </ul>
    </div>
  </section>;
}
