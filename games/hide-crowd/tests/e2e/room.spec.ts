// Two phones and a big screen: joining, the vote, a round with a tag, the penalty, and playing again.
import { expect, test } from "@playwright/test";
import { newRoom, noErrors, noSideScroll, phone, screen, shot, until, view } from "./helpers";

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
  await expect(steve.locator(".play-notice")).toHaveText("打中了！+1");
  await until(mia, (v) => v.players.find((p) => p.you)?.tagged === 1);
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
  await expect(mia.locator("dialog.stamp")).toBeVisible();
  await mia.getByRole("button", { name: "Continue" }).click();
  await expect(mia.locator(".result-title")).toHaveText("Steve wins!");
  await expect(mia.getByText("Waiting for the host to start the next round")).toBeVisible();
  await shot(steve, "phone-result");

  // play again, straight into the next round
  await steve.getByRole("button", { name: "再来一局" }).click();
  await until(mia, (v) => v.phase === "playing" && v.round === 2);
  await expect(mia.locator(".controls")).toBeVisible();
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
  await steve.locator(".switch-row").click();
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
  await steve.getByRole("button", { name: "再来一局" }).click();
  await until(kev, (v) => v.phase === "playing" && v.round === 2 && !!v.game?.me, 25_000);
  await expect(kev.locator(".controls")).toBeVisible();
  noErrors(steve, mia, kev);
});
