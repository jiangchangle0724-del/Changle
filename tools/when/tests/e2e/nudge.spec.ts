// Who the host means to ask, who of them is still to answer, the words to nudge them or invite
// everyone, and when to answer by (A3 item 4, 2026-11-14).
import { expect, test } from "@playwright/test";
import { addDays, dayLabel, vancouverDay } from "../../src/engine";
import { at, catchCopies, cell, copied, join, make, phone, saved } from "./helpers";

test("the host's list, who's still to answer as people come in, the words to nudge and invite, and the deadline passing", async ({ browser }) => {
  const host = await phone(browser);
  await catchCopies(host);
  const { url } = await make(host, "周末火锅");
  await join(host, url, "Steve");

  // nobody listed yet: the host writes who to ask, a line or a 、 apart, a name twice counted once
  const people = host.locator(".panel", { has: host.locator(".panel-title", { hasText: "都有谁" }) });
  const hostPanel = host.locator(".panel", { has: host.locator(".host-row") });
  await expect(people.locator(".hint")).toHaveCount(0);
  await hostPanel.locator(".host-row").first().locator(".link-btn").click();
  await host.locator(".sheet textarea").fill("阿May、小王\n老李，阿may");
  await expect(host.locator(".sheet [aria-live]")).toHaveText("3 个名字");
  await host.locator(".sheet-foot .btn").click();
  await expect(hostPanel.locator(".host-row").first()).toContainText("阿May、小王、老李");
  await expect(people.locator(".hint")).toHaveText("还差 3 个：阿May、小王、老李");

  // the deadline: tomorrow at 8 in the evening
  const tomorrow = addDays(vancouverDay(Date.now()), 1);
  await hostPanel.locator(".host-row").nth(1).locator(".link-btn").click();
  await host.locator(".sheet select").selectOption(tomorrow);
  await host.locator(".sheet input[type=time]").fill("20:00");
  await host.locator(".sheet-foot .btn").click();
  const by = `${dayLabel(tomorrow, "zh")} 20:00`;
  await expect(host.locator(".meta-deadline")).toHaveText(`${by}前填好`);
  await expect(hostPanel.locator(".host-row").nth(1)).toContainText(by);

  // someone on the list comes in, however they typed their name: the line follows on every page
  const may = await phone(browser);
  await join(may, url, "阿may");
  await cell(may, at(1, "eve")).click();
  await saved(may);
  await expect(people.locator(".hint")).toHaveText("还差 2 个：小王、老李");
  await expect(may.locator(".panel .hint", { hasText: "还差" })).toHaveText("还差 2 个：小王、老李");
  await expect(may.locator(".meta-deadline")).toHaveText(`${by}前填好`);

  // the nudge names who's left and when to answer by; plain to start with, another tone, another line
  await people.locator(".btn", { hasText: "催一下" }).click();
  const words = host.locator(".sheet .words-text");
  await expect(words).toHaveText(new RegExp(`^「周末火锅」\\n小王、老李，.+请在${by}前填好。\\n${url}$`));
  const plain = await words.innerText();
  await host.locator(".sheet .words .seg button", { hasText: "轻松" }).click();
  await expect(words).not.toHaveText(plain);
  const easy = await words.innerText();
  await host.locator(".sheet .words .link-btn", { hasText: "换一句" }).click();
  await expect(words).not.toHaveText(easy);
  await host.locator(".sheet .copy .btn").first().click();
  expect(await copied(host)).toBe(await words.innerText());
  await host.locator(".sheet .copy .btn").nth(1).click();
  await expect.poll(() => copied(host)).toMatch(new RegExp(`^"周末火锅"\\n.*小王, 老李.*Please reply by ${dayLabel(tomorrow, "en")}, 20:00\\.\\n${url}$`, "s"));
  await host.keyboard.press("Escape");
  // the tone stays as picked on this phone: the invitation starts easy too, with the days asked
  await people.locator(".btn", { hasText: "邀请" }).click();
  await expect(host.locator(".sheet .words .seg button[aria-pressed=true]")).toHaveText("轻松");
  await expect(words).toContainText(`请在${by}前填好。`);
  await expect(words).toContainText("到");
  await host.keyboard.press("Escape");

  // a phone whose clock is past the deadline: it says so, marks who's still to answer, and the
  // nudge no longer gives a time that has gone
  const later = await phone(browser);
  await later.clock.install();
  await later.goto(url);
  await expect(later.locator(".meta-deadline")).toHaveText(`${by}前填好`);
  await later.clock.fastForward("48:00:00");
  await expect(later.locator(".meta-deadline")).toHaveText("已经截止");
  await expect(later.locator(".panel .note")).toHaveText("已经截止，还差 2 个：小王、老李");
  await later.locator(".panel .btn", { hasText: "催一下" }).click();
  await expect(later.locator(".sheet .words-text")).not.toContainText("前填好");
  await later.keyboard.press("Escape");

  // everyone on the list in: said so; the host clears the deadline and the list
  for (const name of ["小王", "老李"]) await join(await phone(browser), url, name);
  await expect(people.locator(".hint").last()).toHaveText("名单上的人都填了");
  await hostPanel.locator(".host-row").nth(1).locator(".link-btn").click();
  await host.locator(".sheet .link-btn", { hasText: "不设截止" }).click();
  await expect(host.locator(".meta-deadline")).toHaveCount(0);
  await hostPanel.locator(".host-row").first().locator(".link-btn").click();
  await host.locator(".sheet textarea").fill("");
  await expect(host.locator(".sheet [aria-live]")).toHaveText("0 个名字");
  await host.locator(".sheet-foot .btn").click();
  await expect(people.locator(".hint", { hasText: "名单" })).toHaveCount(0);
  await expect(hostPanel.locator(".host-row").first().locator(".link-btn")).toHaveText("写名单");
});

test("only the host writes the list and the deadline; a guest sees them, and can nudge and invite", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "桌游");
  await join(host, url, "Steve");
  const hostPanel = host.locator(".panel", { has: host.locator(".host-row") });
  await hostPanel.locator(".host-row").first().locator(".link-btn").click();
  await host.locator(".sheet textarea").fill(Array.from({ length: 41 }, (_, i) => `朋友${i}`).join("、"));
  await expect(host.locator(".sheet .problem")).toHaveText("最多 40 个名字");
  await expect(host.locator(".sheet-foot .btn")).toBeDisabled();
  await host.locator(".sheet textarea").fill("May, Sam");
  await host.locator(".sheet-foot .btn").click();
  await expect(hostPanel).toContainText("May、Sam");

  const guest = await phone(browser);
  await join(guest, url, "Sam");
  await expect(guest.locator(".host-row")).toHaveCount(0);
  await expect(guest.locator(".panel .hint", { hasText: "还差" })).toHaveText("还差 1 个：May");
  // in English the list reads with commas
  await guest.click(".bar-lang");
  await expect(guest.locator(".panel .hint", { hasText: "Still" })).toHaveText("Still to answer (1): May");
  await guest.locator(".panel .btn", { hasText: "Nudge" }).click();
  await expect(guest.locator(".sheet h2")).toHaveText("Nudge who's left");
  await expect(guest.locator(".sheet .words-text")).toContainText("May");
  await expect(guest.locator(".sheet .copy .btn").first()).toContainText("Copy in English");
  // the server takes the list from the host only
  const answer = await guest.request.post(`${url.replace("/when/", "/when/api/e/")}/host`, { data: { do: "edit", invited: [] } });
  expect(answer.status()).toBeGreaterThanOrEqual(400);
  await expect(guest.locator(".panel .hint", { hasText: "Still" })).toHaveText("Still to answer (1): May");
});
