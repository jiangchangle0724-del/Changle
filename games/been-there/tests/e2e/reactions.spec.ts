// Reactions (表情, ui/Reactions.tsx): a phone taps its team's character in a mood, and the other phones
// and the big screen show it at once, for a moment.
import { devices, expect, test } from "@playwright/test";
import { closeAll, createRoom, fits, joinWithTeam, newPhone, quizOff } from "./phones";

test.afterEach(closeAll);

test("表情：一部手机点自己的角色发「不会吧！」，另一部手机和大屏马上看到，几秒后消失；大屏没有按钮", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const code = await createRoom(request, { mode: 60, test: { speed: 0.3 } });
  const a = await newPhone(browser, "甲", { ...iphone, locale: "zh-CN" });
  const b = await newPhone(browser, "乙", { ...iphone, locale: "zh-CN" });
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await quizOff(a);
  const tv = await newPhone(browser, "大屏", { viewport: { width: 1366, height: 768 }, locale: "zh-CN" });
  await tv.page.goto(`/trip/tv/${code}`);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of [a, b]) await expect(p.page.locator(".game")).toBeVisible({ timeout: 15_000 });
  await expect(tv.page.locator(".tv-board")).toBeVisible({ timeout: 15_000 });

  await a.page.locator(".react-btn").click();
  await expect(a.page.locator(".react-row .react-opt")).toHaveCount(5);
  await fits(a, "表情一排打开");
  await a.page.getByRole("button", { name: "发表情：不会吧！" }).click();
  await expect(a.page.locator(".react-row")).toHaveCount(0);
  for (const p of [a, b, tv]) await expect(p.page.locator(".reaction", { hasText: "不会吧！" })).toBeVisible({ timeout: 5_000 });
  await expect(tv.page.locator(".reactions.big")).toBeVisible();
  // A moment later it's gone, everywhere.
  for (const p of [a, b, tv]) await expect(p.page.locator(".reaction")).toHaveCount(0, { timeout: 6_000 });
  await expect(tv.page.locator(".react-btn")).toHaveCount(0);
  await expect(b.page.locator(".react-btn")).toBeVisible();
  expect([...a.errors, ...b.errors, ...tv.errors]).toEqual([]);
});
