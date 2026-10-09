import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("mouse drag scrolls products without opening links and a normal click still works", async ({page}) => {
  await page.goto("/");
  const rail = page.getByTestId("everyday-products");
  await rail.scrollIntoViewIfNeeded();
  const image = rail.getByTestId("product-card").first().locator("img").first();
  const bounds = (await image.boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 230, y, {steps:12});
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeLessThan(-150);
  await page.mouse.up();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect.poll(() => rail.evaluate(el => getComputedStyle(el).scrollSnapType)).toBe("x mandatory");

  const moved = await rail.evaluate(el => el.scrollLeft);
  const area = (await rail.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 - 150, y, {steps:12});
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(moved + 75);
  await page.mouse.up();
  await expect(page).toHaveURL(/:\d+\/$/);
  const previous = page.getByRole("button", {name:"محصولات قبلی"});
  if (await previous.isEnabled()) await previous.click();
  await expect.poll(() => rail.evaluate(el => Math.abs(el.scrollLeft))).toBeLessThan(2);
  const link = rail.getByTestId("product-card").first().locator("h3 a");
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(new RegExp(href! + "$"));
});

test("homepage rail, eyewear selector and suggested looks use actual products", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("region", {name:"دسته‌بندی‌ها"}).getByRole("link", {name:"عینک آفتابی"})).toHaveAttribute("href", "/shop?category=sunglasses");
  const rail = page.getByTestId("everyday-products");
  await expect(rail.getByTestId("product-card")).toHaveCount(16);
  await expect(page.getByRole("button", {name:"محصولات قبلی"})).toBeDisabled();
  await page.getByRole("button", {name:"محصولات بعدی"}).click();
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeLessThan(-100);
  await rail.focus();
  const before = await rail.evaluate(el => el.scrollLeft);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeLessThan(before - 100);
  for (let i = 0; i < 7 && await page.getByRole("button", {name:"محصولات بعدی"}).isEnabled(); i++) {
    await page.getByRole("button", {name:"محصولات بعدی"}).click();
    await page.waitForTimeout(450);
  }
  await expect(page.getByRole("button", {name:"محصولات بعدی"})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  const eyewear = page.getByTestId("eyewear-edit");
  await eyewear.getByRole("button", {name:"عینک خلبانی طلایی",exact:true}).click();
  await expect(eyewear.getByRole("heading", {name:"عینک خلبانی طلایی"})).toBeVisible();
  await expect(eyewear.getByRole("link", {name:"مشاهدهٔ جزئیات"})).toHaveAttribute("href", "/products/aviator-sunglasses");
  await expect(eyewear.getByRole("link", {name:"روی مدل ببین"})).toHaveAttribute("href", "/studio?product=aviator-sunglasses");

  const discovery = page.getByTestId("look-discovery");
  await discovery.getByRole("button", {name:/آخر هفته/}).click();
  await expect(discovery.getByRole("button", {name:/آخر هفته/})).toHaveAttribute("aria-pressed", "true");
  await expect(discovery.locator('image[data-slot="top"]')).toHaveAttribute("href", /basic-tee\/ivory-layer.webp/);
  await expect(discovery.getByTestId("outfit-photo-layer")).toHaveCount(3);
  await mkdir("../.local-tools/screenshots/home-refresh", {recursive:true});
  await discovery.screenshot({path:"../.local-tools/screenshots/home-refresh/desktop-weekend.png"});
  await page.screenshot({path:"../.local-tools/screenshots/home-refresh/desktop-full.png", fullPage:true});
  await discovery.getByRole("link", {name:"این استایل را تغییر بده"}).click();
  await expect(page).toHaveURL(/\/studio\?outfit=/);
  await expect(page.getByRole("tab", {name:"رویه",exact:true})).toHaveCount(0);
  await page.getByTestId("show-look").click();
  await expect(page.getByTestId("model-photo")).toHaveAttribute("data-preview-key", /top:basic-tee:ivory/);
  await expect(page.getByTestId("model-photo").getByTestId("outfit-photo-layer")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("homepage keeps the last complete look on image failure and accepts a retry", async ({page}) => {
  await page.goto("/");
  const discovery = page.getByTestId("look-discovery");
  const initial = discovery.getByRole("button", {name:/اولد مانی روزمره/});
  const formal = discovery.getByRole("button", {name:/کلاسیک رسمی/});
  await page.route("**/studio-images/oxford-shirt/sky-layer.webp", route => route.abort());
  await formal.click();
  await expect(discovery.getByRole("status")).toContainText("تصویر بارگیری نشد");
  await expect(initial).toHaveAttribute("aria-pressed", "true");
  await expect(discovery.locator('image[data-slot="top"]')).toHaveAttribute("href", /knit-polo/);
  await page.unroute("**/studio-images/oxford-shirt/sky-layer.webp");
  await formal.click();
  await expect(formal).toHaveAttribute("aria-pressed", "true");
  await expect(discovery.locator('image[data-slot="top"]')).toHaveAttribute("href", /oxford-shirt\/sky-layer.webp/);
});

test("legacy saved drafts and five-piece links cannot restore outerwear", async ({page}) => {
  const legacy = {
    top:{slug:"oxford-shirt",color:"white",size:"M"},
    outerwear:{slug:"navy-blazer",color:"navy",size:"M"},
    bottom:{slug:"tailored-trousers",color:"black",size:"32"},
    shoes:{slug:"derby-shoes",color:"black",size:"42"},
    accessory:{slug:"tortoise-sunglasses",color:"tortoise",size:"ONE"},
  };
  await page.addInitScript(outfit => localStorage.setItem("tp-studio-draft-v2",JSON.stringify(outfit)),legacy);
  const requestedCoats: string[] = [];
  page.on("request", request => {if(/studio-images\/(navy-blazer|bomber-jacket|overshirt|puffer-jacket)\//.test(request.url())) requestedCoats.push(request.url());});
  for (const route of ["/studio", "/studio?outfit="+Object.entries(legacy).map(([slot,item])=>[slot,item.slug,item.color,item.size].join(".")).join("~")]) {
    await page.goto(route);
    await expect(page.getByRole("tab", {name:"رویه",exact:true})).toHaveCount(0);
    await expect(page.locator('select[id^="size-outerwear-"]')).toHaveCount(0);
    await page.getByTestId("show-look").click();
    await expect(page.getByTestId("model-photo").getByTestId("outfit-photo-layer")).toHaveCount(4);
    await expect(page.getByTestId("model-photo").locator('image[data-slot="accessory"]')).toHaveAttribute("href", /tortoise-head-v2.webp/);
  }
  expect(requestedCoats).toEqual([]);
});

test.describe("mobile homepage", () => {
  test.use({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  test("swipes products, changes a look and has no horizontal page overflow", async ({page,context}) => {
    await page.goto("/");
    const rail=page.getByTestId("everyday-products");
    await rail.scrollIntoViewIfNeeded();
    const bounds=(await rail.boundingBox())!;
    const x=bounds.x+60,y=bounds.y+100;
    const session=await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++)await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+i*40,y}]});
    await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>rail.evaluate(el=>el.scrollLeft)).toBeLessThan(-20);
    const discovery=page.getByTestId("look-discovery");
    await discovery.getByRole("button",{name:/کلاسیک رسمی/}).click();
    await expect(discovery.getByRole("button",{name:/کلاسیک رسمی/})).toHaveAttribute("aria-pressed","true");
    await expect(discovery.getByTestId("outfit-photo-layer")).toHaveCount(3);
    await page.getByTestId("eyewear-edit").getByRole("button",{name:"عینک مشکی کلاسیک",exact:true}).click();
    await expect(page.getByTestId("eyewear-edit").getByRole("heading",{name:"عینک مشکی کلاسیک"})).toBeVisible();
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:"../.local-tools/screenshots/home-refresh/mobile-full.png",fullPage:true});
  });
});
