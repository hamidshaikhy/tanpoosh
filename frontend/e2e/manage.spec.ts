import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { call, credentials, login, makeOrder } from "./helpers";

test("owner MFA, product edit/upload/publish, stock, customer payment, fulfillment, returns, management pages", async ({page,browser}) => {
  await login(page,"owner");
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  const meta = await call(page.request,"/manage/catalog/meta");
  const slug = "browser-"+randomUUID().slice(0,8);
  const product = await call(page.request,"/manage/products","POST",{
    name:"کالای آزمایشی مرورگر",slug,category_id:meta.categories[0].id,description:"محصول ویژهٔ آزمون مرورگر",materials:"پنبه",care:"شستشو با آب سرد",fit_notes:"فیت استاندارد",size_chart:"tops",studio_slot:"none",
    colors:[{code:"ivory",name:"شیری",hex:"#EDE6D8"}],variants:[{color_code:"ivory",size:"M",sku:slug.toUpperCase(),price_toman:1800000,initial_stock:20}],
  });
  await page.goto(`/manage/products/${product.id}`);
  await page.getByRole("textbox",{name:"نام محصول",exact:true}).fill("پولوی تست مرورگر");
  await page.getByTestId("save-product").click();
  await expect(page.getByText("محصول ذخیره شد.",{exact:true})).toBeVisible();
  await page.locator('#media-upload').setInputFiles("../backend/fixtures/seed/photoreal/knit-polo.png");
  await expect(page.getByText("تصویر بارگذاری شد.",{exact:true})).toBeVisible();
  await page.getByTestId("publish").click();
  await expect.poll(async()=>(await call(page.request,`/manage/products/${product.id}`)).status).toBe("published");
  const v = product.variants[0];
  await call(page.request,`/manage/inventory/${v.id}/adjust`,"POST",{delta:2,reason:"آزمون موجودی"});
  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("heading",{name:"پولوی تست مرورگر",level:1})).toBeVisible();
  const customer = await browser.newContext({baseURL:"http://localhost:8088"});
  await call(customer.request,"/auth/login","POST",{identifier:credentials.customer.username,password:credentials.customer.password});
  // Clear only this test user's cart from a prior run.
  const cart = await call(customer.request,"/cart");
  for(const line of cart.items) await call(customer.request,`/cart/items/${line.id}`,"DELETE");
  const order = await makeOrder(customer.request,credentials.customer.email,slug);
  const pay = await call(customer.request,`/orders/${order.id}/pay`,"POST");
  const checkout = await customer.newPage();
  await checkout.goto(pay.redirect_url);
  await checkout.getByTestId("mock-success").click();
  await expect(checkout.getByRole("heading",{name:"پرداخت با موفقیت تأیید شد"})).toBeVisible();
  await page.goto(`/manage/orders/${order.id}`);
  await page.getByTestId("fulfill-pack").click();
  await expect(page.getByTestId("fulfill-ship")).toBeVisible();
  await page.getByTestId("fulfill-ship").click();
  await page.getByRole("textbox",{name:"شرکت حمل",exact:true}).fill("پست آزمایشی");
  await page.getByRole("dialog").getByRole("button",{name:"ثبت ارسال",exact:true}).click();
  await page.getByTestId("fulfill-deliver").click();
  await expect.poll(async()=>(await call(page.request,`/manage/orders/${order.id}`)).fulfillment_status).toBe("delivered");
  await call(customer.request,`/orders/${order.id}/returns`,"POST",{reason:"other",description:"مرجوعی آزمایشی",items:[{order_item_id:order.items[0].id,quantity:1}]});
  await checkout.goto(`/orders/${order.id}`);
  await expect(checkout.getByText(/درخواست مرجوعی|مرجوعی/).first()).toBeVisible();
  expect((await call(customer.request,`/orders/${order.id}`)).returns.length).toBe(1);
  await customer.close();
  for(const path of ["", "products","categories","inventory","orders","payments","refunds","returns","coupons","shipping","customers","support","reviews","content","staff","audit","security"]) {
    expect((await page.goto("/manage"+(path?"/"+path:"")))?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
  const current = await call(page.request,`/manage/products/${product.id}`);
  await call(page.request,`/manage/products/${product.id}/status`,"POST",{action:"archive",version:current.version});
});

for(const role of ["catalog_manager","order_manager","finance"]) test(`${role} MFA and forbidden staff page`, async({page})=>{
  await login(page,role);
  await page.goto("/manage/staff");
  expect((await page.request.get("/api/v1/manage/staff")).status()).toBe(403);
  await expect(page.getByText(/اجازه|دسترسی/).first()).toBeVisible();
  await call(page.request,"/auth/logout","POST");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});
