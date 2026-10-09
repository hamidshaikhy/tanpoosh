import { chromium } from "@playwright/test";
import fs from "node:fs";

fs.mkdirSync("../.local-tools/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push({ width, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") errors.push({ width, message: m.text().slice(0, 400) }); });
  for (const route of ["/", "/studio", "/shop", "/products/oxford-shirt", "/manage/login"]) {
    const response = await page.goto("http://localhost:8088" + route, { waitUntil: "networkidle", timeout: 90000 });
    if (response.status() !== 200 || !(await page.locator("h1").count())) {
      console.log((await page.locator("body").innerText()).slice(0, 1000));
      await page.screenshot({ path: "../.local-tools/screenshots/page-failed.png" });
      await browser.close();
      throw new Error(`Page failed: ${route} HTTP ${response.status()}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const name = route === "/" ? "home" : route.replaceAll("/", "-").slice(1);
    await page.screenshot({ path: `../.local-tools/screenshots/${name}-${width}.png`, fullPage: true });
    console.log(JSON.stringify({ width, route, overflow, h1: await page.locator("h1").allTextContents() }));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync("../logs/browser-errors.json", JSON.stringify(errors, null, 2));
console.log("Browser errors:", JSON.stringify(errors));
