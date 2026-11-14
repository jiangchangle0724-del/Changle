// A slot's time to the minute (Steve, 2026-11-14): someone free for only part of a period drags
// its line or types the times; the best three then find when the most can meet, and that is the
// time that gets set, in the calendar too. A host can adjust it afterwards.
import { expect, test, type Page } from "@playwright/test";
import { at, calendarFile, cell, join, make, phone, saved } from "./helpers";

/** The sheet for a slot's time: the two time fields, the line's handles, what it reads. */
const sheet = (page: Page) => ({
  from: page.locator(".time-fields input").first(),
  to: page.locator(".time-fields input").nth(1),
  start: page.locator('.timeline-handle[data-end="from"]'),
  end: page.locator('.timeline-handle[data-end="to"]'),
  reads: page.locator(".time-now"),
  done: page.locator(".sheet-foot .btn"),
});
/** Type a time into a time field, as a phone's picker leaves it. */
async function type(field: ReturnType<typeof sheet>["from"], time: string) {
  await field.fill(time);
  await field.dispatchEvent("change");
}

test("a slot's time to the minute: from the line after a tap, by keys, by dragging, by typing; kept, shown, and the time that gets set", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "周末火锅");
  await join(host, url, "Steve");

  // a tap fills all of the evening, and offers its time
  await cell(host, at(1, "eve")).click();
  await expect(host.locator(".toast")).toContainText("晚上 · 整段");
  await host.locator(".toast .link-btn", { hasText: "调时间" }).click();
  const s = sheet(host);
  await expect(host.locator(".sheet .hint").first()).toContainText("这一段是 18:00–23:59");
  await expect(s.from).toHaveValue("18:00");
  await expect(s.to).toHaveValue("23:59");
  await expect(host.locator('.sheet .seg button[aria-pressed="true"]')).toHaveText("有空");

  // the start by keys: an hour and a half later, then a minute at a time
  await s.start.focus();
  for (let i = 0; i < 6; i++) await host.keyboard.press("PageUp");
  await expect(s.reads).toHaveText("19:30–23:59");
  await host.keyboard.press("ArrowRight");
  await expect(s.start).toHaveAttribute("aria-valuetext", "19:31");
  await host.keyboard.press("ArrowLeft");
  // the end by dragging: toward the start it stops half an hour after it
  const track = (await host.locator(".timeline-track").boundingBox())!;
  const y = track.y + track.height / 2;
  await host.mouse.move(track.x + track.width - 1, y);
  await host.mouse.down();
  await host.mouse.move(track.x + 10, y, { steps: 6 });
  await host.mouse.up();
  await expect(s.reads).toHaveText("19:30–20:00");
  // and back out to about two thirds of the way along: the minute follows the finger
  await host.mouse.move(track.x + track.width * 0.3, y);
  await host.mouse.down();
  await host.mouse.move(track.x + track.width * 0.7, y, { steps: 6 });
  await host.mouse.up();
  const dragged = Number((await s.end.getAttribute("aria-valuenow"))!);
  expect(Math.abs(dragged - (1080 + 0.7 * 359))).toBeLessThanOrEqual(3);
  // the end typed, to the minute
  await type(s.to, "22:15");
  await expect(s.reads).toHaveText("19:30–22:15");
  // "all of it" puts the whole evening back; then the time again
  await host.locator(".sheet .link-btn", { hasText: "整段都行" }).click();
  await expect(s.reads).toHaveText("18:00–23:59");
  await type(s.from, "19:30");
  await type(s.to, "22:15");
  await s.done.click();
  await saved(host);

  // the cell shows its part as a line, and says the time
  await expect(cell(host, at(1, "eve")).locator(".cell-span")).toHaveCount(1);
  await expect(cell(host, at(1, "eve"))).toHaveAttribute("aria-label", /晚上 19:30–22:15: 有空$/);
  await host.reload();
  await host.click(".seg button:nth-child(1)");
  await expect(cell(host, at(1, "eve"))).toHaveAttribute("aria-label", /19:30–22:15/);

  // a guest switches to "to the minute": a tap opens the slot's time straight away
  const guest = await phone(browser);
  await join(guest, url, "阿May");
  await guest.locator(".quick button", { hasText: "调到分钟" }).click();
  await expect(guest.locator(".panel .hint").first()).toContainText("点一格，把它的时间调到分钟");
  await cell(guest, at(1, "eve")).click();
  await type(sheet(guest).to, "20:30");
  await expect(sheet(guest).reads).toHaveText("18:00–20:30");
  await sheet(guest).done.click();
  await saved(guest);
  await expect(cell(guest, at(1, "eve"))).toHaveAttribute("data-mine", "yes");

  // the best three: when both can meet, to the minute
  await host.click(".seg button:nth-child(2)");
  await expect(host.locator(".best-what").first()).toContainText("晚上 19:30–20:30");
  await expect(host.locator(".best-what").first()).toContainText("2 个人里 2 个有空");
  // the slot's sheet: the best stretch, and everyone's time
  await cell(host, at(1, "eve")).click();
  await expect(host.locator(".slot-meet")).toContainText("19:30–20:30");
  await expect(host.locator(".names li", { hasText: "Steve" })).toContainText("19:30–22:15");
  await expect(host.locator(".names li", { hasText: "阿May" })).toContainText("18:00–20:30");
  await host.locator(".sheet-foot .btn").click();

  // set: at those minutes, on every page and in the calendar file (Vancouver is UTC−7 all year)
  await expect(host.locator(".set strong")).toContainText("晚上 19:30–20:30");
  await expect(guest.locator(".set strong")).toContainText("晚上 19:30–20:30");
  const ics = await (await host.request.get(calendarFile(code))).text();
  expect(ics).toMatch(/DTSTART:\d{8}T023000Z\r\nDTEND:\d{8}T033000Z\r\n/);
  await expect(host.locator(".after a[href^='/eat/']")).toHaveAttribute("href", /&time=19%3A30&/);

  // the host adjusts it: earlier than Steve can come, and the page says so before it's set
  await host.locator(".set button", { hasText: "调定下的时间" }).click();
  await type(sheet(host).from, "19:00");
  await expect(host.locator(".sheet .hint[aria-live]")).toHaveText("这个时间：2 个人里 1 个有空");
  await host.locator(".sheet-foot .btn", { hasText: "就定这个时间" }).click();
  await expect(host.locator(".set strong")).toContainText("晚上 19:00–20:30");
  await expect(host.locator(".set p")).toHaveText("2 个人里 1 个有空");
  await expect(guest.locator(".set strong")).toContainText("晚上 19:00–20:30");
  expect(await (await host.request.get(calendarFile(code))).text()).toMatch(/DTSTART:\d{8}T020000Z\r\n/);
  // in English: the day and the minutes
  await host.click(".bar-lang");
  await expect(host.locator(".set strong")).toHaveText(/^\w{3}, \w{3} \d+, 19:00–20:30$/);
});

test("the same time for my other evenings; not free drops a slot's time; a guest can't keep a time the server won't take", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "桌游");
  await join(host, url, "Steve");
  await host.locator(".quick button", { hasText: "晚上都行" }).click();
  await saved(host);
  await host.locator(".quick button", { hasText: "调到分钟" }).click();
  await cell(host, at(0, "eve")).click();
  await type(sheet(host).from, "20:00");
  await type(sheet(host).to, "22:00");
  // could move things, with that time
  await host.locator(".sheet .seg button", { hasText: "可以调" }).click();
  await host.locator(".sheet .link-btn", { hasText: "我填了的其它晚上也改成这样" }).click();
  await expect(host.locator(".toast")).toContainText("改好了 13 个");
  await sheet(host).done.click();
  await saved(host);
  for (const row of [0, 5, 13]) {
    await expect(cell(host, at(row, "eve"))).toHaveAttribute("data-mine", "maybe");
    await expect(cell(host, at(row, "eve"))).toHaveAttribute("aria-label", /20:00–22:00/);
  }
  // not free: the time goes with the answer
  await cell(host, at(5, "eve")).click();
  await host.locator(".sheet .seg button", { hasText: "没空" }).click();
  await expect(sheet(host).from).toBeDisabled();
  await sheet(host).done.click();
  await saved(host);
  await expect(cell(host, at(5, "eve"))).toHaveAttribute("data-mine", "no");
  await expect(cell(host, at(5, "eve")).locator(".cell-span")).toHaveCount(0);

  // the server keeps only times inside the slot, for slots answered, half an hour or more
  const key = await host.evaluate((c) => localStorage.getItem(`when.k.${c}`), code);
  const me = (await (await host.request.get(`/when/api/e/${code}`, { headers: { "x-when-key": key! } })).json()).me;
  const day = (await (await host.request.get(`/when/api/e/${code}`)).json()).state.days[0];
  const answers = { [`${day}:eve`]: 2, [`${day}:noon`]: 2 };
  const times = { [`${day}:eve`]: [17 * 60, 19 * 60], [`${day}:noon`]: [12 * 60, 12 * 60 + 10], [`${day}:dawn`]: [60, 120] };
  const saved2 = await host.request.post(`/when/api/e/${code}/me`, { headers: { "x-when-key": key! }, data: { id: me, name: "Steve", answers, times } });
  expect(saved2.status()).toBe(200);
  const row = (await saved2.json()).state.people.find((p: { id: string }) => p.id === me);
  expect(row.answers).toEqual(answers);
  expect(row.times).toBeUndefined();
});
