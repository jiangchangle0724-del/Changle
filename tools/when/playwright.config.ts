// Phone-in-a-browser tests against the real server running on this computer (wrangler dev). The
// tool sits under /when, as on changle.ca, so the tests open http://127.0.0.1:8790/when/….
// Locally: Chromium (or this computer's own Chrome with PW_CHROME=1, when Playwright's browsers
// aren't downloaded). On GitHub (CI=1): Chromium and WebKit, the engine inside iPhone Safari and
// WeChat on iOS.
import { defineConfig, devices } from "@playwright/test";

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:8790", ...iphone, locale: "zh-CN", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", ...(process.env.PW_CHROME ? { channel: "chrome" } : {}) } },
    ...(process.env.CI ? [{ name: "webkit", use: { browserName: "webkit" as const } }] : []),
  ],
  webServer: {
    command: "npx wrangler dev --port 8790 --ip 127.0.0.1 --var ALLOW_TEST_SETTINGS:1",
    url: "http://127.0.0.1:8790/when/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
