// A host filling in for someone (代填, A3 item 5, 2026-11-14): for parents, or a friend without
// WeChat. The same grid fills in their row, marked 代填, until the host says it's done.
import { expect, test } from "@playwright/test";
import { at, cell, join, make, phone, saved } from "./helpers";

test("a host fills in for 妈妈 on the same grid, comes back to their own, changes it again, and is told when she fills in herself", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "周末火锅");
  await join(host, url, "Steve");
  await cell(host, at(0, "eve")).click();
  await saved(host);
  const guest = await phone(browser);
  await join(guest, url, "阿May");

  const people = (page: typeof host) => page.locator(".people .person");
  const hostPanel = host.locator(".panel", { has: host.locator(".host-row") });
  await expect(guest.locator(".host-row")).toHaveCount(0);

  // 替谁填: a name, and the grid is hers until 填好了
  await hostPanel.locator(".host-row", { hasText: "替人代填" }).locator(".link-btn").click();
  await host.locator(".sheet input").fill("妈妈");
  await host.locator(".sheet .btn-primary", { hasText: "开始替 TA 填" }).click();
  await expect(host.locator(".proxy-bar")).toHaveText(/^正在替 妈妈 填\s*填好了$/);
  await expect(host.locator(".name-form")).toHaveCount(0);
  await cell(host, at(1, "eve")).click();
  await cell(host, at(2, "eve")).click();
  await saved(host);
  // a quick fill fills in hers too: every evening
  await host.locator(".quick button", { hasText: "晚上都行" }).click();
  await saved(host);
  await expect(people(host).filter({ hasText: "妈妈" })).toContainText("代填");
  await expect(people(host).filter({ hasText: "妈妈" })).toContainText("14 格");
  await expect(people(host).filter({ hasText: "Steve" })).toContainText("1 格");
  await expect(people(guest).filter({ hasText: "妈妈" })).toContainText("代填14 格");

  // back to the host's own row: what they tap is theirs again
  await host.locator(".proxy-bar .link-btn").click();
  await expect(host.locator(".proxy-bar")).toHaveCount(0);
  await expect(host.locator(".you")).toContainText("Steve");
  await expect(cell(host, at(0, "eve"))).toHaveAttribute("data-mine", "yes");
  await expect(cell(host, at(1, "eve"))).not.toHaveAttribute("data-mine", "yes");
  await cell(host, at(3, "eve")).click();
  await saved(host);
  await expect(people(host).filter({ hasText: "Steve" })).toContainText("2 格");
  await expect(people(host).filter({ hasText: "妈妈" })).toContainText("14 格");

  // changed again later, from her name: one evening taken off (no longer one filled in at once, so it goes round)
  await people(host).filter({ hasText: "妈妈" }).click();
  await host.locator(".sheet .btn", { hasText: "替 妈妈 改" }).click();
  await expect(host.locator(".proxy-bar")).toContainText("妈妈");
  await expect(cell(host, at(4, "eve"))).toHaveAttribute("data-mine", "yes");
  // free, then could move things, then not free: two taps take it off
  await cell(host, at(4, "eve")).click();
  await cell(host, at(4, "eve")).click();
  await expect(cell(host, at(4, "eve"))).toHaveAttribute("data-mine", "no");
  await saved(host);
  await host.locator(".proxy-bar .link-btn").click();
  await expect(people(host).filter({ hasText: "妈妈" })).toContainText("13 格");
  // the same name again goes on with her row rather than making a second
  await hostPanel.locator(".host-row", { hasText: "替人代填" }).locator(".link-btn").click();
  await host.locator(".sheet input").fill("妈妈");
  await expect(host.locator(".sheet .btn-primary")).toHaveText("接着替 妈妈 填");
  await host.keyboard.press("Escape");

  // after a reload the page is the host's own again, and her row is kept
  await host.reload();
  await expect(host.locator(".proxy-bar")).toHaveCount(0);
  await expect(people(host).filter({ hasText: "妈妈" })).toContainText("13 格");

  // she fills in herself: the host is told the 代填 row can go, and removes it
  const mum = await phone(browser);
  await join(mum, url, "妈妈");
  await cell(mum, at(5, "eve")).click();
  await saved(mum);
  await expect(host.locator(".people ~ .note")).toHaveText("妈妈 自己也填了，代填的那一行可以删掉：点名字。");
  await expect(guest.locator(".people ~ .note")).toHaveCount(0);
  await people(host).filter({ hasText: "代填" }).click();
  await host.locator(".sheet .link-btn", { hasText: "删掉这一行" }).click();
  await host.locator(".sheet .btn-danger").click();
  await expect(host.locator(".people ~ .note")).toHaveCount(0);
  await expect(people(host)).toHaveCount(3);
  await expect(people(host).filter({ hasText: "代填" })).toHaveCount(0);
  // and now there's no filling in for her: she's here
  await hostPanel.locator(".host-row", { hasText: "替人代填" }).locator(".link-btn").click();
  await host.locator(".sheet input").fill("妈妈");
  await expect(host.locator(".sheet .problem")).toHaveText("妈妈 已经自己填了");
  await expect(host.locator(".sheet .btn-primary")).toBeDisabled();
  await host.keyboard.press("Escape");

  // a guest can't fill in for anyone, and the server says so too
  const key = await guest.evaluate((c) => localStorage.getItem(`when.k.${c}`), code);
  const answer = await guest.request.post(`/when/api/e/${code}/host`, { headers: { "x-when-key": key! }, data: { do: "proxy", name: "爸爸", answers: {} } });
  expect(answer.status()).toBe(403);
});

test("in English: who it's for, and the tag on the name", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "Hot pot");
  await join(host, url, "Steve");
  await host.click(".bar-lang");
  await host.locator(".host-row", { hasText: "Fill in for someone" }).locator(".link-btn").click();
  await host.locator(".sheet input").fill("Mum");
  await host.locator(".sheet .btn-primary", { hasText: "Start filling in" }).click();
  await expect(host.locator(".proxy-bar .you")).toHaveText("Filling in for Mum");
  await cell(host, at(1, "eve")).click();
  await saved(host);
  await host.locator(".proxy-bar .link-btn", { hasText: "Done" }).click();
  await expect(host.locator(".people .person", { hasText: "Mum" })).toContainText("by the host1 slot");
});
