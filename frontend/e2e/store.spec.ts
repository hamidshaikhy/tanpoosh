import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { address, call, credentials, login, makeOrder, mailLink } from "./helpers";

test("desktop and mobile browse, filter URL and history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 900});
    for (const route of ["/", "/shop?category=sunglasses&sort=price_asc", "/collections/old-money", "/products/tortoise-sunglasses"]) {
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  await page.goto("/shop?category=sunglasses");
  await page.goto("/shop?sort=price_desc");
  await page.goBack();
  await expect(page).toHaveURL(/category=sunglasses/);
  expect(errors).toEqual([]);
});

test("guest UI purchase, single order submission, paid email and ownership", async ({ page, browser }) => {
  await page.goto("/products/tortoise-sunglasses");
  await page.getByText("تک‌سایز", {exact:true}).click();
  await page.getByTestId("add-to-bag").click();
  await expect(page.getByTestId("header-cart")).toContainText("۱");
  await page.goto("/checkout");
  await page.getByTestId("fill-sample").click();
  const guestEmail = `guest.${Date.now()}@example.com`;
  await page.getByRole("textbox", {name:"ایمیل",exact:true}).fill(guestEmail);
  await page.getByRole("button", {name:"مرحلهٔ بعد",exact:true}).click();
  await page.getByRole("button", {name:"مرحلهٔ بعد",exact:true}).click();
  let submissions = 0;
  page.on("request", r => {if(r.method()==="POST" && r.url().endsWith("/checkout/orders")) submissions++;});
  await page.getByTestId("pay-button").dblclick();
  await expect(page.getByTestId("mock-success")).toBeVisible();
  await page.getByTestId("mock-success").click();
  await expect(page.getByRole("heading", {name:"پرداخت با موفقیت تأیید شد"})).toBeVisible();
  expect(submissions).toBe(1);
  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId).toBeTruthy();
  await page.getByRole("link", {name:"مشاهدهٔ سفارش"}).click();
  await expect(page.locator("h1")).toBeVisible();
  const other = await browser.newContext();
  expect((await other.request.get(`http://localhost:8088/api/v1/orders/${orderId}`)).status()).toBe(404);
  await other.close();
  await expect.poll(async () => {
    const mails = await (await page.request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    return mails.messages.some((m: {To:{Address:string}[]}) => m.To.some(t => t.Address === guestEmail));
  }, {timeout:30000}).toBe(true);
});

for (const outcome of ["failure", "cancel"]) test(`mock ${outcome}, retry and successful verification`, async ({page}) => {
  const order = await makeOrder(page.request);
  const pay = await call(page.request, `/orders/${order.id}/pay`, "POST");
  await page.goto(pay.redirect_url);
  await page.getByTestId(`mock-${outcome}`).click();
  await expect(page.getByRole("button", {name:"پرداخت دوباره",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"پرداخت دوباره",exact:true}).click();
  await page.getByTestId("mock-success").click();
  await expect(page.getByRole("heading", {name:"پرداخت با موفقیت تأیید شد"})).toBeVisible();
});

test("signup, Mailpit verification, logout, guest cart merge, wishlist, address, saved look, password reset", async ({page}) => {
  const username = "browser_"+randomUUID().slice(0,8);
  const email = username+"@example.com";
  const password = randomUUID()+"Aa!";
  await page.goto("/signup");
  await page.locator('input[name="first_name"]').fill("آزمایش");
  await page.locator('input[name="last_name"]').fill("مرورگر");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(await mailLink(page.request, email, "verify-email"));
  await expect(page.getByText("ایمیل شما تأیید شد.", {exact:true})).toBeVisible();
  await call(page.request, "/auth/logout", "POST");
  const product = await call(page.request, "/catalog/products/tortoise-sunglasses");
  await call(page.request, "/cart/items", "POST", {variant_id:product.variants[0].id,quantity:1});
  await page.goto("/login");
  await page.locator('input[name="identifier"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/account$/);
  expect((await call(page.request, "/cart")).item_count).toBe(1);
  await call(page.request, "/account/addresses", "POST", {...address,label:"خانه آزمایشی",is_default:true});
  await page.goto("/account/addresses");
  await expect(page.getByText(address.line, {exact:false}).first()).toBeVisible();
  await page.goto("/products/tortoise-sunglasses");
  await page.getByRole("button", {name:"افزودن به علاقه‌مندی‌ها",exact:true}).click();
  await expect(page.getByRole("button", {name:"حذف از علاقه‌مندی‌ها",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.goto("/account/wishlist");
  await expect(page.getByRole("link", {name:"عینک لاک‌پشتی کلاسیک",exact:true}).first()).toBeVisible();
  await call(page.request, "/account/looks", "POST", {name:"استایل آزمایشی",items:[{slot:"accessory",product_id:product.id,color_code:"tortoise",size:"ONE"}]});
  await page.goto("/account/looks");
  await expect(page.getByText("استایل آزمایشی",{exact:true})).toBeVisible();
  await call(page.request, "/auth/logout", "POST");
  await page.goto("/forgot-password");
  await page.getByRole("textbox",{name:"ایمیل",exact:true}).fill(email);
  await page.getByRole("button",{name:"ارسال پیوند بازیابی",exact:true}).click();
  await page.goto(await mailLink(page.request,email,"reset-password"));
  const nextPassword = randomUUID()+"Bb!";
  await page.locator('input[type="password"]').nth(0).fill(nextPassword);
  await page.locator('input[type="password"]').nth(1).fill(nextPassword);
  await page.getByRole("button",{name:"ذخیرهٔ رمز جدید",exact:true}).click();
  await expect(page.getByText(/رمز.*(تغییر|ذخیره)/).first()).toBeVisible();
  const me = await call(page.request,"/auth/me");
  expect(me.authenticated).toBe(false);
});

test("photo studio, choose a complete look and sizes, batch add", async ({page}) => {
  const errors:string[] = [];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/studio?product=tortoise-sunglasses&color=tortoise&size=ONE");
  await page.getByRole("button",{name:"کلاسیک با عینک",exact:true}).click();
  await page.getByTestId("show-look").click();
  await expect(page.getByTestId("model-photo")).not.toHaveAttribute("data-preview-key", "reference");
  const selects = page.locator('select[id^="size-"]:visible');
  for(let i=0;i<await selects.count();i++) {
    const select = selects.nth(i);
    const value = await select.locator('option:not([disabled])[value]:not([value=""])').first().getAttribute('value');
    await select.selectOption(value!);
  }
  await page.screenshot({path:"../.local-tools/screenshots/studio-final.png"});
  await page.getByRole("button",{name:"افزودن استایل به سبد",exact:true}).click();
  await expect.poll(async()=>(await call(page.request,"/cart")).item_count).toBe(5);
  expect(errors).toEqual([]);
});

test("customer cannot enter manage; API-down cart offers retry", async ({page}) => {
  await login(page);
  await page.goto("/manage/staff");
  await expect(page.getByText("حساب شما دسترسی به پنل مدیریت ندارد.")).toBeVisible();
  await call(page.request,"/auth/logout","POST");
  await page.route("**/api/v1/cart", route=>route.abort());
  await page.goto("/bag");
  await expect(page.getByRole("button",{name:/تلاش دوباره/})).toBeVisible();
});
