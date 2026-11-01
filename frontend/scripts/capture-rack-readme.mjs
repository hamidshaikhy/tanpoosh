import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const out=resolve('../docs/screenshots');
const base=process.env.E2E_BASE_URL||'http://localhost:8088';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const clean='nextjs-portal { display: none !important; }';

async function ready(){
  await page.waitForLoadState('networkidle');
  await page.evaluate(async()=>{await document.fonts.ready;});
}
async function shot(name,fullPage=false){
  await ready();
  await page.screenshot({path:resolve(out,`${name}.png`),fullPage,style:clean});
  console.log(`Captured ${name}`);
}

try{
  await page.goto(`${base}/rack`,{timeout:120000});
  await expect(page.getByTestId('rack-room')).toHaveClass(/is-ready/,{timeout:90000});
  await page.waitForTimeout(2200);
  await shot('rack');

  const canvas=page.locator('[data-testid="rack-room"] .rack-canvas');
  await page.mouse.move(720,440);await page.mouse.down();
  await page.mouse.move(890,530,{steps:15});
  await expect.poll(async()=>Number(await canvas.getAttribute('data-pull'))).toBeGreaterThan(.1);
  await shot('rack-drag');
  await page.mouse.up();
  await expect.poll(async()=>Number(await canvas.getAttribute('data-pull'))).toBeLessThan(.01);
  await page.getByRole('navigation',{name:'انتخاب مستقیم لباس'}).getByRole('button',{name:'پولوشرت پنبه‌ای',exact:true}).click();
  await page.waitForTimeout(1700);
  await page.getByTestId('rack-view-product').click();
  await expect(page.getByTestId('rack-product')).toBeVisible();
  await expect(page.locator('.rack-product-visual .rack-canvas')).toHaveAttribute('data-view-angle','0.00');
  await page.locator('[data-testid^="rack-size-"]:enabled').first().click();
  await shot('rack-product');

  const result=page.waitForResponse(r=>r.url().endsWith('/api/v1/cart/items')&&r.request().method()==='POST');
  await page.getByTestId('rack-add-to-cart').click();
  const response=await result;
  if(!response.ok())throw Error(`Cart request failed (${response.status()})`);
  await expect(page.getByTestId('rack-add-to-cart')).toHaveText(/به سبدت اضافه شد/,{timeout:20000});
  await page.keyboard.press('Escape');
  await page.getByTestId('rack-open-cart').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot('rack-cart');
  await page.keyboard.press('Escape');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(1700);await shot('rack-mobile');
  await page.getByTestId('rack-view-product').click();
  await expect(page.locator('.rack-product-visual .rack-canvas')).toHaveAttribute('data-view-angle','0.00');
  await shot('rack-product-mobile');
  await page.keyboard.press('Escape');

  await page.goto(base,{timeout:120000});await ready();
  const promo=page.getByTestId('rack-discovery');
  await expect(promo).toHaveCSS('display','grid');
  await promo.scrollIntoViewIfNeeded();
  await promo.screenshot({path:resolve(out,'home-rack-mobile.png'),style:clean});
  console.log('Captured home-rack-mobile');
  await page.setViewportSize({width:1440,height:900});
  await promo.scrollIntoViewIfNeeded();await ready();
  await promo.screenshot({path:resolve(out,'home-rack.png'),style:clean});
  console.log('Captured home-rack');
  await page.evaluate(()=>window.scrollTo(0,0));await shot('home');
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
