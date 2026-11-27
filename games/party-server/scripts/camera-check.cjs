// The camera mode end to end, against `npx wrangler dev --var ALLOW_TEST_SETTINGS:1` (port 8787):
// the TV and three phones, the short test dance. Ann's and Bob's cameras are pretend ones
// (camera.ts pretend: no camera, no pose model): Ann dances the coach's moves, Bob stands still.
// Cat's is a real camera as far as the page knows: Chromium's fake camera, playing CAMERA_Y4M
// (a picture of the coach, mirrored as a player following it stands), through the real pose model.
//   node scripts/camera-check.cjs [screenshot folder]      (CAMERA_Y4M=… for Cat's camera)
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const OUT = process.argv[2] || ".";
const Y4M = process.env.CAMERA_Y4M || "";

(async () => {
  const args = ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  if (Y4M) args.push(`--use-file-for-fake-video-capture=${Y4M}`);
  const browser = await chromium.launch({ args });
  const errors = [];
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" })).newPage();
  tv.on("pageerror", (e) => errors.push("tv: " + e));
  await tv.goto(`${BASE}/party/screen`);
  await tv.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash));
  const code = (await tv.evaluate(() => location.hash)).slice(1);
  const phones = [];
  for (const [i, who] of ["Ann", "Bob", "Cat"].entries()) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: i === 1 ? "en-US" : "zh-CN", permissions: ["camera"] });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(who + ": " + e));
    await p.goto(`${BASE}/party/join?code=${code}`);
    await p.fill("#name", who);
    await p.locator("form button[type=submit]").click();
    phones.push(p);
  }
  const [ann, bob, cat] = phones;
  await tv.waitForFunction(() => window.partyDebug.state()?.players?.length === 3, null, { polling: 200 });
  await tv.waitForTimeout(2500);

  // Cat: the real thing, from the button
  let catCamera = null;
  if (Y4M) {
    await cat.getByRole("button", { name: /开摄像头/ }).click();
    catCamera = await cat.waitForFunction(() => window.partyDebug.cameraState()?.status === "ok", null, { timeout: 90000, polling: 250 }).then(() => "ok", async () => (await cat.evaluate(() => window.partyDebug.cameraState()))?.status ?? "none");
    await cat.waitForTimeout(500);
    await cat.screenshot({ path: `${OUT}/camera-cat-lobby.png` });
  }
  await ann.evaluate(() => window.partyDebug.camera({}));
  await bob.evaluate(() => window.partyDebug.camera({ still: true }));
  await ann.waitForTimeout(500);
  const annSees = await ann.evaluate(() => window.partyDebug.cameraState());
  await ann.screenshot({ path: `${OUT}/camera-ann-lobby.png` });

  await ann.evaluate(() => window.partyDebug.act({ type: "START_LEARNING", routineId: "test-short", mode: "dance" }));
  await tv.waitForFunction(() => window.partyDebug.state()?.phase === "learning", null, { polling: 100 });
  await ann.evaluate(() => window.partyDebug.act({ type: "START_DANCING" }));
  await tv.waitForFunction(() => window.partyDebug.state()?.phase === "dancing" && window.partyDebug.run().length > 0, null, { polling: 100 });
  await tv.waitForTimeout(5000);
  await ann.screenshot({ path: `${OUT}/camera-ann-dance.png` });
  const alikeMid = await ann.evaluate(() => window.partyDebug.cameraState()?.alike ?? null);
  await tv.waitForFunction(() => window.partyDebug.state()?.phase === "results" && window.partyDebug.results(), null, { timeout: 120000, polling: 200 });
  const results = await tv.evaluate(() => window.partyDebug.results());
  await ann.waitForSelector(".my-results");
  await ann.screenshot({ path: `${OUT}/camera-ann-results.png` });
  const by = Object.fromEntries(results.players.map((p) => [p.name, { participation: p.participation, hitRate: p.hitRate, movedRate: p.movedRate }]));

  await ann.evaluate(() => window.partyDebug.act({ type: "END_ROOM" }));
  const result = { code, annSees, alikeMid, catCamera, players: by, errors };
  console.log(JSON.stringify(result, null, 1));
  const ok =
    by.Ann && by.Ann.hitRate >= 0.8 &&
    by.Bob && by.Bob.movedRate <= 0.35 &&
    (!Y4M || catCamera === "ok") &&
    errors.length === 0;
  console.log(ok ? "OK" : "FAILED");
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
