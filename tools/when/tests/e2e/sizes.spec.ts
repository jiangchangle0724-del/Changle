import { expect, test, type Page } from "@playwright/test";
import { WECHAT, cell, closePhones, join, make, phone, saved } from "./helpers";

let gathering: string;

test.beforeAll(async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "周末火锅和桌游，顺便看个电影 Hot pot and board games");
  const guests = await Promise.all(Array.from({ length: 8 }, () => phone(browser)));
  await Promise.all(guests.map((page, i) => join(page, url, `老朋友${i + 1} Long Name`)));
  await Promise.all(guests.map(saved));
  await Promise.all(guests.map(async (page, i) => {
    await cell(page, i).click();
    await cell(page, 8).click();
    await saved(page);
  }));
  gathering = url;
  await closePhones(browser);
});

test.afterEach(async ({ browser }) => { await closePhones(browser); });

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function buttonsFit(page: Page) {
  const short = await page.locator("button, a.btn").evaluateAll((buttons) => buttons
    .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().height < 44)
    .map((el) => ({ text: el.textContent, height: el.getBoundingClientRect().height })));
  expect(short).toEqual([]);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  for (const lang of ["zh", "en"]) {
    for (const largeText of [false, true]) {
      test(`${viewport.width} × ${viewport.height}, ${lang}, ${largeText ? "150%" : "normal"} text: home and eight answers fit`, async ({ browser }) => {
        const page = await phone(browser, { viewport });
        const enlarge = async () => {
          if (!largeText) return;
          await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
          await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");
        };
        await page.goto("/when/");
        await expect(page.locator(".hero h1")).toBeVisible();
        if (lang === "en") await page.click(".bar-lang");
        await enlarge();
        await fits(page);
        await buttonsFit(page);
        await page.goto(gathering);
        await expect(page.locator(".meta")).toContainText(lang === "zh" ? "8 个人填了" : "8 answered");
        await enlarge();
        await fits(page);
        await buttonsFit(page);
        await page.click(".seg button:nth-child(2)");
        await expect(cell(page, 8).locator("b")).toHaveText("8");
        await expect(page.locator(".best li")).toHaveCount(3);
        await fits(page);
        await buttonsFit(page);
      });
    }
  }
}

for (const manual of [false, true]) {
  test(`WeChat without navigator.clipboard: ${manual ? "manual field contains the whole link" : "copy reports success or offers the whole link"}`, async ({ browser }) => {
    const page = await phone(browser, { userAgent: WECHAT });
    await page.addInitScript((forceManual) => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      if (forceManual) document.execCommand = () => false;
    }, manual);
    await page.goto(gathering);
    expect(await page.evaluate(() => navigator.clipboard)).toBeUndefined();
    const copy = page.locator(".event-head .copy");
    await copy.locator(".btn").click();
    await expect.poll(async () => {
      if (!manual && (await copy.locator(".btn").innerText()).includes("复制好了")) return true;
      const field = copy.locator(".copy-manual input");
      return await field.isVisible() && await field.inputValue() === gathering;
    }).toBe(true);
    if (await copy.locator(".copy-manual").isVisible()) {
      await expect(copy.locator(".copy-manual input")).toHaveValue(gathering);
      await expect(copy.locator(".copy-manual input")).toHaveAttribute("readonly", "");
    }
  });
}
