// The finale's report card (战报, ui/ReportCard.tsx): on a phone under the standings, with the awards and
// the dice against the long run, saved as a picture (downloaded where the phone can't share; on an
// iPhone that can, one button for the share sheet); on the big screen in turn with the standings, and
// nothing runs off the screen.
import { readFile } from "node:fs/promises";
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, fits, joinWithTeam, newPhone, playUntil, quizOff } from "./phones";

test.afterEach(closeAll);

/** Whether the page fits its window: nothing below or beside it to scroll to. */
const fitsWindow = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollHeight <= innerHeight + 1 && el.scrollWidth <= innerWidth + 1;
  });

/** Once what's coming in has come in: the page as laid out, not a moment of its entrance. */
const settled = (page: Page) =>
  page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => a.playState !== "running" || !Number.isFinite(Number(a.effect?.getComputedTiming().endTime))),
      null,
      { timeout: 5000 },
    )
    .catch(() => {});

/** Whether two things on the page don't overlap. */
const apart = (page: Page, a: string, b: string) =>
  page.evaluate(
    ([a, b]) => {
      const p = document.querySelector(a)!.getBoundingClientRect();
      const q = document.querySelector(b)!.getBoundingClientRect();
      return p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top;
    },
    [a, b],
  );

test("战报：结局里手机看到奖项和骰子图，能存成图片；大屏和名次轮流放，回桌子的按钮在角上，1366x768 和 1280x720 都不出屏幕", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  // (four rounds: every team throws three times or more, so the best average throw is always an award)
  const code = await createRoom(request, { mode: 60, test: { speed: 0.15, testRounds: 4 } });
  const a = await newPhone(browser, "甲", { ...iphone, locale: "zh-CN" });
  const b = await newPhone(browser, "乙", { ...iphone, locale: "zh-CN" });
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await quizOff(a);
  const tv = await newPhone(browser, "大屏", { viewport: { width: 1366, height: 768 }, locale: "zh-CN" });
  // (as from a table at changle.ca: the finale has the way back to it)
  await tv.page.goto(`/trip/tv/${code}?table=ABCD`);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  await playUntil([a, b], async () => (await a.page.locator(".over").count()) > 0 && (await b.page.locator(".over").count()) > 0, 180_000);

  const card = a.page.locator(".over .report");
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.locator("h2")).toHaveText("战报");
  await expect(card.locator(".dice-chart rect.bar")).toHaveCount(11);
  await expect(card.locator(".dice-line")).toContainText("骰子都是服务器随机掷的");
  expect(await card.locator(".awards .award-row").count()).toBeGreaterThanOrEqual(1);
  await fits(a, "结局，战报");

  // Where the phone can't share: the picture, and a download that downloads it (a blob address: a
  // data one downloaded nothing on an iPhone).
  await a.page.evaluate(() => Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }));
  await card.getByRole("button", { name: "存成图片" }).click();
  const sheet = a.page.locator(".sheet");
  const pic = sheet.locator("img.report-pic");
  await expect(pic).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pic.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1080);
  expect(await pic.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  await expect(sheet.getByText("长按图片存到相册")).toBeVisible();
  const link = sheet.getByRole("link", { name: "下载图片" });
  expect(await link.getAttribute("href")).toMatch(/^blob:/);
  const [download] = await Promise.all([a.page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("trip-report.png");
  // (a PNG: its first eight bytes)
  expect((await readFile(await download.path())).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await sheet.getByRole("button", { name: "关上" }).click();

  // An iPhone that can share: one button, the share sheet (whose 存储图像 puts it in Photos), no download.
  await a.page.evaluate(() => {
    const w = window as unknown as { shared?: string[] };
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async (d: ShareData) => void (w.shared = (d.files ?? []).map((f) => `${f.name} ${f.type}`)),
      configurable: true,
    });
  });
  await card.getByRole("button", { name: "存成图片" }).click();
  await expect(sheet.getByText("存储图像")).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByRole("link", { name: "下载图片" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "存到相册或分享" }).click();
  await expect.poll(() => a.page.evaluate(() => (window as unknown as { shared?: string[] }).shared)).toEqual(["trip-report.png image/png"]);
  await sheet.getByRole("button", { name: "关上" }).click();

  // The big screen: the standings first, then the report card in their place, beside the winners; the
  // way back to the table in the corner, clear of the exit stamp.
  await expect(tv.page.locator(".over.big")).toBeVisible({ timeout: 10_000 });
  await expect(tv.page.locator(".over.big .over-again .btn")).toBeVisible({ timeout: 10_000 });
  await settled(tv.page);
  expect(await apart(tv.page, ".over.big .over-again", ".over.big .exit-stamp")).toBe(true);
  expect(await fitsWindow(tv.page)).toBe(true);
  await expect(tv.page.locator(".over.big .report")).toBeVisible({ timeout: 30_000 });
  await expect(tv.page.locator(".over.big .report-slot")).toHaveCount(1);
  await expect(tv.page.locator(".over.big .report .award-row").first()).toBeVisible();
  await settled(tv.page);
  expect(await fitsWindow(tv.page)).toBe(true);
  await tv.page.setViewportSize({ width: 1280, height: 720 });
  await tv.page.waitForTimeout(400);
  expect(await fitsWindow(tv.page)).toBe(true);
  expect(await apart(tv.page, ".over.big .over-again", ".over.big .exit-stamp")).toBe(true);
  expect([...a.errors, ...b.errors, ...tv.errors]).toEqual([]);
});
