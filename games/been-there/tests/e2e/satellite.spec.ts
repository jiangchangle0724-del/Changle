// The real world in the middle of the board (issue #44, part 1): until NASA's pictures are in, the board
// draws its old map (and keeps it if they can't load), so the first paint never waits for them; then
// the satellite map, day and night where the sun says at a fixed moment; flights along great circles
// with the team's own token flying them, once its token is down; the big screen's globe wearing the
// same pictures; and the credits naming NASA.
import { devices, expect, test, type Page, type Route } from "@playwright/test";
import { COORDS } from "../../src/client/art/coords";
import { closeAll, createRoom, joinWithTeam, newPhone, quizOff, tap, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

const { defaultBrowserType: _i, ...iphone } = devices["iPhone 13"];
const NOON_UTC = Date.UTC(2026, 10, 3, 12);
const EVENING_UTC = Date.UTC(2026, 10, 3, 20);

async function startWithComputers(p: Phone, code: string, computers = 1) {
  await joinWithTeam(p, code);
  for (let i = 0; i < computers; i++) await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await quizOff(p);
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
}

/** How opaque the drawn map is (1 while it stands in for the pictures, 0 once they're painted). */
const drawnMap = (page: Page) => page.locator(".stage .roundboard .routemap .base").evaluate((g) => Number(getComputedStyle(g).opacity));

test("卫星地图：图片到之前先画原来的地图，到了换成真实的世界；图片拿不到就一直是画的地图", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const code = await createRoom(request, {});
  // This phone's pictures are held back until the test lets them through.
  const held: Route[] = [];
  const p = await newPhone(browser, "等", { ...iphone, locale: "zh-CN" });
  await p.ctx.route("**/trip/map/*.webp", (route) => void held.push(route));
  await startWithComputers(p, code);
  // The board is drawn at once, with the drawn map in the middle.
  await expect(p.page.locator(".stage .roundboard")).toBeVisible();
  await expect.poll(() => held.length, { message: "the pictures are asked for once the board is up" }).toBe(2);
  await p.page.waitForTimeout(1500);
  await expect(p.page.locator(".stage .roundboard.sat-on")).toHaveCount(0);
  expect(await drawnMap(p.page)).toBe(1);
  // A tap on a city still opens it while the world is on its way.
  await p.page.locator(".stage g.sp.k-city").first().dispatchEvent("click");
  await expect(p.page.locator(".sheet-bg:not([hidden]) .citycard")).toBeVisible();
  await p.page.keyboard.press("Escape");
  // Let them through: the satellite map is painted, and the drawn map fades away over it.
  for (const r of held.splice(0)) await r.continue();
  await expect(p.page.locator(".stage .roundboard.sat-on")).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => drawnMap(p.page), { timeout: 5_000 }).toBe(0);
  expect(await p.page.locator(".stage canvas.satmap").evaluate((c: HTMLCanvasElement) => c.width)).toBe(1024);

  // Another phone whose pictures never come (offline): the drawn map stays, and nothing breaks.
  const q = await newPhone(browser, "断", { ...iphone, locale: "zh-CN" });
  await q.ctx.route("**/trip/map/*.webp", (route) => route.abort());
  await q.page.goto(`/trip/r/${code}`);
  await expect(q.page.locator(".stage .roundboard")).toBeVisible({ timeout: 20_000 });
  await q.page.waitForTimeout(4000);
  await expect(q.page.locator(".stage .roundboard.sat-on")).toHaveCount(0);
  expect(await drawnMap(q.page)).toBe(1);
  expect([...p.errors, ...q.errors]).toEqual([]);
});

/**
 * Where each city's pixel on the painted map comes from: the day picture or the night one (whichever it's
 * closer to, over a few pixels round it, a little off the city's own lights).
 */
async function dayOrNight(page: Page, ids: string[]): Promise<Record<string, "day" | "night">> {
  return page.evaluate(
    async ({ ids, coords }) => {
      const map = document.querySelector<HTMLCanvasElement>(".stage canvas.satmap")!;
      const n = map.width;
      const load = (url: string) =>
        new Promise<HTMLImageElement>((ok, no) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = no;
          img.src = url;
        });
      const pixels = async (url: string) => {
        const c = document.createElement("canvas");
        c.width = c.height = n;
        const g = c.getContext("2d")!;
        g.drawImage(await load(url), 0, 0, n, n);
        return g.getImageData(0, 0, n, n).data;
      };
      const day = await pixels(`/trip/map/day-${n}.webp`);
      const night = await pixels(`/trip/map/night-${n}.webp`);
      const shown = map.getContext("2d")!.getImageData(0, 0, n, n).data;
      const out: Record<string, "day" | "night"> = {};
      for (const id of ids) {
        const [lat, lon] = coords[id];
        // (art/geo.ts polar(): lon 0 down, east anticlockwise, the edge at 58 S)
        const d = ((90 - lat) / 148) * (n / 2);
        const cx = n / 2 + d * Math.sin((lon * Math.PI) / 180);
        const cy = n / 2 + d * Math.cos((lon * Math.PI) / 180);
        let toDay = 0;
        let toNight = 0;
        for (let dy = -10; dy <= 10; dy += 2)
          for (let dx = -10; dx <= 10; dx += 2) {
            const k = (Math.round(cy + dy) * n + Math.round(cx + dx)) * 4;
            for (let c = 0; c < 3; c++) {
              toDay += Math.abs(shown[k + c] - day[k + c]);
              toNight += Math.abs(shown[k + c] - night[k + c]);
            }
          }
        out[id] = toDay < toNight ? "day" : "night";
      }
      return out;
    },
    { ids, coords: COORDS },
  );
}

test("白天黑夜按真实的太阳：时钟固定在 UTC 12:00 和 20:00，每座城市在该在的那一边", async ({ browser, request }) => {
  test.setTimeout(90_000);
  for (const [at, day, night] of [
    [NOON_UTC, ["london", "paris", "cairo", "capetown", "dubai"], ["tokyo", "seoul", "sydney", "vancouver", "lasvegas"]],
    [EVENING_UTC, ["vancouver", "newyork", "mexicocity", "rio"], ["london", "tokyo", "beijing", "mumbai"]],
  ] as const) {
    const code = await createRoom(request, {});
    const p = await newPhone(browser, "看", { ...iphone, locale: "zh-CN" });
    await p.ctx.addInitScript(`window.__sunAt = ${at};`);
    await startWithComputers(p, code);
    await expect(p.page.locator(".stage .roundboard.sat-on")).toHaveCount(1, { timeout: 15_000 });
    const when = new Date(at).toISOString();
    expect(await p.page.locator(".stage canvas.satmap").getAttribute("data-at"), "painted for the fixed moment").toBe(String(at));
    const seen = await dayOrNight(p.page, [...day, ...night]);
    for (const id of day) expect(seen[id], `${id} at ${when}`).toBe("day");
    for (const id of night) expect(seen[id], `${id} at ${when}`).toBe("night");
    // The cities glow after dark (the board's lamps agree with the picture).
    for (const id of night) await expect(p.page.locator(`.stage .routemap g.city[data-city="${id}"]`)).toHaveAttribute("data-night", "1");
    for (const id of day) await expect(p.page.locator(`.stage .routemap g.city[data-city="${id}"] .lamp`)).toHaveCount(0);
    expect(p.errors).toEqual([]);
    await p.ctx.close();
  }
});

/** A point of the board's map (radius 320, as drawn) back to latitude and longitude. */
const unproject = (x: number, y: number): [number, number] => [90 - (Math.hypot(x, y) / 320) * 148, (Math.atan2(x, y) * 180) / Math.PI];
const unit = ([lat, lon]: [number, number]) => {
  const r = Math.PI / 180;
  return [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)];
};

test("飞行：从上一座城市沿大圆航线飞到这一座，这一队自己的棋子沿着飞；棋子落地盖章以后才起飞；大屏的地球也是真实的世界", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  const code = await createRoom(request, {});
  // A big screen too (its globe, where this browser has WebGL), and a laptop playing along with computer teams.
  const tvCtx = await browser.newContext({ ...contextOptions, viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  track(tvCtx);
  const tv: Phone = { name: "大屏", ctx: tvCtx, page: await tvCtx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/trip/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  const p = await newPhone(browser, "飞", { ...contextOptions, viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await startWithComputers(p, code, 3);
  // Note every flight on the laptop's map as it comes: hidden until its take-off, then flown.
  await p.page.evaluate(() => {
    const w = window as unknown as { flights: { from: string; to: string; hiddenFirst: boolean; added: number; flew?: number; moves: string[]; landed?: number; d: string }[] };
    w.flights = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll<SVGGElement>(".stage .flight.fly")) {
        let f = w.flights.find((x) => (x as unknown as { el: Element }).el === el);
        if (!f) {
          f = { from: el.dataset.from!, to: el.dataset.to!, hiddenFirst: getComputedStyle(el).visibility === "hidden", added: performance.now(), moves: [], d: el.querySelector(".route")?.getAttribute("d") ?? "" };
          Object.defineProperty(f, "el", { value: el });
          w.flights.push(f);
        }
        if (el.classList.contains("flying") && f.flew === undefined) f.flew = performance.now();
        const tf = el.querySelector(".fly-token")?.getAttribute("transform");
        if (tf && f.moves[f.moves.length - 1] !== tf) f.moves.push(tf);
        if (el.classList.contains("landed") && f.landed === undefined) f.landed = performance.now();
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "transform"] });
  });
  type Seen = { from: string; to: string; hiddenFirst: boolean; added: number; flew?: number; moves: string[]; landed?: number; d: string };
  const flights = () => p.page.evaluate(() => (window as unknown as { flights: Seen[] }).flights.map((f) => ({ ...f })));
  const done = (f: Seen) => f.landed !== undefined && f.flew !== undefined;
  for (const end = Date.now() + 180_000; Date.now() < end; ) {
    const fs = await flights();
    if (fs.some((f) => done(f) && f.hiddenFirst)) break;
    if (!(await tap(p, { bid: 0 }))) await p.page.waitForTimeout(150);
  }
  const fs = await flights();
  const flown = fs.find((f) => done(f) && f.hiddenFirst);
  expect(flown, `a flight flown on the map (seen: ${JSON.stringify(fs.map((f) => [f.from, f.to, f.hiddenFirst, !!f.flew, !!f.landed]))})`).toBeTruthy();
  const f = flown!;
  // It waited for the token to walk round the ring and land, then took off.
  expect(f.flew! - f.added, "the flight takes off after the token is down").toBeGreaterThan(500);
  // The token flew it: it moved, frame after frame, and then stepped off the map.
  expect(f.moves.length, "the token moves along the route").toBeGreaterThan(5);
  expect(f.landed! - f.flew!).toBeGreaterThan(2000);
  // The route: from one city to the other, every point on the great circle through them.
  const pts = f.d
    .slice(1)
    .split("L")
    .map((s) => s.trim().split(/\s+/).map(Number) as [number, number]);
  const ends = [unproject(...pts[0]), unproject(...pts[pts.length - 1])];
  const want = [COORDS[f.from], COORDS[f.to]];
  for (let k = 0; k < 2; k++) {
    expect(Math.abs(ends[k][0] - want[k][0]), `latitude at the route's ${k ? "end" : "start"}`).toBeLessThan(0.6);
    const dl = Math.abs(((ends[k][1] - want[k][1] + 540) % 360) - 180);
    expect(dl, `longitude at the route's ${k ? "end" : "start"}`).toBeLessThan(1.5);
  }
  const a = unit(want[0]);
  const b = unit(want[1]);
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = Math.hypot(...n);
  for (const pt of pts) {
    const v = unit(unproject(...pt));
    expect(Math.abs(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / len, "on the great circle").toBeLessThan(0.012);
  }
  // The big screen: its globe wears the real world, and the team's own token flies there too.
  const webgl = await tv.page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  });
  if (webgl) {
    await expect(tv.page.locator("canvas.globe.on")).toHaveAttribute("data-world", "real", { timeout: 20_000 });
    await expect(tv.page.locator("canvas.globe")).toHaveAttribute("data-flier", "token", { timeout: 60_000 });
  } else await expect(tv.page.locator(".tv-board .roundboard.sat-on")).toHaveCount(1, { timeout: 20_000 });
  expect([...p.errors, ...tv.errors]).toEqual([]);
});

test("素材来源：卫星地图写明是 NASA 的图片，带链接，中英文都有；图片和游戏一起提供", async ({ browser, request }) => {
  for (const [locale, title, words] of [
    ["zh-CN", "卫星地图", /NASA 的「蓝色弹珠」/],
    ["en-US", "Satellite map", /NASA's Blue Marble/],
  ] as const) {
    const ctx = await browser.newContext({ ...iphone, locale });
    track(ctx);
    const page = await ctx.newPage();
    await page.goto("/trip/");
    await page.locator("details summary", { hasText: locale === "zh-CN" ? "素材来源" : "Credits" }).click();
    const part = page.locator(".credits-satellite");
    await expect(part.locator("h3")).toHaveText(title);
    await expect(part).toContainText(words);
    const links = await part.locator("a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(links).toEqual([
      "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/",
      "https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/",
      "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    ]);
  }
  // Served beside the game, as WebP; and named in the licences beside it.
  for (const f of ["day-1024.webp", "night-1024.webp", "day-512.webp", "night-512.webp", "globe-day-4096.webp", "globe-night-4096.webp", "globe-day-2048.webp", "globe-night-2048.webp"]) {
    const res = await request.get(`/trip/map/${f}`);
    expect(res.status(), f).toBe(200);
    expect(res.headers()["content-type"], f).toMatch(/image\/webp/);
  }
  expect(await (await request.get("/trip/licences.txt")).text()).toMatch(/Satellite map[\s\S]*Blue Marble[\s\S]*Black Marble/);
});
