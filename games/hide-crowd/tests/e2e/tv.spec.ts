// The big screen: a real TV layout at 1920 x 1080 and 1280 x 720, and nobody marked as a player.
import { expect, test, type Page } from "@playwright/test";
import { newRoom, noErrors, phone, screen, shot, until, view } from "./helpers";

/** Everything on the stage stays on the screen. */
async function fits(page: Page) {
  const out = await page.evaluate(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return [...document.querySelectorAll<HTMLElement>(".tv-stage *")]
      .filter((el) => el.offsetParent !== null && !el.closest(".tv-over") && el.getBoundingClientRect().width > 0)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1)
      .map(({ el, r }) => `${el.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}`);
  });
  expect(out).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
}

test("the big screen shows the whole crowd, fits a 1080p and a 720p TV, and never marks who is a player", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 30_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia");
  const tv = await screen(browser, 1920, 1080);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  // (the big screen draws in 3D here, where the browser can; the phones are flat to keep the test light)
  await tv.goto(`/hide/tv/${code}`);
  await expect(tv.locator(".tv-lobby .chips")).toContainText("Mia");
  await expect(tv.locator(".qr")).toBeVisible();
  await fits(tv);
  await shot(tv, "tv-lobby-1920");
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.waitForTimeout(400);
  await fits(tv);
  await shot(tv, "tv-lobby-1280");

  await steve.getByRole("button", { name: "开始" }).click();
  await until(tv, (v) => v.phase === "playing");
  await expect(tv.locator(".tv-hud .scores .score")).toHaveCount(2);
  await expect(tv.locator(".arena__canvas, .flat-arena").first()).toBeVisible();
  // the players move, so the frames have something to give away if they could
  await steve.locator(".stick").hover();
  for (let i = 0; i < 10; i++) {
    const v = (await view(tv))!;
    expect(v.you.role).toBe("screen");
    expect(v.game!.me).toBeNull();
    expect(v.game!.avatars.length).toBe(20);
    expect(v.game!.avatars.filter((a) => a.me)).toEqual([]);
    expect(v.players.some((p) => p.you)).toBe(false);
    const text = JSON.stringify(v);
    for (const secret of ["ownerId", '"kind":"player"', '"kind":"npc"', "human-", "npc-", "maxSpeed"]) expect(text).not.toContain(secret);
    await tv.waitForTimeout(150);
  }
  // nothing on the big screen's page marks a body: no "you" in the flat arena either
  await expect(tv.locator(".flat-avatar.is-me, .flat-avatar__you")).toHaveCount(0);
  await tv.waitForTimeout(1_500);
  await fits(tv);
  await shot(tv, "tv-round-1280");
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.waitForTimeout(800);
  await fits(tv);
  await shot(tv, "tv-round-1920");
  // each phone sees its own body, and only its own
  const s = (await view(steve))!;
  const m = (await view(mia))!;
  expect(s.game!.avatars.filter((a) => a.me).length).toBe(1);
  expect(m.game!.avatars.filter((a) => a.me).length).toBe(1);
  expect(s.game!.avatars.findIndex((a) => a.me)).not.toBe(m.game!.avatars.findIndex((a) => a.me));
  noErrors(steve, mia, tv);
});
