// 同一帮人再约 (A4, 2026-11-19): a host's phone remembers the people of a gathering it hosts, and
// the next time brings them along, from the home page or in the list's sheet.
import { expect, test, type Page } from "@playwright/test";
import { closePhones, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closePhones(browser);
});

const hostPanel = (page: Page) => page.locator(".panel", { has: page.locator(".host-row") });
const people = (page: Page) => page.locator(".panel", { has: page.locator(".panel-title", { hasText: "都有谁" }) });

test("the same people again: chosen on the home page, or brought into the list", async ({ browser }) => {
  const host = await phone(browser);
  // no gathering hosted yet: the home page doesn't ask
  await host.goto("/when/");
  await expect(host.locator("#crew-label")).toHaveCount(0);

  const { url } = await make(host, "周末火锅");
  await join(host, url, "Steve");
  await hostPanel(host).locator(".host-row").first().locator(".link-btn").click();
  await host.locator(".sheet textarea").fill("阿May、小王");
  await host.locator(".sheet-foot .btn").click();
  // someone not on the list answers too
  const lee = await phone(browser);
  await join(lee, url, "老李");
  await saved(lee);
  await expect(people(host)).toContainText("老李");

  // next time: the home page offers that gathering's people (the list, then who else answered; not the host)
  await host.goto("/when/");
  const chips = host.locator('.quick[aria-labelledby="crew-label"] button');
  await expect(chips).toHaveText(["先不写", "周末火锅（3 人）"]);
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await chips.nth(1).click();
  await expect(host.locator("#crew-label ~ .hint")).toHaveText("阿May、小王、老李");
  await host.fill('input[name="title"]', "再吃一次");
  await host.click('button[type="submit"]');
  await expect(host.locator(".admin-code")).toBeVisible();
  await host.click(".sheet-foot .btn");
  await expect(hostPanel(host).locator(".host-row").first()).toContainText("阿May、小王、老李");
  await expect(people(host).locator(".hint", { hasText: "还差" })).toHaveText("还差 3 个：阿May、小王、老李");

  // a third, made without it: the list's sheet brings it in, onto a name already typed
  await host.goto("/when/");
  await expect(chips).toHaveText(["先不写", "再吃一次（3 人）"], { timeout: 5000 });
  await host.fill('input[name="title"]', "唱K");
  await host.click('button[type="submit"]');
  await expect(host.locator(".admin-code")).toBeVisible();
  await host.click(".sheet-foot .btn");
  await hostPanel(host).locator(".host-row").first().locator(".link-btn").click();
  await host.locator(".sheet textarea").fill("Tom、阿may");
  await host.locator(".sheet .quick button", { hasText: "再吃一次" }).click();
  await expect(host.locator(".sheet textarea")).toHaveValue("Tom\n阿may\n小王\n老李");
  await host.locator(".sheet-foot .btn").click();
  await expect(hostPanel(host).locator(".host-row").first()).toContainText("Tom、阿may、小王、老李");
});
