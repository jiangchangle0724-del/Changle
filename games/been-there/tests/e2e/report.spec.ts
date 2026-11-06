// The finale's report card (战报, ui/ReportCard.tsx): on a phone under the standings, with the awards and
// the dice against the long run, saved as a picture; on the big screen in turn with the standings,
// and nothing runs off the screen.
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, fits, joinWithTeam, newPhone, playUntil, quizOff } from "./phones";

test.afterEach(closeAll);

/** Whether the page fits its window: nothing below or beside it to scroll to. */
const fitsWindow = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollHeight <= innerHeight + 1 && el.scrollWidth <= innerWidth + 1;
  });

test("战报：结局里手机看到奖项和骰子图，能存成图片；大屏和名次轮流放，1366x768 和 1280x720 都不出屏幕", async ({ browser, request }) => {
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
  await tv.page.goto(`/trip/tv/${code}`);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  await playUntil([a, b], async () => (await a.page.locator(".over").count()) > 0 && (await b.page.locator(".over").count()) > 0, 180_000);

  const card = a.page.locator(".over .report");
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.locator("h2")).toHaveText("战报");
  await expect(card.locator(".dice-chart rect.bar")).toHaveCount(11);
  await expect(card.locator(".dice-line")).toContainText("骰子都是服务器随机掷的");
  expect(await card.locator(".awards .award-row").count()).toBeGreaterThanOrEqual(1);
  await fits(a, "结局，战报");

  await card.getByRole("button", { name: "存成图片" }).click();
  const pic = a.page.locator(".sheet img.report-pic");
  await expect(pic).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pic.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1080);
  expect(await pic.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  await expect(a.page.locator(".sheet").getByText("长按图片存到相册")).toBeVisible();

  // The big screen: the standings first, then the report card in their place, beside the winners.
  await expect(tv.page.locator(".over.big")).toBeVisible({ timeout: 10_000 });
  await expect(tv.page.locator(".over.big .report")).toBeVisible({ timeout: 30_000 });
  await expect(tv.page.locator(".over.big .report-slot")).toHaveCount(1);
  await expect(tv.page.locator(".over.big .report .award-row").first()).toBeVisible();
  expect(await fitsWindow(tv.page)).toBe(true);
  await tv.page.setViewportSize({ width: 1280, height: 720 });
  await tv.page.waitForTimeout(400);
  expect(await fitsWindow(tv.page)).toBe(true);
  expect([...a.errors, ...b.errors, ...tv.errors]).toEqual([]);
});
