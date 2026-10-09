import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8088",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off", // Auth flows contain local credentials and MFA codes.
    launchOptions: { channel: "chrome" },
  },
});
