// A city's real photo: a tap on a city of the board opens its sheet, the photo fades in over the
// poster once it has loaded (with what it shows and whose it is), and the switch goes back to the
// poster and forth again. The photos and recordings are served beside the game.
import { expect, test } from "@playwright/test";
import { closeAll, createRoom, joinWithTeam, newPhone } from "./phones";

test.afterEach(closeAll);

test("城市照片：点棋盘上的城市，照片在海报上淡入，可以切回海报", async ({ browser, request, contextOptions }) => {
  for (const f of ["photos/venice.webp", "photos/venice-s.webp", "sounds/venice.mp3"]) {
    const res = await request.get(`/trip/${f}`);
    expect(res.status(), f).toBe(200);
    expect(res.headers()["content-type"], f).toMatch(f.endsWith(".mp3") ? /audio\/mpeg/ : /image\/webp/);
  }
  const code = await createRoom(request, {});
  const p = await newPhone(browser, "看", contextOptions);
  await joinWithTeam(p, code);
  await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
  // (The board is drawn in SVG; a tap on a square opens its sheet.)
  await p.page.locator("g.sp.k-city").first().dispatchEvent("click");
  const sheet = p.page.locator(".sheet");
  const frame = sheet.locator(".sheet-poster");
  await expect(frame).toHaveClass(/photo-on/, { timeout: 10_000 });
  expect(await sheet.locator("img.photo").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(sheet.locator(".photo-credit")).toContainText(/照片：.+ · CC/);
  await sheet.getByRole("button", { name: "海报", exact: true }).click();
  await expect(frame).not.toHaveClass(/photo-on/);
  await expect(sheet.locator(".photo-credit")).toHaveCount(0);
  await sheet.getByRole("button", { name: "照片", exact: true }).click();
  await expect(frame).toHaveClass(/photo-on/);
  expect(p.errors).toEqual([]);
});
