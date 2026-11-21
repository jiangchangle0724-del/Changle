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

/** The names over the columns stay inside their columns, and no time in the best three runs under its button. */
async function uncrowded(page: Page) {
  const crowded = await page.evaluate(() => {
    const out: string[] = [];
    const box = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    for (const head of document.querySelectorAll(".grid-heads > span")) {
      const column = head.getBoundingClientRect();
      for (const words of head.children) {
        if (getComputedStyle(words).display === "none") continue;
        const width = box(words).width;
        if (width > column.width + 1) out.push(`${words.textContent}: ${Math.round(width)} > ${Math.round(column.width)}`);
      }
    }
    for (const li of document.querySelectorAll(".best li")) {
      const button = li.querySelector(".btn")?.getBoundingClientRect();
      const words = box(li.querySelector(".best-what")!);
      if (button && words.right > button.left && words.left < button.right && words.bottom > button.top && words.top < button.bottom) out.push(`${li.textContent} runs under its button`);
    }
    return out;
  });
  expect(crowded).toEqual([]);
}

// Larger text on a phone (2026-11-20): over five narrow columns the English names give way to short
// ones (AM, Noon, PM), and in the best three the button goes under the time.
for (const width of [320, 390]) {
  test(`${width} wide, the host's page: the column names and the best three aren't crowded, with normal and 150% text`, async ({ browser }) => {
    const host = await phone(browser, { viewport: { width, height: 700 } });
    const { url } = await make(host, "周末火锅和桌游 Hot pot and board games");
    await join(host, url, "Steve Long Name");
    for (const n of [3, 8, 12]) await cell(host, n).click();
    await saved(host);
    for (const large of [false, true]) {
      await host.evaluate(
        (size) => {
          document.documentElement.style.fontSize = size;
        },
        large ? "150%" : "100%",
      );
      for (const lang of ["zh", "en"]) {
        if (lang === "en") await host.click(".bar-lang");
        await expect(host.locator(".grid-heads > span").nth(2)).toContainText(lang === "zh" ? "早上" : large ? "AM" : "Morning");
        await uncrowded(host);
        await host.click(".seg button:nth-child(2)");
        await expect(host.locator(".best li .btn")).toHaveCount(3);
        await uncrowded(host);
        await buttonsFit(host);
        await host.click(".seg button:nth-child(1)");
        if (lang === "en") await host.click(".bar-lang");
      }
    }
  });
}
