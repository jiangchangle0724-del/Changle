// Shared bits for the browser tests: rooms made through the API, phones and big screens, what a page was told.
import { expect, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RoomView } from "../../src/room/protocol";

/** A room, as the computer's own start page or a changle.ca table would open it. */
export async function newRoom(request: APIRequestContext, body: Record<string, unknown> = {}): Promise<string> {
  const response = await request.post("/hide/api/rooms", { data: body });
  expect(response.ok()).toBeTruthy();
  const { code } = (await response.json()) as { code: string };
  expect(code).toMatch(/^\d{4}$/);
  return code;
}

// (held sideways: the game is played that way; an upright phone is asked to turn)
const PHONE: BrowserContextOptions = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

/**
 * A phone with a name and a language, as the table leaves them for the game (an iPhone, as the
 * project's device says). `iphone`: one that hasn't seen the Home Screen guide yet (every other phone
 * counts as having seen it); `android`: not an iPhone at all.
 */
export async function phone(browser: Browser, name: string, lang: "zh" | "en" = "zh", extra: { cid?: string; size?: { width: number; height: number }; iphone?: boolean; android?: boolean } = {}): Promise<Page> {
  const isWebkit = browser.browserType().name() === "webkit";
  const context = await browser.newContext({
    ...PHONE,
    ...(extra.size ? { viewport: extra.size } : {}),
    ...(isWebkit ? { isMobile: false } : {}),
    ...(extra.iphone ? { userAgent: IPHONE_SAFARI } : extra.android ? { userAgent: ANDROID_CHROME } : {}),
    locale: lang === "zh" ? "zh-CN" : "en-CA"
  });
  await context.addInitScript(
    ([n, l, cid, iphone]) => {
      localStorage.setItem("hc.name", n);
      localStorage.setItem("hc.lang", l);
      if (cid) localStorage.setItem("hc.cid", cid);
      // (only once per page load, so a test can watch the guide stay closed after a reload)
      if (!iphone && !sessionStorage.getItem("hc.test")) localStorage.setItem("hc.homeGuide", "1");
      sessionStorage.setItem("hc.test", "1");
    },
    [name, lang, extra.cid ?? "", extra.iphone ? "1" : ""] as const
  );
  const page = await context.newPage();
  watchErrors(page, name);
  return page;
}

/** A big screen: a TV's browser or a computer. */
export async function screen(browser: Browser, width = 1920, height = 1080, lang: "zh" | "en" = "zh"): Promise<Page> {
  // (a desktop browser: not the phone the project's defaults describe)
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: undefined, locale: lang === "zh" ? "zh-CN" : "en-CA" });
  await context.addInitScript((l) => localStorage.setItem("hc.lang", l), lang);
  const page = await context.newPage();
  watchErrors(page, "tv");
  return page;
}

const errors = new WeakMap<Page, string[]>();
function watchErrors(page: Page, name: string) {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (error) => list.push(`${name}: ${error.message}`));
}
/** Nothing went wrong on these pages. */
export function noErrors(...pages: Page[]) {
  expect(pages.flatMap((page) => errors.get(page) ?? [])).toEqual([]);
}

/** What the server last told this page. */
export const view = (page: Page) => page.evaluate(() => (window as unknown as { __hide?: RoomView }).__hide ?? null);

/** Wait until the page's view passes the check. */
export async function until(page: Page, check: (view: RoomView) => boolean, timeout = 15_000) {
  await expect.poll(async () => {
    const current = await view(page);
    return !!current && check(current);
  }, { timeout }).toBe(true);
}

/** The page never scrolls sideways. */
export async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every button and link on screen is big enough for a thumb (44px). */
export async function bigTargets(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, a.btn, .switch-row, .stick")]
      .filter((el) => el.offsetParent !== null && !el.closest(".sr-only"))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.className || el.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`)
  );
  expect(small).toEqual([]);
}

/** Screenshots go here when SHOTS is set (the PR's pictures), else nowhere. */
export async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}
