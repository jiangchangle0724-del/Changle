// 更多规则 (more rules) in the lobby: the starting cash, auctions, hidden money. The host changes them
// under a fold that says what's changed; the other phones read it while they wait; with the money
// hidden, a phone's standings show its own team's money and a "?" for the others'.
import { devices, expect, test } from "@playwright/test";
import { closeAll, createRoom, fits, joinWithTeam, newPhone, quizOff } from "./phones";

test.afterEach(closeAll);

test("更多规则：房主选 $2,000、不拍卖、藏起钱；别的手机在大厅看到，开局后排名里别队的钱是问号，自己的照常", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const code = await createRoom(request, { mode: 60, test: { speed: 0.3 } });
  const a = await newPhone(browser, "甲", { ...iphone, locale: "zh-CN" });
  const b = await newPhone(browser, "乙", { ...iphone, locale: "zh-CN" });
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await quizOff(a);

  const more = a.page.locator("details.more-rules");
  await more.locator("summary").click();
  await more.getByRole("radio", { name: /\$2,000/ }).check();
  await more.getByRole("checkbox", { name: /^拍卖/ }).uncheck();
  await more.getByRole("checkbox", { name: /藏起各队的钱/ }).check();
  const now = "现在：起始资金 $2,000 · 不拍卖 · 藏起钱";
  await expect(more.locator("summary small")).toHaveText(now);
  await expect(b.page.getByText(now)).toBeVisible();
  await fits(a, "大厅，更多规则打开");

  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of [a, b]) await expect(p.page.locator(".game")).toBeVisible({ timeout: 15_000 });
  for (const p of [a, b]) {
    // Its own cash in the top bar is real: $2,000 and the seat's catch-up.
    await expect(p.page.locator(".top .stat").first()).toContainText("$2,0");
    await expect(p.page.locator(".standings .num")).toHaveCount(2);
    await expect(p.page.locator(".standings .num", { hasText: "?" })).toHaveCount(1);
    await expect(p.page.locator(".standings .num", { hasText: "$" })).toHaveCount(1);
    await expect(p.page.locator(".cash-note")).toHaveText("各队的钱不公开，结束时揭晓");
  }
  expect([...a.errors, ...b.errors]).toEqual([]);
});
