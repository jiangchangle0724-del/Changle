// What every browser test here starts from: a phone, a gathering, someone who has joined it. Each
// phone is its own browser context, so each has its own storage, like a real phone.
import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { dayLabel, type Day } from "../../src/engine";

/** The header a phone sends its key in. */
export const KEY = "x-when-key";

/** A new phone. `options` changes what kind (its size, what it says it is); the rest is in playwright.config.ts. */
export async function phone(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

/**
 * Make a gathering on the home page and close its "it's ready" sheet; ends on the gathering's page.
 * With `days`, asks about just those (any within eight weeks) instead of the next two weeks.
 */
export async function make(page: Page, title: string, days?: Day[]): Promise<{ url: string; code: string; adminCode: string }> {
  await page.goto("/when/");
  if (days) {
    const more = page.locator(".row-between .link-btn");
    while ((await more.count()) > 0) await more.click();
    const picked = page.locator('.cal-day[aria-pressed="true"]');
    while ((await picked.count()) > 0) await picked.first().click();
    for (const day of days) await page.locator(`.cal-day[aria-label="${dayLabel(day, "zh")}"]`).click();
  }
  await page.fill('input[name="title"]', title);
  await page.click('button[type="submit"]');
  await expect(page.locator(".admin-code")).toBeVisible();
  const adminCode = (await page.locator(".admin-code").innerText()).trim();
  expect(adminCode).toMatch(/^\d{6}$/);
  const url = page.url();
  const code = url.split("/").pop()!;
  expect(code).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
  await page.click(".sheet-foot .btn");
  await expect(page.locator(".sheet")).toHaveCount(0);
  return { url, code, adminCode };
}

/** Open a gathering and give a name; ends on its grid, ready to fill in. */
export async function join(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.fill(".name-form input", name);
  await page.click(".name-form .btn");
  await expect(page.locator(".you")).toContainText(name);
}

/**
 * Keep what this page copies where the test can read it. (Reading the real clipboard needs a
 * permission only Chromium can grant.) Call it before the page opens anything.
 */
export const catchCopies = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void ((window as unknown as { copied: string }).copied = text) } });
  });
export const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);

/** The phones in these tests say they are iPhones (playwright.config.ts). Two that don't: */
export const WECHAT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003200) NetType/WIFI Language/zh_CN";
export const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
export const calendarFile = (code: string) => `/when/api/e/${code}/calendar.ics`;

/** The page has saved this phone's answers. */
export const saved = (page: Page) => expect(page.locator(".status")).toHaveAttribute("data-state", "saved");
/** The n-th slot of the grid, counting along each day and then down the days. */
export const cell = (page: Page, n: number) => page.locator(".grid .cell").nth(n);

/** Close the contexts made with phone(), including when a check failed. */
export const closePhones = (browser: Browser) => Promise.all(browser.contexts().map((context) => context.close()));

/** Read the whole visible result at once, so a convergence check has one deadline per phone. */
export const everyone = (page: Page) => page.evaluate(() => ({
  counts: [...document.querySelectorAll(".grid-all .cell")].map((el) => ({
    yes: el.querySelector("b")?.textContent ?? "",
    maybe: el.querySelector("small")?.textContent ?? "",
  })),
  best: [...document.querySelectorAll(".best-what")].map((el) => ({
    slot: el.querySelector("b")?.textContent ?? "",
    reason: el.querySelector("span")?.textContent ?? "",
  })),
}));
