import { expect, test, type WebSocketRoute } from "@playwright/test";
import { cell, closePhones, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => { await closePhones(browser); });

test("a returning guest sees two new answers within fifteen seconds without reloading", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "断网再回来");
  const [away, other] = await Promise.all([phone(browser), phone(browser)]);
  // WebKit's offline emulation leaves established sockets alive. Drop both transports so this
  // really is a lost connection there too, then let the page's own retry reconnect it.
  let offline = false;
  const sockets: WebSocketRoute[] = [];
  await away.routeWebSocket(/.*/, async (socket) => {
    if (offline) return socket.close();
    sockets.push(socket, socket.connectToServer());
  });
  await Promise.all([join(away, url, "甲"), join(other, url, "乙")]);
  await Promise.all([saved(away), saved(other)]);
  await away.click(".seg button:nth-child(2)");
  // A document sentinel also rules out a reload hidden behind the connection recovery.
  await away.evaluate(() => { (window as unknown as { sameDocument: boolean }).sameDocument = true; });
  offline = true;
  await away.context().setOffline(true);
  await Promise.all(sockets.map((socket) => socket.close()));
  try {
    await cell(other, 3).click();
    await cell(other, 5).click();
    await saved(other);
    expect(await cell(away, 3).locator("b").allTextContents(), "the disconnected guest has not received the new answers").toEqual([]);
  } finally {
    offline = false;
    await away.context().setOffline(false);
  }
  await expect.poll(async () => [await cell(away, 3).locator("b").allTextContents(), await cell(away, 5).locator("b").allTextContents()], { timeout: 15_000 }).toEqual([["1"], ["1"]]);
  expect(await away.evaluate(() => (window as unknown as { sameDocument: boolean }).sameDocument)).toBe(true);
});

test("an offline tap stays visible, reports failure, then saves itself on reconnect", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "离线也不丢");
  const guest = await phone(browser);
  await join(guest, url, "甲");
  await saved(guest);
  await guest.context().setOffline(true);
  try {
    await cell(guest, 4).click();
    await expect(guest.locator(".status")).toHaveAttribute("data-state", "failed");
    await expect(guest.locator(".status")).toHaveText("没存上，会自动再试");
    await expect(cell(guest, 4)).toHaveAttribute("data-mine", "yes");
    await host.click(".seg button:nth-child(2)");
    await expect(cell(host, 4).locator("b")).toHaveCount(0);
  } finally {
    await guest.context().setOffline(false);
  }
  await saved(guest);
  await expect(cell(guest, 4)).toHaveAttribute("data-mine", "yes");
  await expect(cell(host, 4).locator("b")).toHaveText("1");
  await guest.reload();
  await expect(guest.locator(".you")).toContainText("甲");
  await guest.click(".seg button:nth-child(1)");
  await expect(cell(guest, 4)).toHaveAttribute("data-mine", "yes");
});

test("with every WebSocket closed, the ten-second refresh still updates the page", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "实时通道被挡住");
  const blocked = await phone(browser);
  let sockets = 0;
  await blocked.routeWebSocket(/.*/, (socket) => { sockets++; socket.close(); });
  await join(blocked, url, "甲");
  await saved(blocked);
  await blocked.click(".seg button:nth-child(2)");
  await expect.poll(() => sockets).toBeGreaterThan(0);
  const other = await phone(browser);
  await join(other, url, "乙");
  await saved(other);
  await cell(other, 1).click();
  await cell(other, 2).click();
  await saved(other);
  // Observe an actual later HTTP refresh, not merely a coincidental initial fetch.
  const refreshed = blocked.waitForResponse((res) => new URL(res.url()).pathname === `/when/api/e/${code}` && res.request().method() === "GET" && res.ok(), { timeout: 15_000 });
  await refreshed;
  await expect.poll(async () => [await cell(blocked, 1).locator("b").allTextContents(), await cell(blocked, 2).locator("b").allTextContents()], { timeout: 15_000 }).toEqual([["1"], ["1"]]);
});
