// The game's music (bgm.ts): fetched only when the game starts, only by the device that plays it (in
// the one-phone demo, that phone, which gets the mono file), and stopped by the menu's switch.
import { devices, expect, test } from "@playwright/test";
import { closeAll, newPhone } from "./phones";

test.afterEach(closeAll);

test("背景音乐：大厅里不下载，开局以后放这台手机的单声道版，菜单里能关", async ({ browser, browserName }) => {
  test.setTimeout(90_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const p = await newPhone(browser, "一台", { ...iphone, locale: "zh-CN" });
  const music: string[] = [];
  p.page.on("request", (r) => /\/trip\/music\//.test(r.url()) && music.push(new URL(r.url()).pathname));
  await p.page.goto("/trip/demo");
  await expect(p.page.getByRole("button", { name: "开始", exact: true })).toBeVisible({ timeout: 15_000 });
  // A tap in the lobby allows sound, but the lobby has no music.
  await p.page.locator("body").click({ position: { x: 5, y: 5 } });
  await p.page.waitForTimeout(1500);
  expect(music, "nothing in the lobby").toEqual([]);

  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => music, { timeout: 15_000 }).toEqual(["/trip/music/theme-mono.mp3"]);
  // (Chromium plays MP3s everywhere; GitHub's WebKit decodes them where its media libraries can)
  if (browserName === "chromium") await expect(p.page.locator("html")).toHaveAttribute("data-bgm", "playing", { timeout: 15_000 });

  // The menu's switch turns it off on this device, and it stays off.
  await p.page.locator(".menu-btn").click();
  const row = p.page.locator("label.radio", { hasText: "背景音乐" });
  await expect(row).toBeVisible();
  await row.locator("input").uncheck();
  await expect(p.page.locator("html")).toHaveAttribute("data-bgm", "off");
  await p.page.keyboard.press("Escape");
  await p.page.waitForTimeout(1000);
  await expect(p.page.locator("html")).toHaveAttribute("data-bgm", "off");
  expect(await p.page.evaluate(() => localStorage.getItem("bt.music"))).toBe("0");
  expect(p.errors).toEqual([]);
});
