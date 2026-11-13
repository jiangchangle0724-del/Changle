/*
 * 两清 (changle.ca/split) in a phone-sized browser. With the site running (`npm run dev`):
 *
 *   npx tsx scripts/split_check.ts          everything below
 *   npx tsx scripts/split_check.ts walk     every screen and sheet, in 中文 and in English, at four phone sizes:
 *                                           a picture of each, axe on each (the rules CI runs), nothing wider
 *                                           than the phone, nothing to press smaller than 44px
 *   npx tsx scripts/split_check.ts fits     记一笔 shows whole, with nothing to scroll, at the heights phones
 *                                           really give a web page (a browser's bars take a sixth of the screen)
 *   npx tsx scripts/split_check.ts behave   the back button, links, a reload, two tabs, a browser that stores
 *                                           nothing, one without the clipboard, a real keyboard, the three motions
 *
 * Options: --base http://127.0.0.1:5173 (a build: `npx vite preview`, then --base http://127.0.0.1:4173),
 * --out <folder for the pictures>. CHROME=/path/to/chrome uses that browser, else Playwright's own
 * (`npx playwright install chromium`).
 *
 * Nothing leaves the machine: 两清 keeps its ledgers in the browser's own storage, every run starts
 * with none, and the names in it are made up.
 *
 * (Inside page.evaluate, no named functions: tsx wraps them in a helper the page doesn't have.)
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { W, type Word } from "../src/split/words";

type Lang = "zh" | "en";
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const what = args.find((a) => ["walk", "fits", "behave"].includes(a)) ?? "all";
const base = flag("--base") ?? "http://127.0.0.1:5173";
const out = flag("--out") ?? join(tmpdir(), "split-check");
mkdirSync(out, { recursive: true });

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) failed++;
  console.log(cond ? "ok  " : "FAIL", msg);
};
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {});
const errors: string[] = [];
const watch = (page: Page) => {
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e}`));
};
const phone = (width: number, height: number, lang: Lang, motion: "reduce" | "no-preference" = "reduce") =>
  browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === "zh" ? "zh-CN" : "en-CA", reducedMotion: motion, serviceWorkers: "block" });
/** The site in this language (its own setting, which a phone's language only sets the first time). */
const speak = (ctx: BrowserContext, lang: Lang) =>
  ctx.addInitScript((settings) => {
    if (!localStorage.getItem("lazysusan.settings.v1")) localStorage.setItem("lazysusan.settings.v1", settings);
  }, JSON.stringify({ lang, players: [], sound: false, music: false, customPenalty: "" }));
const re = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const closed = (page: Page) => page.getByRole("dialog").waitFor({ state: "hidden" });
const key = (page: Page, d: string) => page.locator(".split-key", { hasText: new RegExp(`^${d === "." ? "\\." : d}$`) }).click();
const type = async (page: Page, digits: string) => {
  for (const d of digits) await key(page, d);
};
const path = (page: Page) => new URL(page.url()).pathname;

// ---------- walk: every screen, looked at and checked ----------
async function walk(lang: Lang, width: number, height: number) {
  const t = (k: Word) => W[k][lang];
  const ctx = await phone(width, height, lang);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await speak(ctx, lang);
  const page = await ctx.newPage();
  watch(page);
  const findings: string[] = [];
  const button = (k: Word) => page.getByRole("button", { name: t(k), exact: true });

  let shots = 0;
  const shot = async (name: string) => {
    shots++;
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(out, `${name}-${lang}-${width}x${height}.png`) });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of results.violations) for (const n of v.nodes) findings.push(`${name}: axe ${v.impact} ${v.id} ${JSON.stringify(n.target)}`);
    const wide = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const found: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > w + 0.5 || r.left < -0.5) && !el.closest(".ui-visually-hidden")) found.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return { scroll: document.documentElement.scrollWidth - w, found: found.slice(0, 4) };
    });
    if (wide.scroll > 0 || wide.found.length) findings.push(`${name}: wider than the phone by ${wide.scroll}px ${wide.found.join(" | ")}`);
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const top = document.querySelector("dialog[open]") ?? document.body;
      for (const el of top.querySelectorAll<HTMLElement>("button, a[href], input, [role=radio], [role=checkbox], [role=tab]")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) found.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return found;
    });
    for (const s of small) findings.push(`${name}: smaller than 44px: ${s}`);
  };

  const startSheet = async (name: string, me: string, others: string[], currency?: string) => {
    await button("start").click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("input").nth(0).fill(name);
    await sheet.locator("input").nth(1).fill(me);
    for (const n of others) {
      await sheet.locator("#split-who-else").fill(n);
      await sheet.getByRole("button", { name: t("add"), exact: true }).click();
    }
    if (currency) await sheet.getByRole("button", { name: currency, exact: true }).click();
    return sheet;
  };
  let payerShot = false;
  const fill = async (amount: string, payer: string | null, note: string | null) => {
    await button("addExpense").click();
    await type(page, amount);
    if (payer) {
      await page.getByRole("button", { name: re(t("payer")) }).click();
      if (!payerShot) {
        payerShot = true;
        await shot("04a-payer");
      }
      await page.getByRole("radio", { name: re(payer) }).click();
      await closed(page);
    }
    if (note) await page.locator("label.split-field input").fill(note);
  };

  await page.goto(`${base}/split`);
  await button("start").waitFor();
  await shot("01-empty");
  let sheet = await startSheet("惠斯勒周末", "Steve", ["小王", "阿美", "Jason", "小李"]);
  await shot("02-start");
  await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
  await button("addExpense").waitFor();
  await shot("03-ledger-empty");
  await page.getByRole("tab", { name: t("settle") }).click();
  await shot("03b-settle-empty");
  await page.getByRole("tab", { name: t("expenses") }).click();

  // the plan's three expenses
  await fill("186", "小王", "晚饭");
  await shot("04-add");
  await button("done").click();
  await fill("120", null, "油费");
  await button("done").click();
  await fill("81.50", "阿美", "早餐");
  await button("done").click();
  await button("addExpense").waitFor();
  await shot("05-ledger");
  ok((await page.locator(".split-figure").textContent())?.includes("$42.50"), `${lang} ${width}x${height}: the plan's weekend leaves Steve owed $42.50`);

  // sharing, three ways
  await button("addExpense").click();
  await type(page, "86.40");
  await page.getByRole("button", { name: re(t("sharedBy")) }).click();
  await shot("06-share-even");
  await page.getByRole("checkbox").nth(4).click();
  await shot("06b-share-four");
  await page.getByRole("radio", { name: t("shares"), exact: true }).click();
  await page.getByRole("button", { name: re(t("oneMore").replace("{who}", "Steve")) }).click();
  await shot("07-share-shares");
  await page.getByRole("radio", { name: t("amounts"), exact: true }).click();
  await page.getByRole("dialog").locator(".split-person-field input").first().fill("40");
  await shot("08-share-amounts");
  await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(page);
  await shot("08b-add-not-adding-up");
  await button("close").first().click();

  // settling
  await page.getByRole("tab", { name: t("settle") }).click();
  await shot("09-settle");
  await page.locator(".split-row").first().click();
  await shot("10-step");
  await page.getByRole("button", { name: re(t("copyAmount")) }).click();
  await shot("10b-step-copied");
  ok((await page.evaluate(() => navigator.clipboard.readText())) === "77.50", `${lang} ${width}x${height}: 复制金额 copies the bare amount`);
  await button("markPaid").click();
  await closed(page);
  await shot("11-settle-one-paid");
  await page.locator(".split-row").first().click();
  await shot("11b-step-paid");
  await page.keyboard.press("Escape");
  await closed(page);
  await button("copyPlan").click();
  await shot("11c-plan-copied");
  ok((await page.evaluate(() => navigator.clipboard.readText())).split("\n").length === 5, `${lang} ${width}x${height}: 复制结清方案 copies the name and four transfers`);

  // the ⋯ sheet and the people
  await button("more").click();
  await shot("13-menu");
  await page.getByRole("button", { name: re(t("members")) }).click();
  await page.getByRole("dialog").getByText(t("addPerson")).waitFor();
  await shot("15-people");
  await page.getByRole("dialog").locator("#split-add-person").fill("老陈");
  await page.getByRole("dialog").getByRole("button", { name: t("add"), exact: true }).click();
  await page.getByRole("button", { name: re(`${t("renamePerson")} 老陈`) }).click();
  await shot("15b-people-open-new");
  await page.getByRole("button", { name: re(`${t("renamePerson")} 小王`) }).click();
  await shot("15c-people-open-fixed");
  await page.keyboard.press("Escape");
  await closed(page);
  await button("more").click();
  await page.getByRole("button", { name: re(t("deleteLedger")) }).click();
  await shot("13b-menu-delete-ask");
  await button("keep").click();
  await page.keyboard.press("Escape");
  await closed(page);

  // changing an expense, deleting it, taking that back
  await page.getByRole("tab", { name: t("expenses") }).click();
  await page.locator(".split-row").first().click();
  await shot("16-edit");
  await button("deleteExpense").click();
  await shot("17-deleted");
  await button("undo").click();
  await page.waitForTimeout(200);
  await shot("17b-put-back");

  // everyone pays
  await page.getByRole("tab", { name: t("settle") }).click();
  for (let i = 0; i < 8; i++) {
    const next = page.locator(".split-rows").first().locator(".split-row", { hasNotText: t("paid") });
    if (!(await next.count())) break;
    await next.first().click();
    await button("markPaid").click();
    await closed(page);
  }
  await shot("12-all-square");
  ok((await page.locator(".split-seal").count()) === 1, `${lang} ${width}x${height}: all four marked, the page is stamped 两清`);
  await page.getByRole("tab", { name: t("expenses") }).click();
  await shot("12b-ledger-square");
  await page.goto(`${base}/split`);
  await button("start").waitFor();
  await shot("14-ledgers");
  await page.goto(`${base}/split/aaaaaaaaaaaaaaaaaaaaaa`);
  await button("myLedgers").waitFor();
  await shot("18-missing");
  await button("myLedgers").click();

  // yen (no decimals), the longest names, the most an entry can be
  sheet = await startSheet("Hokkaido ski trip with the whole office", "Bartholomew-Alexander", ["Wilhelmina Featherstone", "欧阳娜娜的朋友小明同学"], lang === "zh" ? "日元" : "JPY");
  await shot("19-start-long");
  await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
  await fill("9999999999", "Wilhelmina", "Lift passes, four days, the whole group x");
  await shot("20-add-yen");
  await button("done").click();
  await fill("1000", null, null);
  await button("done").click();
  await button("addExpense").waitFor();
  await shot("21-ledger-yen");
  await page.getByRole("tab", { name: t("settle") }).click();
  await shot("22-settle-yen");
  await page.locator(".split-row").first().click();
  await shot("23-step-yen");
  await page.keyboard.press("Escape");
  await closed(page);
  await page.getByRole("tab", { name: t("expenses") }).click();
  await button("addExpense").click();
  await type(page, "100");
  await page.getByRole("button", { name: re(t("sharedBy")) }).click();
  await page.getByRole("radio", { name: t("shares"), exact: true }).click();
  await shot("24-shares-long");
  await page.getByRole("radio", { name: t("amounts"), exact: true }).click();
  await shot("25-amounts-long");

  const unique = [...new Set(findings)];
  ok(!unique.length, `${lang} ${width}x${height}: ${shots} screens, nothing found by axe, nothing too wide, nothing too small to press${unique.length ? `\n     ${unique.join("\n     ")}` : ""}`);
  await ctx.close();
}

// ---------- fits: 记一笔 on the screen a phone really gives it ----------
async function fits() {
  const sizes: [number, number, string][] = [
    [390, 844, "an iPhone 14, added to the home screen"],
    [414, 715, "an iPhone 11 in Safari"],
    [390, 664, "an iPhone 14 in Safari, its bars showing"],
    [393, 659, "a Pixel in Chrome"],
    [375, 629, "an iPhone 13 mini in Safari"],
    [360, 560, "a small Android in Chrome"],
    [375, 553, "an iPhone SE or 8 in Safari, its bars showing"],
  ];
  // one expense whose typed parts can be made not to add up, so the line that says so is on the screen too
  const saved = JSON.stringify({
    ledgers: [{ id: "aaaaaaaaaaaaaaaaaaaaaa", name: "惠斯勒周末", currency: "CAD", members: [{ id: "a", name: "Steve" }, { id: "b", name: "小王" }, { id: "c", name: "阿美" }], entries: [{ kind: "expense", id: "e1", at: 1, payer: "a", amount: 10000, note: "x", split: { how: "exact", amounts: { a: 5000, b: 5000 } }, rot: 0 }] }],
    me: { aaaaaaaaaaaaaaaaaaaaaa: "a" },
  });
  for (const lang of ["zh", "en"] as const) {
    for (const [w, h, phoneName] of sizes) {
      const ctx = await phone(w, h, lang);
      await speak(ctx, lang);
      await ctx.addInitScript((s) => localStorage.setItem("changle.split.v1", s), saved);
      const page = await ctx.newPage();
      watch(page);
      await page.goto(`${base}/split/aaaaaaaaaaaaaaaaaaaaaa`);
      await page.locator(".split-row").first().click();
      await page.locator(".split-key").first().waitFor();
      for (let i = 0; i < 4; i++) await page.locator(".split-key").last().click(); // 100.00 becomes 10
      await page.waitForTimeout(200);
      const m = (await page.evaluate(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        return {
          scrolls: document.scrollingElement.scrollHeight - window.innerHeight,
          linesEnd: Math.round(box("label.split-field").bottom),
          keysStart: Math.round(box(".split-keys").top),
          key: Math.round(box(".split-key").height),
          said: !!document.querySelector(".split-field strong svg"),
        };
      })()`)) as { scrolls: number; linesEnd: number; keysStart: number; key: number; said: boolean };
      ok(m.scrolls <= 0 && m.linesEnd <= m.keysStart && m.key >= 44 && m.said, `${lang} ${w}x${h} (${phoneName}): 记一笔 shows whole, keys ${m.key}px tall, ${m.keysStart - m.linesEnd}px to spare${m.scrolls > 0 ? `, but the page scrolls ${m.scrolls}px` : ""}${m.said ? "" : ", but it doesn't say the parts don't add up"}`);
      await page.screenshot({ path: join(out, `fits-${lang}-${w}x${h}.png`) });
      await ctx.close();
    }
  }
}

// ---------- behave: what it does, beyond how it looks ----------
async function behave() {
  const t = (k: Word) => W[k].zh;
  const button = (page: Page, k: Word) => page.getByRole("button", { name: t(k), exact: true });
  const start = async (page: Page, name = "测试", people = ["阿甲", "阿乙"]) => {
    await button(page, "start").click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("input").nth(0).fill(name);
    await sheet.locator("input").nth(1).fill("我");
    for (const n of people) {
      await sheet.locator("#split-who-else").fill(n);
      await sheet.getByRole("button", { name: t("add"), exact: true }).click();
    }
    await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
    await button(page, "addExpense").waitFor();
  };
  const open = async (ctx: BrowserContext) => {
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${base}/split`);
    await button(page, "start").waitFor();
    return page;
  };
  const amountShown = (page: Page) => page.locator(".split-add-amount output").textContent();

  // the back button, links, a reload
  {
    const ctx = await phone(390, 664, "zh");
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${base}/`);
    await page.goto(`${base}/split`);
    await button(page, "start").waitFor();
    await page.evaluate("window.__same = 1");
    await start(page);
    const ledger = path(page);
    ok(/^\/split\/[A-Za-z0-9_-]{22}$/.test(ledger), `a new ledger has an address of its own (${ledger})`);
    ok((await page.title()).includes("两清"), `the tab is titled for 两清 (${await page.title()})`);

    await button(page, "addExpense").click();
    await page.locator(".split-keys").waitFor();
    await page.goBack();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
    ok(path(page) === ledger, "back on 记一笔 closes it and stays on the ledger");

    await button(page, "addExpense").click();
    await type(page, "30");
    await page.getByRole("button", { name: re(t("payer")) }).click();
    await page.getByRole("dialog").waitFor();
    await page.goBack();
    await closed(page);
    ok(await page.locator(".split-keys").isVisible(), "back on the 谁付的 sheet closes the sheet and leaves 记一笔 open");
    ok((await amountShown(page)) === "$30", "and the amount typed is still there");
    await button(page, "done").click();
    await page.locator(".split-row").first().waitFor();
    ok((await page.locator(".split-row").count()) === 1 && path(page) === ledger, "saving puts the expense in the list and stays on the ledger");

    await button(page, "back").click();
    await page.locator(".split-ledger").waitFor();
    ok(path(page) === "/split", "‹ on a ledger goes to the list of ledgers");
    await page.locator(".split-ledger").click();
    await button(page, "addExpense").waitFor();
    ok(path(page) === ledger && (await page.evaluate("window.__same")) === 1, "a ledger's card opens it without loading the site again");
    await page.goBack();
    await page.locator(".split-ledger").waitFor();
    ok(path(page) === "/split", "the phone's back button on a ledger goes to the list");
    await page.goForward();
    await button(page, "addExpense").waitFor();

    await page.reload();
    await page.locator(".split-row").first().waitFor();
    ok((await page.locator(".split-row-amount").first().textContent()) === "$30.00", "a reload keeps the ledger and its expense");

    await page.getByRole("tab", { name: t("settle") }).click();
    await page.locator(".split-row").first().click();
    await page.getByRole("dialog").waitFor();
    await page.goBack();
    await closed(page);
    ok(path(page) === ledger && (await page.getByRole("tab", { name: t("settle") }).getAttribute("aria-selected")) === "true", "back on a transfer's sheet closes it and stays on 结清");

    await button(page, "more").click();
    await page.getByRole("button", { name: re(t("deleteLedger")) }).click();
    await button(page, "deleteYes").click();
    await button(page, "start").waitFor();
    ok(path(page) === "/split" && (await page.locator(".split-ledger").count()) === 0, "deleting a ledger lands on the list, and the ledger is gone from it");
    await page.goBack();
    await page.waitForTimeout(600);
    ok(path(page) !== ledger, `back after deleting doesn't open the deleted ledger (now at ${path(page)})`);
    await ctx.close();
  }

  // a ledger opened straight from its address; two tabs
  {
    const ctx = await phone(390, 664, "zh");
    const page = await open(ctx);
    await start(page);
    const ledger = path(page);
    const direct = await ctx.newPage();
    watch(direct);
    await direct.goto(`${base}${ledger}`);
    await button(direct, "addExpense").waitFor();
    await button(direct, "back").click();
    await direct.locator(".split-ledger").waitFor();
    ok(path(direct) === "/split", "‹ on a ledger opened from its address goes to the list, not off the site");

    await page.bringToFront();
    await button(page, "addExpense").click();
    await key(page, "9");
    await button(page, "done").click();
    await direct.locator(".split-ledger").click();
    await direct.locator(".split-row").first().waitFor();
    ok((await direct.locator(".split-row-amount").first().textContent()) === "$9.00", "another tab shows what this one recorded");
    await page.locator(".split-row").first().click();
    await button(page, "deleteExpense").click();
    await direct.locator(".split-row").first().waitFor({ state: "hidden" });
    await button(page, "undo").click();
    await direct.locator(".split-row").first().waitFor();
    ok(true, "and loses the row when it is deleted there, and gets it back on undo");
    await ctx.close();
  }

  // a browser that won't store anything (a private window)
  {
    const ctx = await phone(390, 664, "zh");
    await ctx.addInitScript("Storage.prototype.setItem = function () { throw new DOMException('no', 'QuotaExceededError'); };");
    const page = await open(ctx);
    await start(page);
    await button(page, "addExpense").click();
    await key(page, "5");
    await button(page, "done").click();
    await page.locator(".split-row").first().waitFor();
    await button(page, "back").click();
    await page.locator(".split-ledger").waitFor();
    ok(await page.getByRole("alert").filter({ hasText: W.notKept.zh }).isVisible(), "with storage refused a ledger still works while the page is open, and the list says it won't be kept");
    await ctx.close();
  }

  // a browser without the clipboard API (some in-app browsers)
  {
    const ctx = await phone(390, 664, "zh");
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await open(ctx);
    await start(page, "复制", ["阿甲"]);
    await button(page, "addExpense").click();
    await key(page, "7");
    await button(page, "done").click();
    await page.getByRole("tab", { name: t("settle") }).click();
    await page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('no')) }); 0");
    await page.locator(".split-row").first().click();
    await page.getByRole("button", { name: re(t("copyAmount")) }).click();
    await page.getByRole("button", { name: re(t("copied")) }).waitFor({ timeout: 2000 });
    ok((await page.evaluate("navigator.clipboard.readText()")) === "3.50", "without the clipboard API the amount is still copied, from inside the open sheet");
    await page.keyboard.press("Escape");
    await closed(page);
    await button(page, "copyPlan").click();
    await page.waitForTimeout(300);
    ok(String(await page.evaluate("navigator.clipboard.readText()")).startsWith("复制 · 结清"), "and so is the plan, from the page");
    await ctx.close();
  }

  // a real keyboard, on a computer
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await open(ctx);
    await start(page);
    await button(page, "addExpense").click();
    await page.locator(".split-keys").waitFor();
    await page.keyboard.type("12.345");
    ok((await amountShown(page)) === "$12.34", "typing on a keyboard fills the amount, to the cent");
    await page.keyboard.press("Backspace");
    ok((await amountShown(page)) === "$12.3", "Backspace takes a digit off");
    await page.locator("label.split-field input").click();
    await page.keyboard.type("12 个饺子");
    ok((await amountShown(page)) === "$12.3", "typing in the note leaves the amount alone");
    await page.keyboard.press("Enter");
    ok(await page.evaluate("document.activeElement?.tagName !== 'INPUT'"), "Enter in the note puts the keyboard away");
    await button(page, "done").click();
    await page.locator(".split-row").first().waitFor();
    ok((await page.locator(".split-row-text strong").first().textContent()) === "12 个饺子", "the note is on the row");
    await page.keyboard.press("Tab");
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(String(await page.evaluate("(document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 12)")));
      await page.keyboard.press("Tab");
    }
    ok(seen.some((s) => s.includes(t("addExpense"))) && seen.some((s) => s.includes("12 个饺子")), "Tab reaches the row and the button");
    const wide = Number(await page.evaluate("document.querySelector('.split-page').getBoundingClientRect().width"));
    ok(wide <= 560, `on a computer the page keeps to one column (${wide}px wide)`);
    await ctx.close();
  }

  // the three motions, with motion allowed
  {
    const ctx = await phone(390, 664, "zh", "no-preference");
    const page = await open(ctx);
    await start(page, "动效", ["阿甲"]);
    await button(page, "addExpense").click();
    await type(page, "80");
    await button(page, "done").click();
    await page.locator(".split-rows > .is-landing").waitFor({ timeout: 1000 });
    ok(true, "motion 1: a recorded expense lands in the list");
    const rolled: string[] = [];
    for (let i = 0; i < 12; i++) {
      rolled.push((await page.locator(".split-figure > [aria-hidden]").textContent()) ?? "");
      await page.waitForTimeout(40);
    }
    ok(new Set(rolled).size > 2 && rolled.at(-1) === "$40.00", `motion 2: the figure rolls to its amount (${[...new Set(rolled)].slice(0, 4).join(" → ")} … ${rolled.at(-1)})`);
    ok((await page.locator(".split-figure > .ui-visually-hidden").textContent()) === "$40.00", "and a screen reader hears the amount once, not every step");
    await page.locator(".split-rows > .is-landing").waitFor({ state: "detached", timeout: 3000 });
    ok(true, "the landing mark comes off the row when the landing is over");
    await page.getByRole("tab", { name: t("settle") }).click();
    await page.locator(".split-row").first().click();
    await button(page, "markPaid").click();
    await page.locator(".split-square.is-stamping").waitFor({ timeout: 1500 });
    ok(true, "motion 3: the last transfer marked, the page is stamped 两清");
    await page.getByRole("tab", { name: t("expenses") }).click();
    await page.getByRole("tab", { name: t("settle") }).click();
    ok((await page.locator(".split-square").count()) === 1 && (await page.locator(".split-square.is-stamping").count()) === 0, "coming back to a ledger already square shows the seal without stamping it again");
    await ctx.close();
  }
}

if (what === "all" || what === "walk") for (const lang of ["zh", "en"] as const) for (const [w, h] of [[390, 844], [390, 664], [375, 553], [320, 568]]) await walk(lang, w, h);
if (what === "all" || what === "fits") await fits();
if (what === "all" || what === "behave") await behave();
ok(errors.length === 0, errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors anywhere");
await browser.close();
console.log(failed ? `\n${failed} FAILED (pictures in ${out})` : `\nall good (pictures in ${out})`);
process.exit(failed ? 1 : 0);
