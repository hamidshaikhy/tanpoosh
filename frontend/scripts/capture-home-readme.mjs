import { chromium,expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output=resolve('../docs/screenshots');
await mkdir(output,{recursive:true});
const base=process.env.E2E_BASE_URL||'http://localhost:8088';
const browser=await chromium.launch({channel:'chrome',headless:true});
const style='nextjs-portal {display:none!important}';
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  await page.goto(base,{waitUntil:'networkidle',timeout:120000});
  await page.evaluate(()=>document.fonts.ready);
  const shot=async name=>{await page.screenshot({path:resolve(output,`${name}.png`),style,animations:'disabled'});console.log(`Captured ${name}`);};
  await shot('home');
  const categories=page.getByTestId('category-display');
  await categories.screenshot({path:resolve(output,'home-categories.png'),style,animations:'disabled'});
  await page.evaluate(()=>scrollTo(0,0));
  for(const name of ['ivory','weekend']){
    await page.getByTestId(`hero-look-${name}`).click();
    await expect(page.getByTestId(`hero-look-${name}`)).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('hero-look-image')).toHaveAttribute('src',new RegExp(`hero-${name}`));
    await shot(`home-${name}`);
  }
  await page.getByTestId('hero-look-navy').click();
  await expect(page.getByTestId('hero-look-navy')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:resolve(output,'home-hero-mobile.png'),style,animations:'disabled'});
  // Scroll through lazy images before taking the full-page mobile capture.
  await page.evaluate(async()=>{
    for(const image of document.images){image.loading='eager';}
    await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
  });
  await page.screenshot({path:resolve(output,'mobile.png'),style,animations:'disabled',fullPage:true});
  console.log('Captured category display, hero-mobile and mobile homepage');
}finally{await browser.close();}
