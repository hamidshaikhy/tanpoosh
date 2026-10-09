import {chromium} from '@playwright/test';
const browser = await chromium.launch({channel:'chrome',headless:true,proxy:{server:'http://127.0.0.1:8095',bypass:'<-loopback>'}});
const page=await browser.newPage();
for(const path of ['/','/shop','/products/oxford-shirt','/collections/old-money','/signup','/login','/pages/privacy','/pages/terms','/bag']) {
  await page.goto('http://localhost:8088'+path,{waitUntil:'networkidle'});
}
await browser.close();
console.log('Public browser traffic captured by the loopback-only ZAP proxy.');
