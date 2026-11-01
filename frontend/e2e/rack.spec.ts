import { expect, test } from "@playwright/test";

test("homepage opens the rack; browsing and size-specific purchase use the store cart",async({page})=>{
  await page.goto("/");
  const promo=page.getByTestId("rack-discovery");
  await expect(promo).toHaveCSS("display","grid");
  await promo.getByRole("link",{name:"ورود به رگال",exact:true}).click();
  await expect(page).toHaveURL(/\/rack$/);
  await expect(page.getByTestId("rack-room")).toHaveClass(/is-ready/);
  const first=await page.getByTestId("rack-selected-name").innerText();
  await page.getByTestId("rack-next").click();
  await expect(page.getByTestId("rack-selected-name")).not.toHaveText(first);
  await page.getByTestId("rack-previous").click();
  await expect(page.getByTestId("rack-selected-name")).toHaveText(first);
  await page.getByTestId("rack-view-product").click();
  await expect(page.getByTestId("rack-product")).toBeVisible();
  await expect(page.getByTestId("rack-add-to-cart")).toBeDisabled();
  const size=page.locator('[data-testid^="rack-size-"]:enabled').first();
  await size.click();
  const response=page.waitForResponse(r=>r.url().endsWith("/api/v1/cart/items")&&r.request().method()==="POST");
  await page.getByTestId("rack-add-to-cart").click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByTestId("rack-add-to-cart")).toHaveText(/به سبدت اضافه شد/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rack-view-product")).toBeFocused();
  await page.getByTestId("rack-open-cart").click();
  await expect(page.getByRole("dialog")).toContainText(first);
});

test("rack remains usable on mobile with reduced motion",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/rack");
  await expect(page.getByTestId("rack-room")).toHaveClass(/is-ready/);
  await page.getByTestId("rack-view-product").click();
  await expect(page.getByTestId("rack-add-to-cart")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rack-view-product")).toBeFocused();
  await page.setViewportSize({width:844,height:390});
  const bounds=await page.getByTestId("rack-view-product").boundingBox();
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(390);
});

test("pointer drag, wheel and garment picking navigate the 3D rack",async({page})=>{
  await page.goto("/rack");
  await expect(page.getByTestId("rack-room")).toHaveClass(/is-ready/);
  const name=page.getByTestId("rack-selected-name");
  const canvas=page.locator('[data-testid="rack-room"] .rack-canvas');
  await page.mouse.move(720,430);await page.mouse.down();
  await page.mouse.move(750,510,{steps:15});
  await expect.poll(async()=>Number(await canvas.getAttribute("data-pull"))).toBeGreaterThan(.04);
  await expect(canvas).toHaveAttribute("data-grabbed",/\d/);
  await page.mouse.up();
  await expect.poll(async()=>Number(await canvas.getAttribute("data-pull"))).toBeLessThan(.01);
  const before=await name.innerText();
  await page.mouse.move(600,400);
  await page.mouse.down();
  await page.mouse.move(900,400,{steps:20});
  await page.mouse.up();
  await expect(name).not.toHaveText(before);
  const after=await name.innerText();
  await page.mouse.wheel(0,300);
  await expect(name).not.toHaveText(after);
  await page.waitForTimeout(2500);
  await page.mouse.click(720,400);
  await expect(page.getByTestId("rack-product")).toBeVisible();
});

test("asset failure preserves browsing and purchase controls",async({page})=>{
  await page.route("**/rack/*.json",route=>route.abort());
  await page.goto("/rack");
  await expect(page.getByText("نمای تصویری فعال است؛ نمایش سه‌بعدی در این مرورگر در دسترس نیست.")).toBeVisible();
  await page.getByTestId("rack-next").click();
  await page.getByTestId("rack-view-product").click();
  await expect(page.getByTestId("rack-product")).toBeVisible();
  await expect(page.locator('[data-testid^="rack-size-"]:enabled').first()).toBeVisible();
});
