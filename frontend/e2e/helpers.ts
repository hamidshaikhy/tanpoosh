import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";

export const credentials = JSON.parse(readFileSync("../backend/.local-credentials/e2e.json", "utf8"));
export const address = { recipient_name: "خریدار آزمایش", phone: "09121234567", province: "تهران", city: "تهران", postal_code: "1435916471", line: "خیابان ولیعصر، کوچه نمونه، پلاک ۱۲", plaque: "12", unit: "3" };

// Test runner only. Production MFA uses pyotp and encrypted secrets.
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

export async function call(request: APIRequestContext, path: string, method = "GET", data?: unknown) {
  const csrf = method === "GET" ? null : await (await request.get("/api/v1/auth/csrf")).json();
  const response = await request.fetch("/api/v1" + path, { method, data, headers: csrf ? { "X-CSRFToken": csrf.csrf_token, "Idempotency-Key": randomUUID() } : {} });
  expect(response.ok(), `${method} ${path}: HTTP ${response.status()}`).toBeTruthy();
  return response.json();
}

export async function login(page: Page, role = "customer") {
  const c = credentials[role];
  await page.goto(role === "customer" ? "/login" : "/manage/login");
  await page.locator('input[name="identifier"]').fill(c.username);
  await page.locator('input[name="password"]').fill(c.password);
  await page.getByTestId(role === "customer" ? "login-submit" : "manage-login-submit").click();
  if (role !== "customer") {
    await page.getByTestId("mfa-code").fill(totp(c.secret));
    await page.getByRole("button", { name: "تأیید", exact: true }).click();
    await expect(page).toHaveURL(/\/manage$/);
  } else await expect(page).toHaveURL(/\/account$/);
}

export async function makeOrder(request: APIRequestContext, email = "browser.guest@example.com", slug = "tortoise-sunglasses") {
  const product = await call(request, `/catalog/products/${slug}`);
  await call(request, "/cart/items", "POST", { variant_id: product.variants.find((v: {in_stock:boolean}) => v.in_stock).id, quantity: 1 });
  const quote = await call(request, "/checkout/quote", "POST", { email });
  return call(request, "/checkout/orders", "POST", { contact: { name: address.recipient_name, phone: address.phone, email }, address, save_address: true, shipping_method: quote.shipping_method, quote_fingerprint: quote.fingerprint });
}

export async function mailLink(request: APIRequestContext, email: string, kind: "verify-email" | "reset-password") {
  let link = "";
  await expect.poll(async () => {
    const inbox = await (await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for (const mail of inbox.messages || []) {
      if (!mail.To?.some((to: {Address:string}) => to.Address === email)) continue;
      const full = await (await request.get(`http://127.0.0.1:8025/api/v1/message/${mail.ID}`)).json();
      const urls = (full.Text || full.HTML || "").match(/https?:\/\/[^\s<>"']+/g) || [];
      link = urls.find((u: string) => u.includes(kind)) || "";
      if (link) return true;
    }
    return false;
  }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(true);
  return link.replaceAll("&amp;", "&");
}
