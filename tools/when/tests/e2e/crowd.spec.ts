import { expect, test } from "@playwright/test";
import { addDays, slotLabel, vancouverDay, type Day } from "../../src/engine";
import { cell, closePhones, everyone, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => { await closePhones(browser); });

// Count by hand, independently of the page's ranking and tally functions. Empty slots are blank.
function result(days: Day[], counts: number[], guests: number) {
  const top = counts.map((count, i) => ({ count, i })).filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.i - b.i).slice(0, 3);
  return {
    counts: counts.map((n) => ({ yes: n ? String(n) : "", maybe: "" })),
    best: top.map(({ count, i }) => ({
      slot: slotLabel(days[Math.floor(i / 3)], (["am", "pm", "eve"] as const)[i % 3], "zh"),
      reason: `${guests} 个人里 ${count} 个有空`,
    })),
  };
}

for (const count of [2, 5, 8]) {
  test(`${count} guests fill different slots together; every phone agrees within five seconds`, async ({ browser }) => {
    const host = await phone(browser);
    const today = vancouverDay(Date.now());
    const days = [today, addDays(today, 1), addDays(today, 2)];
    const { url } = await make(host, "一起吃饭", days);
    const guests = await Promise.all(Array.from({ length: count }, () => phone(browser)));
    await Promise.all(guests.map((page, i) => join(page, url, `朋友${i + 1}`)));
    await Promise.all(guests.map(saved));
    const counts = Array<number>(9).fill(0);
    for (let i = 0; i < count; i++) { counts[i]++; counts[8]++; }
    const expected = result(days, counts, count);

    await Promise.all(guests.map(async (page, i) => {
      await cell(page, i).click();
      await cell(page, 8).click();
    }));
    // Start the deadline at the final tap, including debounce, save and switching views.
    const deadline = Date.now() + 5000;
    await Promise.all([host, ...guests].map(async (page) => {
      await page.click(".seg button:nth-child(2)");
      await expect.poll(() => everyone(page), { timeout: Math.max(1, deadline - Date.now()) }).toEqual(expected);
    }));
    expect(Date.now(), "all phones converged within five seconds of the final tap").toBeLessThanOrEqual(deadline);
    await Promise.all(guests.map(saved));
  });
}

test("eight simultaneous answers to one slot survive on every phone and after every reload", async ({ browser }) => {
  const host = await phone(browser);
  const today = vancouverDay(Date.now());
  const days = [today, addDays(today, 1), addDays(today, 2)];
  const { url } = await make(host, "八个人的桌游", days);
  const guests = await Promise.all(Array.from({ length: 8 }, () => phone(browser)));
  await Promise.all(guests.map((page, i) => join(page, url, `玩家${i + 1}`)));
  await Promise.all(guests.map(saved));
  await Promise.all(guests.map((page) => cell(page, 7).click()));
  const deadline = Date.now() + 5000;
  const counts = Array<number>(9).fill(0);
  counts[7] = 8;
  const expected = result(days, counts, 8);
  const pages = [host, ...guests];
  await Promise.all(pages.map(async (page) => {
    await page.click(".seg button:nth-child(2)");
    await expect.poll(() => everyone(page), { timeout: Math.max(1, deadline - Date.now()) }).toEqual(expected);
  }));
  expect(Date.now(), "all phones converged within five seconds of the final tap").toBeLessThanOrEqual(deadline);
  await Promise.all(guests.map(saved));
  await Promise.all(pages.map(async (page) => {
    await page.reload();
    await page.click(".seg button:nth-child(2)");
    await expect.poll(() => everyone(page)).toEqual(expected);
  }));
});
