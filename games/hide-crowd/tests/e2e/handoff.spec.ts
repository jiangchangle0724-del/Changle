// From a changle.ca table: the site opens the room with the table's host, code and own penalty, and
// sends each phone in with its name; the way back tells the table the game is over. (The table side
// is the site's: site/src/party/hide/link.ts. Here the table's pages are stand-ins.)
import { expect, test } from "@playwright/test";
import { newRoom, noErrors, phone, screen, until } from "./helpers";

const HOST_ID = "0123456789abcdef01234567";

test("a game opened from a table keeps the table's host, code and penalty, and goes back to the table at the end", async ({ browser, request }) => {
  // what the host's phone sends from the table (site/src/party/hide/link.ts, openHide)
  const code = await newRoom(request, { host: HOST_ID, table: "ABCD", penalty: "10 个深蹲", test: { duel: true, roundMs: 6_000 } });
  // a guest arrives first: the table's host is kept for them
  const mia = await phone(browser, "Mia");
  await mia.goto(`/hide/r/${code}?table=ABCD&flat=1`);
  await expect(mia.locator(".lobby-code")).toContainText("ABCD");
  await expect(mia.getByText("等主人开始")).toBeVisible();
  const steve = await phone(browser, "Steve", "zh", { cid: HOST_ID });
  await steve.goto(`/hide/r/${code}?table=ABCD&flat=1`);
  await expect(steve.getByRole("button", { name: "开始" })).toBeVisible();
  await expect(steve.locator(".chips")).toContainText("Mia");
  // the table's own penalty, and no line says drink
  await expect(steve.locator(".lobby")).toContainText("10 个深蹲");
  expect(await steve.locator("main").innerText()).not.toMatch(/喝/);
  const tv = await screen(browser);
  await tv.goto(`/hide/tv/${code}?table=ABCD&flat=1`);
  await expect(tv.locator(".tv-code")).toHaveText("ABCD");
  expect(await tv.locator(".qr").getAttribute("aria-label")).toMatch(/\/t\/ABCD$/);

  // a round, so the penalty is the table's own
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing");
  await steve.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  await until(steve, (v) => v.phase === "over", 20_000);
  await expect(steve.locator("dialog.stamp .stamp-seal")).toHaveText("10 个深蹲");
  await expect(steve.locator("dialog.stamp .stamp-glass")).toHaveCount(0);
  expect(await steve.locator("dialog.stamp").innerText()).not.toMatch(/喝/);
  await steve.getByRole("button", { name: "继续" }).click();

  // the table's pages, as stand-ins that remember what the game left them
  for (const page of [steve, mia, tv])
    await page.route(/\/(t|tv)\/ABCD$/, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>table</title><p>table</p>" }));
  // the host takes everyone back: a question first
  await steve.getByRole("button", { name: "回到这桌" }).first().click();
  await expect(steve.getByRole("dialog", { name: "大家一起回到这桌？" })).toBeVisible();
  await steve.getByRole("button", { name: "一起回去" }).click();
  await steve.waitForURL(/\/t\/ABCD$/);
  expect(await steve.evaluate(() => sessionStorage.getItem("hide.over"))).toBe(code);
  // every other page follows by itself
  await mia.waitForURL(/\/t\/ABCD$/, { timeout: 15_000 });
  expect(await mia.evaluate(() => sessionStorage.getItem("hide.over"))).toBe(code);
  await tv.waitForURL(/\/tv\/ABCD$/, { timeout: 15_000 });
  expect(await tv.evaluate(() => sessionStorage.getItem("hide.over.tv"))).toBe(code);
  // and the room tells the table it's over
  const info = await (await request.get(`/hide/api/rooms/${code}`)).json();
  expect(info.phase).toBe("over");
  noErrors(steve, mia, tv);
});

test("a guest's back button just goes back to the table; the game stays on", async ({ browser, request }) => {
  const code = await newRoom(request, { table: "WXYZ" });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia");
  await steve.goto(`/hide/r/${code}?table=WXYZ&flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?table=WXYZ&flat=1`);
  await expect(mia.locator(".chips")).toContainText("Steve");
  await mia.route(/\/t\/WXYZ$/, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>table</p>" }));
  await mia.getByRole("button", { name: "回到这桌" }).click();
  await mia.waitForURL(/\/t\/WXYZ$/);
  expect(await mia.evaluate(() => sessionStorage.getItem("hide.over"))).toBeNull();
  const info = await (await request.get(`/hide/api/rooms/${code}`)).json();
  expect(info.phase).toBe("lobby");
  await until(steve, (v) => v.players.length === 1);
  noErrors(steve, mia);
});
