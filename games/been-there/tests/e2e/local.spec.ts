// Being there (issue #44), on real screens. A team's first landing in a city plays the city's recording
// and no song; landing there again plays one of the city's songs (Apple's 30-second preview, looked up
// and streamed at play time: here Apple's two addresses answer from the test), on one device only (the
// team's phone with no big screen, the big screen when there is one), with "Now playing" and the link to
// Apple Music; it fades out when the team's turn ends. Nothing is fetched or played while the sound is
// off. The arrival card shows the city's local time, the weather, how to say hello and what it means,
// and the local money; the buy prompt shows the price in it.
//
// The dice: we throw 1+2 to Cape Town (a first visit), the computer 1+3 to the departure tax, we 4+6 to
// Mumbai, it 2+4 to Immigration, we 4+6 to Beijing and take its Central Axis straight across the board,
// back to Cape Town: a second visit.
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";
import { COORDS } from "../../src/client/art/coords";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, playUntil, quizOff, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

const DICE = [1, 2, 1, 3, 4, 6, 2, 4, 4, 6];
const RAIN = { at: Date.now(), cities: Object.fromEntries(Object.keys(COORDS).map((id) => [id, { t: 12, code: 63, day: true }])) };
/** Cape Town's songs, as the game has them. */
const CAPE = (JSON.parse(readFileSync("src/client/songs.json", "utf8")) as { cities: Record<string, { id: number; title: string; show?: { zh?: string } }[]> }).cities.capetown;
/** What Apple's preview server answers here: two seconds of a tone, as a WAV file (every browser decodes WAV). */
function wav(seconds = 2, rate = 8000): Buffer {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), 44 + i * 2);
  return b;
}
const PREVIEW = wav();

/** Apple's lookup and preview server, answered from here. Returns the addresses asked, in order. */
async function apple(ctx: BrowserContext): Promise<string[]> {
  const asked: string[] = [];
  const cors = { "access-control-allow-origin": "*" };
  await ctx.route(/^https:\/\/itunes\.apple\.com\/lookup/, (route) => {
    const url = route.request().url();
    asked.push(url);
    const id = Number(new URL(url).searchParams.get("id"));
    return route.fulfill({ headers: cors, contentType: "text/javascript; charset=utf-8", body: JSON.stringify({ resultCount: 1, results: [{ trackId: id, previewUrl: `https://audio-ssl.itunes.apple.com/test/${id}.m4a` }] }) });
  });
  await ctx.route(/^https:\/\/audio-ssl\.itunes\.apple\.com\//, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ headers: cors, contentType: "audio/wav", body: PREVIEW });
  });
  await ctx.route("**/api/weather", (route) => route.fulfill({ json: RAIN }));
  return asked;
}

/** A game with one computer team, where our team throws first (the seat order is drawn: a room where
 * the computer went first is left for a new one), and with a big screen if asked. */
async function ourGame(browser: Browser, request: APIRequestContext, contextOptions: Parameters<Browser["newContext"]>[0], withTv: boolean) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = await createRoom(request, { test: { speed: 0.5, dice: DICE } });
    let tv: Phone | null = null;
    let tvAsked: string[] = [];
    if (withTv) {
      const ctx = await browser.newContext({ ...contextOptions, viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
      track(ctx);
      tvAsked = await apple(ctx);
      tv = { name: "大屏", ctx, page: await ctx.newPage(), errors: [], log: [], taps: 0 };
      watch(tv, tv.page);
      await tv.page.goto(`/trip/tv/${code}`);
      await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
    }
    const p = await newPhone(browser, "游", contextOptions);
    const asked = await apple(p.ctx);
    await joinWithTeam(p, code);
    await p.page.getByRole("button", { name: "加一个电脑队" }).click();
    await quizOff(p);
    await p.page.getByRole("button", { name: "开始", exact: true }).click();
    await expect(p.page.locator(".game")).toBeVisible();
    const roll = p.page.locator('.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)');
    if (await roll.waitFor({ timeout: 2_500 }).then(() => true, () => false)) return { p, asked, tv, tvAsked };
    await p.ctx.close();
    await tv?.ctx.close();
  }
  throw new Error("our team never went first");
}

const songOf = (text: string | null) => CAPE.find((s) => text?.includes(s.show?.zh ?? s.title));

test("第二次到开普敦：手机放当地热歌，显示正在播放，回合结束淡出；第一次只放录音；到达卡有当地时间、天气和问候语，买地显示当地货币", async ({
  browser,
  request,
  contextOptions,
}) => {
  test.setTimeout(240_000);
  const { p, asked } = await ourGame(browser, request, contextOptions, false);
  const nowPlaying = p.page.locator(".playwin .now-playing");
  try {
    // Our first throw: Cape Town, a first visit. Its buy prompt has the price in rand too.
    const buy = p.page.locator('.decide[data-kind="buy"]:not(.waiting)');
    await playUntil([p], async () => (await buy.count()) > 0, 60_000, { skip: ["buy"] });
    await expect(buy.locator(".brief .local-money")).toHaveText("约 1,300 兰特");
    // The arrival card below it: hello, how to say it and what it means; the time and weather there now; the money.
    const arrival = p.page.locator(".playwin .arrival");
    await expect(arrival.locator("h3")).toContainText("开普敦");
    await expect(arrival.locator(".arrival-hello")).toContainText("Molo");
    await expect(arrival.locator(".arrival-say")).toHaveText("读作「莫洛」，意思是「你好（科萨语）」");
    const there = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg" });
    const time = (await arrival.locator(".arrival-time").textContent())?.match(/当地时间 (\d\d):(\d\d)/);
    expect(time, "the local time").toBeTruthy();
    const [h, m] = there.format(new Date()).split(":").map(Number);
    expect(Math.abs((Number(time![1]) * 60 + Number(time![2]) - (h * 60 + m) + 1440) % 1440), "Cape Town's time, give or take a minute").toBeLessThanOrEqual(1);
    await expect(arrival.locator(".arrival-wx")).toHaveText("此刻 雨 12°C");
    await expect(arrival.locator(".arrival-cur")).toHaveText("南非兰特$1 约 17 兰特");
    // A first visit: the city's recording (the touchdown), no song, nothing asked of Apple.
    await expect(nowPlaying).toHaveCount(0);
    expect(asked).toEqual([]);
    await buy.locator(".btn.primary").click();

    // On round the board to Beijing, and straight across it back to Cape Town.
    await playUntil([p], async () => (await nowPlaying.count()) > 0, 150_000);
    await expect(nowPlaying).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    await expect(p.page.locator("html")).toHaveAttribute("data-song", "playing");
    const song = songOf(await nowPlaying.locator(".np-song b").textContent());
    expect(song, "one of Cape Town's own songs").toBeTruthy();
    await expect(nowPlaying.locator(".np-where")).toHaveText("正在播放");
    await expect(nowPlaying.locator(".np-link")).toHaveText("在 Apple Music 听完整版");
    await expect(nowPlaying.locator(".np-link")).toHaveAttribute("href", /^https:\/\/music\.apple\.com\/za\//);
    // Looked up at play time, in its storefront, then streamed from Apple.
    expect(asked).toEqual([`https://itunes.apple.com/lookup?id=${song!.id}&country=za&entity=song`, `https://audio-ssl.itunes.apple.com/test/${song!.id}.m4a`]);

    // It plays through the rest of the turn (Day Zero's vote again) and stops when the turn ends.
    const end = p.page.locator('.decide[data-kind="end"]:not(.waiting) .btn.primary');
    await playUntil([p], async () => (await end.count()) > 0, 60_000, { skip: ["end"] });
    await expect(p.page.locator("html")).toHaveAttribute("data-song", "playing");
    await end.click();
    await expect(p.page.locator("html")).toHaveAttribute("data-song", "off", { timeout: 6_000 });
    await expect(nowPlaying).toHaveCount(0);
    expect(asked.length, "nothing more asked of Apple").toBe(2);
    expect(p.errors).toEqual([]);
  } catch (e) {
    await explain(p, "local hit");
    throw e;
  }
});

test("有大屏时只在大屏上放，手机显示「大屏正在播放」；大屏没开声音就什么都不放、也不向 Apple 要，开了声音才放", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  const { p, asked, tv, tvAsked } = await ourGame(browser, request, contextOptions, true);
  const screen = tv!;
  // The big screen's sound is off (the M key, which is also the tap that would let it play).
  await screen.page.keyboard.press("m");
  const phoneNow = p.page.locator(".playwin .now-playing");
  const tvNow = screen.page.locator(".screen .now-playing");
  try {
    await playUntil([p], async () => (await phoneNow.count()) > 0, 180_000);
    await expect(tvNow).toHaveAttribute("data-state", "muted", { timeout: 10_000 });
    await expect(tvNow.locator(".np-where")).toHaveText("这台设备的声音关着");
    await expect(phoneNow).toHaveAttribute("data-state", "elsewhere");
    await expect(phoneNow.locator(".np-where")).toHaveText("大屏正在播放");
    await p.page.waitForTimeout(1_500);
    expect(tvAsked, "nothing asked of Apple while the big screen's sound is off").toEqual([]);
    expect(asked, "the phone never asks: it doesn't play").toEqual([]);
    expect(await screen.page.locator("html").getAttribute("data-song")).not.toBe("playing");

    // Sound on, on the big screen: it plays there, and only there.
    await tvNow.locator(".np-on").click();
    await expect(tvNow).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    await expect(screen.page.locator("html")).toHaveAttribute("data-song", "playing");
    expect(tvAsked.length).toBe(2);
    expect(asked).toEqual([]);
    expect(await p.page.locator("html").getAttribute("data-song")).toBeNull();

    // The turn ends: it fades out on the big screen.
    const end = p.page.locator('.decide[data-kind="end"]:not(.waiting) .btn.primary');
    await playUntil([p], async () => (await end.count()) > 0, 60_000, { skip: ["end"] });
    await end.click();
    await expect(screen.page.locator("html")).toHaveAttribute("data-song", "off", { timeout: 6_000 });
    expect([...screen.errors, ...p.errors]).toEqual([]);
  } catch (e) {
    await explain(p, "local hit, big screen");
    await explain(screen, "big screen");
    throw e;
  }
});

test("没开声音的手机：到第二次的城市不放歌、不向 Apple 要，显示「这台设备的声音关着」", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  const { p, asked } = await ourGame(browser, request, contextOptions, false);
  await p.page.locator(".menu-btn").click();
  await p.page.getByRole("checkbox", { name: /声音/ }).uncheck();
  await p.page.keyboard.press("Escape");
  const nowPlaying = p.page.locator(".playwin .now-playing");
  try {
    await playUntil([p], async () => (await nowPlaying.count()) > 0, 180_000);
    await expect(nowPlaying).toHaveAttribute("data-state", "muted");
    await expect(nowPlaying.locator(".np-where")).toHaveText("这台设备的声音关着");
    await p.page.waitForTimeout(1_500);
    expect(asked).toEqual([]);
    expect(await p.page.locator("html").getAttribute("data-song")).toBeNull();
    expect(p.errors).toEqual([]);
  } catch (e) {
    await explain(p, "muted");
    throw e;
  }
});
