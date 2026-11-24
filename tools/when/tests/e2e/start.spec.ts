// 几点开始, the second of two steps (A4, 2026-11-20): once the time is set, the host asks what time
// to start, everyone taps the times that suit them, and the host sets one, which the words for the
// group chat then say.
import { expect, test } from "@playwright/test";
import { at, cell, closePhones, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closePhones(browser);
});

test("the host asks what time to start, everyone says, the host sets it", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "几点开始");
  await join(host, url, "Steve");
  await cell(host, at(1, "eve")).click();
  const guest = await phone(browser);
  await join(guest, url, "甲");
  await cell(guest, at(1, "eve")).click();
  await saved(guest);
  await saved(host);

  await expect(host.locator(".best li")).toHaveCount(1);
  await host.locator(".best li .btn").click();
  await expect(host.locator(".set")).toBeVisible();
  await expect(guest.locator(".set-host")).toHaveCount(0);

  // the host picks the times: the first three half hours of the evening are offered first
  await host.locator(".set .link-btn", { hasText: "问大家几点开始" }).click();
  const picks = host.locator(".sheet .starts-pick button");
  await expect(picks.first()).toHaveText("18:00");
  await expect(host.locator('.sheet .starts-pick button[aria-pressed="true"]')).toHaveText(["18:00", "18:30", "19:00"]);
  await host.locator(".sheet .starts-pick button", { hasText: "19:00" }).click();
  await expect(host.locator(".sheet-foot .btn")).toBeEnabled();
  await host.locator(".sheet .starts-pick button", { hasText: "18:00" }).click();
  await expect(host.locator(".sheet-foot .btn"), "one time is no question").toBeDisabled();
  await host.locator(".sheet .starts-pick button", { hasText: "18:00" }).click();
  await host.locator(".sheet .starts-pick button", { hasText: "19:00" }).click();
  await host.locator(".sheet-foot .btn").click();

  // everyone sees the times; someone without a name is asked for one first
  const times = (page: typeof host) => page.locator(".set .starts-times button");
  await expect(times(guest)).toHaveText(["18:00", "18:30", "19:00"]);
  await expect(host.locator(".starts .btn-on-gel")).toHaveText("还没人点");
  await expect(host.locator(".starts .btn-on-gel")).toBeDisabled();
  const stranger = await phone(browser);
  await stranger.goto(url);
  await expect(times(stranger).first()).toBeDisabled();
  await expect(stranger.locator(".starts-note")).toHaveText("在下面写上名字就能点");

  await times(guest).nth(1).click();
  await times(guest).nth(2).click();
  await times(host).nth(1).click();
  await expect(times(host)).toHaveText(["18:00", "18:302", "19:001"]);
  await expect(times(guest).nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(times(host).nth(1)).toHaveAccessibleName("18:30，2 个人可以");

  // the host sets the one most people tapped: the set time says when it starts, and so do the words
  await host.locator(".starts .btn-on-gel").click();
  await expect(host.locator(".set strong")).toContainText("晚上 18:30 开始");
  await expect(guest.locator(".set strong")).toContainText("晚上 18:30 开始");
  await expect(guest.locator(".starts")).toHaveCount(0);
  await expect(host.locator(".after .words-text")).toContainText("18:30 开始");
  await host.click(".bar-lang");
  await expect(host.locator(".set strong")).toHaveText(/, from 18:30$/);
});

test("the host can change the times asked about, or stop asking", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "改选项");
  await join(host, url, "Steve");
  await cell(host, at(1, "eve")).click();
  await saved(host);
  await host.locator(".best li .btn").click();
  await host.locator(".set .link-btn", { hasText: "问大家几点开始" }).click();
  await host.locator(".sheet-foot .btn").click();
  await host.locator(".set .starts-times button").first().click();
  await expect(host.locator(".starts .btn-on-gel")).toHaveText("定在 18:00 开始");

  await host.locator(".set .link-btn", { hasText: "改时间选项" }).click();
  await expect(host.locator('.sheet .starts-pick button[aria-pressed="true"]')).toHaveText(["18:00", "18:30", "19:00"]);
  await host.locator(".sheet .starts-pick button", { hasText: "18:00" }).click();
  await host.locator(".sheet .starts-pick button", { hasText: "20:00" }).click();
  await host.locator(".sheet-foot .btn").click();
  await expect(host.locator(".set .starts-times button")).toHaveText(["18:30", "19:00", "20:00"]);
  await expect(host.locator(".starts .btn-on-gel"), "a vote for a time no longer asked about is gone").toHaveText("还没人点");

  await host.locator(".set .link-btn", { hasText: "改时间选项" }).click();
  await host.locator(".sheet .link-btn", { hasText: "不问了" }).click();
  await expect(host.locator(".starts")).toHaveCount(0);
  await expect(host.locator(".set .link-btn", { hasText: "问大家几点开始" })).toBeVisible();
});
