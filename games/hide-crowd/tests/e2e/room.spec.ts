// Two phones and a big screen: joining, the vote, a round with a tag, the penalty, and playing again.
import { expect } from "@playwright/test";
import { bigTargets, newRoom, noErrors, noSideScroll, phone, screen, shot, test, until, view } from "./helpers";
import type { RoomView } from "../../src/room/protocol";

test("two phones join, vote and play a round: a tag scores, the most spotted takes the penalty, the host plays again", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { duel: true, roundMs: 9_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  const tv = await screen(browser);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await tv.goto(`/hide/tv/${code}?flat=1`);
  await expect(mia.locator(".chips")).toContainText("Steve");
  await expect(steve.locator(".chips")).toContainText("Mia");
  await expect(tv.locator(".tv-stage.tv-lobby")).toBeVisible();
  await expect(tv.locator(".tv-lobby .chips")).toContainText("Mia");
  // the first in hosts; the other waits
  await expect(steve.getByRole("button", { name: "开始" })).toBeEnabled();
  await expect(mia.getByText("Waiting for the host to start")).toBeVisible();
  // the vote
  await mia.getByRole("button", { name: /Courtyard Theatre/ }).click();
  await until(steve, (v) => v.arenaVotes.gallery === 1);
  await expect(tv.locator(".arena-option.is-voted")).toHaveCount(1);
  await shot(steve, "phone-lobby-zh");
  await shot(mia, "phone-lobby-en");
  await noSideScroll(steve);

  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing" && v.game?.arena === "gallery");
  // face to face (the test room's start): Steve punches Mia
  await steve.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  await until(steve, (v) => v.players.find((p) => p.you)?.score === 1);
  // each knows who it was: Steve whom he got, Mia who got her (and, for a moment, which body it was)
  // (and the announcer calls first blood on both phones, Steve's own as "you")
  await Promise.all([
    expect(steve.locator(".play-notice")).toHaveText("打中 Mia！+1"),
    expect(steve.locator(".callout")).toContainText("你第一滴血"),
    expect(mia.locator(".callout")).toContainText("SteveFirst Blood")
  ]);
  await until(mia, (v) => v.players.find((p) => p.you)?.tagged === 1 && v.game!.avatars.some((a) => a.by === "Steve"));
  expect((await view(steve))!.game!.avatars.some((a) => a.by !== undefined)).toBe(false);
  await expect(mia.locator(".play-notice")).toContainText("Steve");
  // and she slips into another body, somewhere else
  await until(mia, (v) => v.game!.events.some((e) => e.t === "hide" && e.byYou), 5_000);
  const mine = (await view(mia))!.game!.avatars.findIndex((a) => a.me);
  expect(mine).toBeGreaterThanOrEqual(0);

  // the clock runs out: the penalty for whoever was spotted most, on every screen
  await until(steve, (v) => v.phase === "over", 20_000);
  const stamp = steve.locator("dialog.stamp");
  await expect(stamp).toBeVisible();
  await expect(stamp.locator(".stamp-names")).toHaveText("Mia");
  await expect(stamp.locator(".stamp-seal")).toHaveText("喝");
  await expect(stamp.locator(".stamp-detail")).toHaveText("喝一口");
  await expect(mia.locator("dialog.stamp .stamp-seal")).toHaveText("Drink");
  await expect(tv.locator(".stamp-tv .stamp-names")).toHaveText("Mia");
  await shot(steve, "phone-stamp");
  await shot(tv, "tv-stamp");
  await steve.getByRole("button", { name: "继续" }).click();
  await expect(steve.locator(".result")).toBeVisible();
  await expect(steve.locator(".result-title")).toHaveText("你赢了！");
  // the round's titles: the hunter's sharp eye on their own phone, in its language
  await expect(steve.locator(".award.is-you .award-title")).toHaveText("火眼金睛");
  // the winner's row first, with the crown; and whom you spotted
  await expect(steve.locator(".result-table tbody tr").first()).toHaveClass(/is-winner/);
  await expect(steve.locator(".result-mine .is-got")).toContainText("Mia");
  await expect(mia.locator("dialog.stamp")).toBeVisible();
  await mia.getByRole("button", { name: "Continue" }).click();
  await expect(mia.locator(".result-title")).toHaveText("Steve wins!");
  await expect(mia.locator(".result-mine .is-by")).toContainText("Steve");
  await expect(mia.getByText("Waiting for the host to start the next round")).toBeVisible();
  await shot(steve, "phone-result");

  // a whole match (on unless the host turns it off): the first of three places, the points so far,
  // where it goes next; then straight into the next place
  await expect(steve.locator(".result-round")).toHaveText("第 1/3 场结束");
  await expect(steve.locator(".result-table .result-total").first()).toHaveText("1");
  await expect(steve.locator(".result-next")).toContainText("下一场");
  await steve.getByRole("button", { name: "下一场", exact: true }).click();
  await until(mia, (v) => v.phase === "playing" && v.round === 2 && v.match?.index === 2);
  await expect(mia.locator(".controls")).toBeVisible();
  await expect(mia.locator(".hud-what")).toContainText("Place 2 of 3");
  noErrors(steve, mia, tv);
});

test("the host turns the penalty off; someone who joins mid-round watches and plays the next", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 15_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia");
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.locator(".switch-row").filter({ hasText: "每局结束的惩罚" }).click();
  await until(mia, (v) => v.settings.penalties === false);
  await expect(mia.getByText("这桌不罚")).toBeVisible();
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing");
  const kev = await phone(browser, "Kev");
  await kev.goto(`/hide/r/${code}?flat=1`);
  await expect(kev.getByText("这一局你在看，下一局加入")).toBeVisible();
  await until(steve, (v) => v.phase === "over", 30_000);
  await expect(steve.locator("dialog.stamp")).toHaveCount(0);
  await expect(steve.locator(".result")).toBeVisible();
  await steve.getByRole("button", { name: "下一场", exact: true }).click();
  await until(kev, (v) => v.phase === "playing" && v.round === 2 && !!v.game?.me, 25_000);
  await expect(kev.locator(".controls")).toBeVisible();
  noErrors(steve, mia, kev);
});

test("the night market: standing still at a stall tastes it, the stall lights up for everyone, and only the taster is told; then firecrackers", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { stall: 2, roundMs: 40_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  const tv = await screen(browser);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await tv.goto(`/hide/tv/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await expect(steve.locator(".arena-option")).toHaveCount(4);
  await steve.getByRole("button", { name: /列治文夜市/ }).click();
  await mia.getByRole("button", { name: /Richmond Night Market/ }).click();
  await until(steve, (v) => v.arenaVotes.market === 2);
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing" && v.game?.arena === "market");
  // the quest strip: four snacks, none tasted yet
  await expect(steve.locator(".quest .quest-snack")).toHaveCount(4);
  await expect(mia.locator(".quest")).toHaveAttribute("aria-label", "Taste all four: 0 tasted");
  // Steve starts at the bubble tea stall and stands still: a moment later it's tasted
  await until(steve, (v) => v.game!.events.some((e) => e.t === "bite" && e.stall === 2 && e.byYou), 6_000);
  await expect(steve.locator(".play-notice")).toHaveText("珍珠奶茶，还差 3 样");
  await expect(steve.locator(".quest-snack.stall-2")).toHaveClass(/is-done/);
  await expect(steve.locator(".quest")).toHaveAttribute("aria-label", "尝遍四样：尝过 1 样");
  await shot(steve, "phone-market-bite");
  // everyone sees the stall light up; only Steve's phone says it was him
  await until(mia, (v) => v.game!.events.some((e) => e.t === "bite" && e.stall === 2 && !e.byYou));
  await until(tv, (v) => v.game!.events.some((e) => e.t === "bite" && e.stall === 2 && !e.byYou));
  await expect(mia.locator(".play-notice")).toHaveCount(0);
  await expect(mia.locator(".quest-snack.is-done")).toHaveCount(0);
  await expect(tv.locator(".flat-stall")).toHaveCount(4);
  // ten seconds in, firecrackers thrown into the crowd: the moment on the phones and the big screen,
  // and on the flat arena the ring round each that has landed
  await expect(mia.locator(".moment-banner")).toContainText("Firecrackers", { timeout: 15_000 });
  await expect(tv.locator(".moment-banner")).toContainText("有人扔鞭炮");
  await expect(mia.locator(".flat-cracker").first()).toBeVisible();
  await expect(tv.locator(".flat-cracker").first()).toBeVisible();
  await shot(tv, "tv-market-crackers");
  noErrors(steve, mia, tv);
});

test("four players play a knockout: two go through, two watch the final, one is the champion", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 7_000 } });
  const steve = await phone(browser, "Steve");
  const others = [await phone(browser, "Mia", "en"), await phone(browser, "Ann", "en"), await phone(browser, "Bob", "en")];
  const tv = await screen(browser);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  for (const page of others) await page.goto(`/hide/r/${code}?flat=1`);
  await tv.goto(`/hide/tv/${code}?flat=1`);
  await until(steve, (v) => v.players.filter((player) => player.online).length === 4);
  // four or more: the whole-match switch is a knockout, 4 → 2 → 1 (no penalty this time: straight to the results)
  await expect(steve.locator(".lobby-settings")).toContainText("晋级赛：4 → 2 → 1");
  await steve.locator(".switch-row").filter({ hasText: "每局结束的惩罚" }).click();
  await until(tv, (v) => v.settings.penalties === false);
  await steve.getByRole("button", { name: "开始", exact: true }).click();
  await until(tv, (v) => v.phase === "playing" && v.knockout?.stage === 1);
  await expect(tv.locator(".tv-clock")).toContainText("第 1 关 · 前 2 名晋级");
  await expect(tv.locator(".score-cut")).toHaveCount(1);
  // stage 1 runs out: two through, two out, stamped
  await until(tv, (v) => v.phase === "over" && !!v.result?.knockout, 20_000);
  await expect(tv.locator(".tv-result-title")).toHaveText("前 2 名晋级", { timeout: 10_000 });
  await expect(tv.locator(".result-stamp.is-through")).toHaveCount(2);
  await expect(tv.locator(".result-stamp.is-out")).toHaveCount(2);
  await expect(tv.locator(".result-next")).toContainText("决赛：");
  await shot(tv, "tv-knockout-stage");
  const pages = [steve, ...others];
  const lots = await Promise.all(pages.map(async (page) => (await view(page))!.result!.knockout!.you));
  expect(lots.filter((lot) => lot === "through")).toHaveLength(2);
  const out = pages.filter((_, index) => lots[index] === "out");
  await expect(out[0].locator(".result-title")).toHaveText(out[0] === steve ? "你被淘汰了" : "You're out");
  // the host starts the final; the two who went out watch it
  await steve.getByRole("button", { name: "开始决赛" }).click();
  await until(tv, (v) => v.phase === "playing" && !!v.knockout?.final);
  await expect(tv.locator(".tv-clock")).toContainText("决赛 · 只有一人胜出");
  for (const page of out) await expect(page.locator(".play-watching")).toContainText(page === steve ? "你在第 1 关被淘汰了" : "You went out in stage 1");
  await until(tv, (v) => v.phase === "over" && !!v.result?.knockout?.done, 20_000);
  await expect(tv.locator(".tv-result-title")).toContainText("冠军：", { timeout: 10_000 });
  await expect(tv.locator(".result-stamp", { hasText: "冠军" })).toHaveCount(1);
  const final = await Promise.all(pages.map(async (page) => (await view(page))!.result!.knockout!.you));
  expect(final.filter((lot) => lot === "champion")).toHaveLength(1);
  const champion = pages[final.indexOf("champion")];
  await expect(champion.locator(".result-title")).toHaveText(champion === steve ? "你是冠军！" : "You're the champion!");
  await shot(tv, "tv-knockout-champion");
  await expect(steve.getByRole("button", { name: "再来一场晋级赛" })).toBeVisible();
  noErrors(...pages, tv);
});

test("every place has a side quest of its own: in the theatre, standing under a lantern lights it, in the place's own words", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { stall: 2, roundMs: 30_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.getByRole("button", { name: /中式庭院戏台/ }).click();
  await until(steve, (v) => v.arenaVotes.gallery === 1);
  await steve.getByRole("button", { name: "开始", exact: true }).click();
  await until(mia, (v) => v.phase === "playing" && v.game?.arena === "gallery");
  // the theatre's quest: four lanterns
  await expect(mia.locator(".quest")).toHaveAttribute("aria-label", "Light all four lanterns: 0 lit");
  await expect(steve.locator(".quest .quest-snack")).toHaveCount(4);
  // Steve starts under the third lantern and stands still: a moment later it's lit
  await until(steve, (v) => v.game!.events.some((e) => e.t === "bite" && e.stall === 2 && e.byYou), 6_000);
  await expect(steve.locator(".play-notice")).toHaveText("寿字灯笼亮了，还差 3 盏");
  await expect(steve.locator(".quest")).toHaveAttribute("aria-label", "点亮四盏灯：亮了 1 盏");
  await expect(steve.locator(".flat-stall.stall-2")).toHaveClass(/is-lit/);
  await shot(steve, "phone-gallery-lantern");
  await expect(mia.locator(".play-notice")).toHaveCount(0);
  noErrors(steve, mia);
});

test("Distract, twice a round: a passer-by across the crowd swings at nothing, and only you are told", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 30_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing");
  const distract = steve.getByRole("button", { name: "分心，还剩 2 次" });
  await expect(distract).toBeVisible();
  await bigTargets(steve);
  // (the swing is over in under half a second: Mia's page watches for it itself)
  await mia.evaluate(() => {
    const page = window as unknown as { __hide?: { game?: { avatars: { p: string }[] } }; __swung?: boolean };
    page.__swung = false;
    const timer = window.setInterval(() => {
      if (page.__hide?.game?.avatars.some((a) => a.p === "windup" || a.p === "punch")) {
        page.__swung = true;
        window.clearInterval(timer);
      }
    }, 15);
  });
  await distract.dispatchEvent("pointerdown");
  await expect(steve.locator(".play-notice")).toHaveText("人群另一头有人挥了一拳，大家都在看那边");
  await expect(steve.getByRole("button", { name: "分心，还剩 1 次" })).toBeVisible();
  await shot(steve, "phone-distract");
  // the others see a passer-by swing, and nothing more
  await expect.poll(() => mia.evaluate(() => (window as unknown as { __swung?: boolean }).__swung)).toBe(true);
  expect((await view(mia))!.game!.events.some((e) => e.t === "decoy")).toBe(false);
  await expect(mia.locator(".play-notice")).toHaveCount(0);
  await steve.getByRole("button", { name: "分心，还剩 1 次" }).dispatchEvent("pointerdown");
  await expect(steve.getByRole("button", { name: "分心，还剩 0 次" })).toHaveAttribute("aria-disabled", "true");
  noErrors(steve, mia);
});

test("the transit hall: by a light switch, Lights comes up; pulling it puts every screen in the dark, and only you are told", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { lights: true, roundMs: 30_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  const tv = await screen(browser);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await tv.goto(`/hide/tv/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.getByRole("button", { name: /温哥华交通站厅/ }).click();
  await until(steve, (v) => v.arenaVotes.metro === 1);
  await steve.getByRole("button", { name: "开始", exact: true }).click();
  await until(mia, (v) => v.phase === "playing" && v.game?.arena === "metro");
  // Steve starts by the left switch: Lights is up on his phone only (Mia's isn't by one)
  const lights = steve.getByRole("button", { name: "拉电闸关灯，还剩 2 次" });
  await expect(lights).toBeVisible();
  await expect(mia.locator(".move-lights")).toHaveCount(0);
  await bigTargets(steve);
  await lights.dispatchEvent("pointerdown");
  await expect(steve.locator(".play-notice")).toHaveText("你拉了电闸，灯马上黑");
  await shot(steve, "phone-lights");
  // every screen goes dark and sees the left switch go; nobody else is told whose it was
  await expect(mia.locator(".moment-banner")).toContainText("Lights out");
  await expect(tv.locator(".moment-banner")).toContainText("灯黑了");
  await expect(tv.locator(".flat-switch.is-pulled")).toHaveCount(1);
  expect((await view(mia))!.game!.events.some((e) => e.t === "lights")).toBe(false);
  await expect(mia.locator(".play-notice")).toHaveCount(0);
  await expect(steve.locator(".move-lights")).toHaveCount(0);
  await shot(tv, "tv-lights");
  noErrors(steve, mia, tv);
});

test("the theatre: a distraction turns the others' cameras; then the stage counts three, two, one, Punch lights up, and a punch on the call is the crowd's", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 40_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  const tv = await screen(browser);
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await tv.goto(`/hide/tv/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.getByRole("button", { name: /中式庭院戏台/ }).click();
  await mia.getByRole("button", { name: /Courtyard Theatre/ }).click();
  await until(steve, (v) => v.arenaVotes.gallery === 2);
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing" && v.game?.arena === "gallery");
  // (Steve's swing on the call, below, is on screen for well under a second: his page notes it in every
  // view that comes in, even when a busy machine handles several at once)
  await steve.evaluate(() => {
    const page = window as unknown as { __hide?: RoomView; __swung?: boolean };
    let current = page.__hide;
    page.__swung = false;
    Object.defineProperty(window, "__hide", {
      configurable: true,
      get: () => current,
      set: (next: RoomView) => {
        current = next;
        if (next?.game?.avatars.some((a) => a.me && (a.p === "windup" || a.p === "punch"))) page.__swung = true;
      }
    });
  });
  // Mia's distraction: Steve's camera and the big screen's glance at the passer-by; Mia's own stays put
  await mia.getByRole("button", { name: "Distract, 2 left" }).dispatchEvent("pointerdown");
  // (it lasts a second and a half: both watched at once)
  await Promise.all([until(steve, (v) => !!v.game?.glance, 3_000), until(tv, (v) => !!v.game?.glance, 3_000)]);
  expect((await view(mia))!.game!.glance ?? null).toBeNull();
  // 12 s in, the stage counts on every screen, and Punch has a ring round it
  await expect(steve.locator(".drill-call")).toBeVisible({ timeout: 15_000 });
  await expect(steve.locator(".moment-banner")).toContainText("台上喊口令");
  await expect(mia.locator(".moment-banner")).toContainText("The stage counts");
  await expect(tv.locator(".drill-call")).toBeVisible();
  await expect(steve.locator(".move-punch")).toHaveClass(/is-drill|is-cue/);
  await shot(tv, "tv-drill");
  // the call: 出拳！, and Punch pulses; a punch now goes through the passers-by (no foul, and not a miss)
  // (watched for every frame: it's on for under a second)
  await steve.waitForFunction(() => document.querySelector(".drill-call.is-go")?.textContent === "出拳！", undefined, { timeout: 5_000 });
  expect(await steve.locator(".move-punch").getAttribute("class")).toMatch(/is-cue/);
  await steve.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  await expect(mia.locator(".drill-call.is-go")).toHaveText("Punch!");
  await shot(steve, "phone-drill-call");
  await expect.poll(() => steve.evaluate(() => (window as unknown as { __swung?: boolean }).__swung), { timeout: 3_000 }).toBe(true);
  await steve.waitForTimeout(600);
  const mine = (await view(steve))!.game!.events.filter((e) => e.byYou);
  expect(mine.filter((e) => e.t === "foul" || e.t === "swing")).toEqual([]);
  noErrors(steve, mia, tv);
});
