// Phones and a big screen in browsers, against the real server running locally (wrangler dev).
// Locally: Chromium. On GitHub (CI=1): Chromium and WebKit (the engine in iPhone Safari and WeChat on iOS).
// E2E_PORT picks the server's port (default 8787); PW_CHROMIUM points at a Chromium already on the machine.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8787);
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...iphone, locale: "zh-CN", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} } },
    ...(process.env.CI ? [{ name: "webkit", use: { browserName: "webkit" as const } }] : [])
  ],
  webServer: {
    command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1 --var ALLOW_TEST_SETTINGS:1 --var STANDALONE:1`,
    url: `http://127.0.0.1:${PORT}/hide/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" }
  }
});
