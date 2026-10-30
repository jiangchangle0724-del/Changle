// Phone-in-a-browser tests against the real server running locally (wrangler dev), with Google
// sign-in switched on (test secrets) and demo restaurants (no Places key). The app sits under /eat,
// as on changle.ca, so the tests open http://127.0.0.1:8788/eat/….
// Locally: chromium. On GitHub (CI=1): chromium and webkit (the engine inside iPhone Safari and WeChat on iOS).
import { defineConfig, devices } from "@playwright/test";

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:8788", ...iphone, locale: "zh-CN", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    ...(process.env.CI ? [{ name: "webkit", use: { browserName: "webkit" as const } }] : []),
  ],
  webServer: {
    command:
      "npx wrangler dev --port 8788 --ip 127.0.0.1 --var ALLOW_TEST_SETTINGS:1 --var SESSION_SECRET:test-secret --var GOOGLE_CLIENT_ID:test --var GOOGLE_CLIENT_SECRET:test",
    url: "http://127.0.0.1:8788/eat/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
