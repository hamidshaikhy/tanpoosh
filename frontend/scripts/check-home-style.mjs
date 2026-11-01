// Focused live checks and screenshots, without reseeding accounts or fixtures.
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const base=process.env.E2E_BASE_URL||'http://localhost:8088';
const output=resolve('../.local-tools/screenshots/home-style');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
const clean='nextjs-portal {display:none!important}';
try{
  const page=await browser.newPage({viewport:{width:1440,height:1060},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle',timeout:120000});
  const hero=page.getByTestId('style-hero');
  await expect(hero.getByRole('heading',{level:1})).toHaveText('استایلت را خودت بچین.');
  await expect(hero.getByRole('link',{name:'دیدن پوشاک',exact:true})).toHaveAttribute('href','/shop');
  await expect(page.getByTestId('category-display').getByRole('link')).toHaveCount(6);
  await page.screenshot({path:resolve(output,'desktop.png'),style:clean,animations:"disabled"});

  await page.getByTestId('hero-look-ivory').click();
  await expect(page.getByTestId('hero-look-ivory')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('hero-look-image')).toHaveAttribute('src',/hero-ivory/);
  await expect(page.getByTestId('hero-studio-link')).toHaveAttribute('href',/knit-polo/);
  await expect(page.getByTestId('hero-top-product')).toHaveAttribute('href','/products/knit-polo?color=ivory');
  await page.screenshot({path:resolve(output,'desktop-ivory.png'),style:clean,animations:"disabled"});

  await page.route('**/editorial/home/hero-weekend.webp',route=>route.abort());
  await page.getByTestId('hero-look-weekend').click();
  await expect(hero.getByRole('status')).toContainText('دوباره انتخاب کن');
  await expect(page.getByTestId('hero-look-image')).toHaveAttribute('src',/hero-ivory/);
  await page.unroute('**/editorial/home/hero-weekend.webp');
  await page.getByTestId('hero-look-weekend').click();
  await expect(page.getByTestId('hero-look-weekend')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('hero-look-image')).toHaveAttribute('src',/hero-weekend/);
  await expect(page.getByTestId('hero-studio-link')).toHaveAttribute('href',/straight-jeans/);
  await page.screenshot({path:resolve(output,'desktop-weekend.png'),style:clean,animations:"disabled"});
  await page.getByTestId('hero-studio-link').click();
  await expect(page).toHaveURL(/\/studio\?outfit=/);
  await page.getByTestId('show-look').click();
  await expect(page.getByTestId('model-photo')).toHaveAttribute('data-preview-key',/top:basic-tee:ivory/);
  await expect(page.getByTestId('model-photo')).toHaveAttribute('data-preview-key',/bottom:straight-jeans:indigo/);

  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByTestId('category-display').getByRole('link',{name:'کاپشن',exact:true}).click();
  await expect(page).toHaveURL(/\/shop\?category=jackets/);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:resolve(output,'mobile.png'),style:clean,animations:"disabled",fullPage:true});
  await expect(hero.getByRole('link',{name:'ساخت استایل من',exact:true})).toBeVisible();
  for(const width of [390,320,768]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  const category=page.getByTestId('category-display');
  await category.getByRole('link',{name:'عینک آفتابی',exact:true}).focus();
  await expect(category.getByRole('link',{name:'عینک آفتابی',exact:true})).toBeInViewport();
  expect(errors).toEqual([]);
  console.log('Passed: three looks, failed-image recovery, studio handoff, category navigation, mobile/reduced-motion/keyboard, no horizontal overflow or JavaScript errors.');
  console.log(`Screenshots: ${output}`);
}finally{await browser.close();}
