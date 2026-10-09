import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve('../docs/screenshots');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const base=process.env.E2E_BASE_URL || 'http://localhost:8088';
async function ready(){
 await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).filter(i=>i.loading!=='lazy').map(i=>i.decode().catch(()=>{})));});
}
async function shot(name,fullPage=false){await ready();await page.screenshot({path:resolve(out,`${name}.png`),fullPage,style:'nextjs-portal { display: none !important; }'});console.log(`Captured ${name}`);}
try {
 await page.goto(base); await shot('home');
 const discovery=page.getByTestId('look-discovery');
 await discovery.scrollIntoViewIfNeeded();await ready();
 await discovery.screenshot({path:resolve(out,'home-looks.png')});console.log('Captured home-looks');
 await page.goto(`${base}/shop`);await shot('shop');
 await page.goto(`${base}/products/oxford-shirt`);await shot('product');
 await page.goto(`${base}/studio`);await ready();
 await page.getByRole('button',{name:'کلاسیک با عینک',exact:true}).click();
 await page.getByTestId('show-look').click();
 await expect(page.getByTestId('model-photo')).not.toHaveAttribute('data-preview-key','reference');
 await shot('studio');
 await page.setViewportSize({width:390,height:844});
 await page.goto(base);await shot('mobile',true);
 await page.setViewportSize({width:1440,height:1000});
 const raw=await readFile(resolve('../backend/.local-credentials/owner.txt'),'utf8');
 const username=raw.match(/^username: (.+)$/m)[1].trim();
 const password=raw.match(/^password: (.+)$/m)[1].trim();
 await page.goto(`${base}/manage/login`);
 await page.locator('input[name="identifier"]').fill(username);
 await page.locator('input[name="password"]').fill(password);
 await page.getByRole('button',{name:'ورود',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/manage');
 const me=await page.request.get(`${base}/api/v1/auth/me`);
 const data=await me.json();
 if(!data.user?.mfa?.verified || !data.user?.mfa?.dev_bypass) throw new Error('Password-only admin login failed');
 const dashboard=await page.request.get(`${base}/api/v1/manage/dashboard`);
 if(dashboard.status()!==200)throw new Error(`Dashboard rejected admin: ${dashboard.status()}`);
 await page.getByRole('combobox').nth(1).selectOption('test');
 await expect(page.getByRole('combobox').nth(1)).toHaveValue('test');
 await ready();
 await page.screenshot({path:resolve(out,'admin.png'),clip:{x:0,y:0,width:1440,height:850},style:'nextjs-portal { display: none !important; }'});
 console.log('Captured admin');
 await page.goto(`${base}/manage/products`);await shot('admin-products');
 console.log('Password-only admin login and management API verified.');
} finally {await browser.close();}
