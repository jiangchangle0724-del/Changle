/*
 * 两清 (changle.ca/split) in a phone-sized browser. With the site running (`npm run dev`) and 两清's
 * server beside it (in tools/split: `npx wrangler dev --port 8794 --var ALLOW_TEST_SETTINGS:1`; a
 * run starts more ledgers than one network may in a day):
 *
 *   npx tsx scripts/split_check.ts          everything below
 *   npx tsx scripts/split_check.ts walk     every screen and sheet, in 中文 and in English, at four phone sizes:
 *                                           a picture of each, axe on each (the rules CI runs), nothing wider
 *                                           than the phone, nothing to press smaller than 44px
 *   npx tsx scripts/split_check.ts fits     记一笔 shows whole, with nothing to scroll, at the heights phones
 *                                           really give a web page (a browser's bars take a sixth of the screen)
 *   npx tsx scripts/split_check.ts behave   the back button, links, a reload, two tabs, a browser that stores
 *                                           nothing, one without the clipboard, a real keyboard, the three motions;
 *                                           no signal and back, two phones on one ledger, a change that didn't
 *                                           stick, a day's allowance used up, an answer that isn't the server's;
 *                                           an invitation sent and opened (as a chat app hands it over, too),
 *                                           ones that don't get in, the list asking after its ledgers
 *
 * Options: --base http://127.0.0.1:5173 (a build: `npx vite preview`, then --base http://127.0.0.1:4173),
 * --out <folder for the pictures>. CHROME=/path/to/chrome uses that browser, else Playwright's own
 * (`npx playwright install chromium`).
 *
 * Nothing leaves the machine: the ledgers go to the server running on it, every phone here starts
 * with none, and the names in them are made up. Pointed anywhere else (--base a preview, or
 * changle.ca), the server is left alone: every phone here is given no way to reach it, so it shows
 * what a phone with no signal shows, and the checks that need a server are skipped. A ledger made
 * on the real server can't be deleted yet, so this never makes one there.
 *
 * (Inside page.evaluate, no named functions: tsx wraps them in a helper the page doesn't have.)
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { say, W, type Word } from "../src/split/words";

type Lang = "zh" | "en";
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const what = args.find((a) => ["walk", "fits", "behave"].includes(a)) ?? "all";
const base = flag("--base") ?? "http://127.0.0.1:5173";
const out = flag("--out") ?? join(tmpdir(), "split-check");
mkdirSync(out, { recursive: true });
/** Is the site on this machine? Only then is its server one this may make ledgers on. */
const local = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname);
if (!local) console.log(`${base} is not this machine: its server is left alone (every phone here has no signal), and the checks that need one are skipped\n`);
const API = "**/split/api/**";
const KEPT = "changle.split.v2";

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) failed++;
  console.log(cond ? "ok  " : "FAIL", msg);
};
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {});
const errors: string[] = [];
/** A browser says so in its console when a request fails. Where a check takes the signal away on purpose, that is expected. */
const noSignal = /Failed to load resource|WebSocket connection to|ERR_INTERNET_DISCONNECTED/;
const watch = (page: Page, signalMayGo = !local) => {
  page.on("console", (m) => m.type() === "error" && !(signalMayGo && noSignal.test(m.text())) && errors.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e}`));
};
const phone = async (width: number, height: number, lang: Lang, motion: "reduce" | "no-preference" = "reduce") => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === "zh" ? "zh-CN" : "en-CA", reducedMotion: motion, serviceWorkers: "block" });
  if (!local) {
    await ctx.route(API, (route) => route.abort("internetdisconnected"));
    await ctx.routeWebSocket(/\/split\/api\//, (ws) => void ws.close());
  }
  return ctx;
};
/** What a phone keeps of its ledgers (src/split/store.ts). */
type Kept = { held: { key: string; made: boolean; seq: number; server: { id: string; members: { id: string; name: string }[]; entries: unknown[] }; waiting: unknown[]; lost: unknown[] }[]; me: Record<string, string> };
const keptBy = async (page: Page): Promise<Kept> => JSON.parse(String(await page.evaluate(`localStorage.getItem(${JSON.stringify(KEPT)})`))) as Kept;
/** A phone that already holds these ledgers when it opens the site (as it will after joining by a link). */
const holding = (ctx: BrowserContext, kept: unknown) =>
  ctx.addInitScript(
    ([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    },
    [KEPT, JSON.stringify(kept)] as const,
  );
/** What the server holds of a ledger, asked for with the key the phone keeps. */
const onServer = async (page: Page, id: string, key: string) =>
  (await page.evaluate(`fetch("/split/api/ledgers/${id}", { headers: { "x-split-key": ${JSON.stringify(key)} } }).then((r) => (r.ok ? r.json() : { seq: -1, ledger: { entries: [], members: [], name: String(r.status) } }))`)) as { seq: number; ledger: { name: string; entries: { id: string; gone?: number }[]; members: { name: string }[] } };
/** The line a ledger's page says about the server, or null when it says nothing. */
const syncSaid = async (page: Page) => ((await page.locator(".split-page > .split-sync").count()) ? ((await page.locator(".split-page > .split-sync").textContent()) ?? "") : null);
/** The site in this language (its own setting, which a phone's language only sets the first time). */
const speak = (ctx: BrowserContext, lang: Lang) =>
  ctx.addInitScript((settings) => {
    if (!localStorage.getItem("lazysusan.settings.v1")) localStorage.setItem("lazysusan.settings.v1", settings);
  }, JSON.stringify({ lang, players: [], sound: false, music: false, customPenalty: "" }));
const re = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
/** Every sheet is shut (one sheet opening another leaves two open for a moment). */
const closed = (page: Page) => page.waitForFunction(`!document.querySelector("dialog[open]")`);
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
  // (this walk takes the signal away on purpose, further down)
  watch(page, true);
  const findings: string[] = [];
  const button = (k: Word) => page.getByRole("button", { name: t(k), exact: true });

  let shots = 0;
  const shot = async (name: string, on: Page = page) => {
    shots++;
    await on.waitForTimeout(350);
    await on.screenshot({ path: join(out, `${name}-${lang}-${width}x${height}.png`) });
    const results = await new AxeBuilder({ page: on }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of results.violations) for (const n of v.nodes) findings.push(`${name}: axe ${v.impact} ${v.id} ${JSON.stringify(n.target)}`);
    const wide = await on.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const found: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > w + 0.5 || r.left < -0.5) && !el.closest(".ui-visually-hidden")) found.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return { scroll: document.documentElement.scrollWidth - w, found: found.slice(0, 4) };
    });
    if (wide.scroll > 0 || wide.found.length) findings.push(`${name}: wider than the phone by ${wide.scroll}px ${wide.found.join(" | ")}`);
    const small = await on.evaluate(() => {
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

  // the ⋯ sheet: the invitation, then the people
  await button("more").click();
  await shot("13-menu");
  await page.getByRole("button", { name: re(t("invite")) }).click();
  await page.getByRole("dialog").getByText(local ? t("inviteHow").split("\n")[0] : t("inviteNotYet")).waitFor();
  await shot("13c-invite");
  let invitation = "";
  if (local) {
    await page.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
    await shot("13d-invite-copied");
    invitation = (await page.evaluate(() => navigator.clipboard.readText())).split("\n").pop() ?? "";
    ok(/\/split\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/.test(invitation), `${lang} ${width}x${height}: 复制邀请链接 copies the ledger's address with its key after the #`);
  }
  await page.keyboard.press("Escape");
  await closed(page);
  if (local) {
    // as a phone shows it: phones have a share sheet of their own, which this browser doesn't, so two buttons sit side by side
    await page.evaluate("navigator.share = async () => {}");
    await button("more").click();
    await page.getByRole("button", { name: re(t("invite")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("sendInvite"), exact: true }).waitFor();
    await shot("13e-invite-phone");
    await page.getByRole("dialog").getByRole("button", { name: t("copyLink"), exact: true }).click();
    await shot("13f-invite-phone-copied");
    const tall = await page.evaluate(`[...document.querySelectorAll("dialog[open] .split-pair .ui-button")].map((b) => b.getBoundingClientRect().height)`) as number[];
    ok(tall.length === 2 && tall.every((h) => h < 56), `${lang} ${width}x${height}: 复制链接 and 发给朋友 sit side by side, each on one line (${tall.map(Math.round).join(", ")}px tall)`);
    await page.evaluate("delete navigator.share");
    await page.keyboard.press("Escape");
    await closed(page);
  }
  await button("more").click();
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

  // the server, when there is something to say about it (while all is well the pages above say nothing)
  if (local) {
    // no signal: what is recorded waits, and the page, the ⋯ sheet and the list say so
    await page.locator(".split-ledger").first().click();
    await button("addExpense").waitFor();
    await ctx.setOffline(true);
    await fill("12.50", null, "停车");
    await button("done").click();
    await page.locator(".split-page > .split-sync").waitFor({ timeout: 15_000 });
    await shot("26-unsent");
    await button("more").click();
    await shot("26b-menu-unsent");
    await page.keyboard.press("Escape");
    await closed(page);
    await button("back").click();
    await page.locator(".split-ledger-flag").waitFor();
    await shot("26c-ledgers-unsent");
    await ctx.setOffline(false);
    await page.evaluate("window.dispatchEvent(new Event('online'))");
    await page.locator(".split-ledger-flag").waitFor({ state: "detached", timeout: 15_000 });

    // changes that didn't stick, as another phone getting there first leaves them: each named, with why, until 知道了
    const kept = await keptBy(page);
    const [m0, m1] = kept.held[0].server.members;
    kept.held[0].lost = [
      { id: "lost-1", at: 1, change: { do: "expense", expense: { kind: "expense", id: "lost-e1", at: 1, payer: m0.id, amount: 18600, note: "晚饭，海鲜和两瓶酒，Wilhelmina 也来了", split: { how: "equal", among: [m0.id, m1.id] }, rot: 0 } } },
      { id: "lost-2", at: 2, change: { do: "rename", member: m1.id, name: "Wilhelmina Featherstone" } },
      { id: "lost-3", at: 3, change: { do: "transfer", transfer: { id: "lost-t1", at: 3, from: m1.id, to: m0.id, amount: 7750 } } },
      { id: "lost-4", at: 4, change: { do: "member", member: { id: "lost-m1", name: "老陈" } } },
      { id: "lost-5", at: 5, change: { do: "title", name: "x" } },
    ];
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEPT)}, ${JSON.stringify(JSON.stringify(kept))})`);
    await page.reload();
    await page.locator(".split-ledger-flag").waitFor();
    await shot("27-ledgers-lost");
    await page.locator(".split-ledger").first().click();
    await page.locator(".split-lost").waitFor();
    await shot("27b-lost");
    await page.getByRole("tab", { name: t("settle") }).click();
    await shot("27c-lost-settle");
    await button("gotIt").click();
    await page.locator(".split-lost").waitFor({ state: "detached" });
    await page.getByRole("tab", { name: t("expenses") }).click();
    await button("back").click();
    await button("start").waitFor();

    // today's allowance of new ledgers used up: said in the strong voice, on the page and in the ⋯ sheet
    await ctx.route("**/split/api/ledgers", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "limit" }) }) : route.fallback()));
    sheet = await startSheet("周二晚饭", "Steve", ["小王"]);
    await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
    await page.locator(".split-page > .split-sync.is-loud").waitFor();
    await shot("28-trouble");
    await button("more").click();
    await shot("28b-menu-trouble");
    await page.keyboard.press("Escape");
    await closed(page);
    await ctx.unroute("**/split/api/ledgers");
    await button("back").click();
    await button("start").waitFor();

    // someone else's phone, opening the invitation: asked which one they are, then in
    const guest = await phone(width, height, lang);
    await speak(guest, lang);
    const theirs = await guest.newPage();
    watch(theirs, true);
    let hold = false;
    await guest.route(API, async (route) => {
      // (held back while the page that waits for the server is looked at)
      while (hold) await new Promise((r) => setTimeout(r, 100));
      await route.fallback();
    });
    hold = true;
    await theirs.goto(invitation);
    await theirs.locator(".ui-skeleton-slow").waitFor({ timeout: 5000 });
    await shot("29-joining", theirs);
    hold = false;
    await theirs.locator(".split-who").waitFor();
    await shot("29b-who", theirs);
    await theirs.locator("#split-add-me").fill("Jason");
    await shot("29c-who-listed", theirs);
    await theirs.locator("#split-add-me").fill("Wilhelmina Featherstone");
    await shot("29d-who-new", theirs);
    await theirs.getByRole("button", { name: t("justLook"), exact: true }).click();
    await theirs.locator(".split-rows").first().waitFor();
    await shot("29e-just-looking", theirs);
    await theirs.reload();
    await theirs.locator(".split-who").getByRole("button", { name: re("小王") }).click();
    await theirs.locator(".split-standing").waitFor();
    await shot("29f-joined", theirs);
    // invitations that don't get in: a key that doesn't open the ledger, a ledger that isn't there, no signal
    await theirs.goto(invitation.replace(/#k=.{6}/, "#k=aaaaaa").replace(/\/split\/.{4}/, "/split/zzzz"));
    await theirs.getByText(t("joinGone")).waitFor();
    await shot("30-join-gone", theirs);
    const elsewhere = await phone(width, height, lang);
    await speak(elsewhere, lang);
    const other = await elsewhere.newPage();
    watch(other, true);
    await other.goto(invitation.replace(/#k=.{6}/, "#k=aaaaaa"));
    await other.getByText(t("joinKey")).waitFor();
    await shot("30b-join-key", other);
    await elsewhere.route(API, (route) => route.abort("internetdisconnected"));
    await other.goto(`${base}/split`);
    await other.goto(invitation);
    await other.getByText(t("joinAway")).waitFor();
    await shot("30c-join-away", other);
    await elsewhere.close();
    await guest.close();
  }

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
  // a ledger this phone opened and hasn't sent yet, with one expense whose typed parts can be made not to
  // add up, so the line that says so is on the screen too (its id and key are made up afresh each run)
  const id = randomBytes(16).toString("base64url");
  const saved = {
    held: [
      {
        key: randomBytes(32).toString("base64url"),
        made: false,
        seq: 0,
        server: { id, name: "惠斯勒周末", currency: "CAD", members: [{ id: "a", name: "Steve" }, { id: "b", name: "小王" }, { id: "c", name: "阿美" }], entries: [] },
        waiting: [{ id: "c1", at: 1, change: { do: "expense", expense: { kind: "expense", id: "e1", at: 1, payer: "a", amount: 10000, note: "x", split: { how: "exact", amounts: { a: 5000, b: 5000 } }, rot: 0 } } }],
        lost: [],
      },
    ],
    me: { [id]: "a" },
  };
  for (const lang of ["zh", "en"] as const) {
    for (const [w, h, phoneName] of sizes) {
      const ctx = await phone(w, h, lang);
      await speak(ctx, lang);
      await holding(ctx, saved);
      const page = await ctx.newPage();
      watch(page);
      await page.goto(`${base}/split/${id}`);
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
  const open = async (ctx: BrowserContext, signalMayGo?: boolean) => {
    const page = await ctx.newPage();
    watch(page, signalMayGo);
    await page.goto(`${base}/split`);
    await button(page, "start").waitFor();
    return page;
  };
  const amountShown = (page: Page) => page.locator(".split-add-amount output").textContent();
  const spend = async (page: Page, digits: string) => {
    await button(page, "addExpense").click();
    await type(page, digits);
    await button(page, "done").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
  };
  const amounts = async (page: Page) => (await page.locator(".split-row-amount").allTextContents()).join(" ");
  const rename = async (page: Page, who: string, to: string) => {
    await button(page, "more").click();
    await page.getByRole("button", { name: re(t("members")) }).click();
    await page.getByRole("dialog").getByText(t("addPerson")).waitFor();
    await page.getByRole("button", { name: re(`${t("renamePerson")} ${who}`) }).click();
    await page.getByRole("dialog").locator(".split-person-edit input").fill(to);
    await page.getByRole("dialog").locator(".split-person-edit").getByRole("button", { name: t("save"), exact: true }).click();
    await page.getByRole("dialog").locator(".split-person-edit").waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    await closed(page);
  };

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

  // what the first sample kept on the phone alone is not carried over (decided 2026-11-13)
  {
    const ctx = await phone(390, 664, "zh");
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem("planted")) return;
      sessionStorage.setItem("planted", "1");
      localStorage.setItem("changle.split.v1", JSON.stringify({ ledgers: [{ id: "old", name: "x", currency: "CAD", members: [{ id: "a", name: "A" }, { id: "b", name: "B" }], entries: [] }], me: {} }));
    });
    const page = await open(ctx);
    ok((await page.locator(".split-ledger").count()) === 0 && (await page.evaluate("localStorage.getItem('changle.split.v1')")) === null, "the first sample's ledgers, kept on the phone alone, are not carried over, and the old record is off the phone");
    await ctx.close();
  }

  // ---------- a ledger kept on the server (these need one: skipped away from this machine) ----------
  if (local) {
    // started here, kept there; no signal, and the signal back
    {
      const ctx = await phone(390, 664, "zh");
      const page = await open(ctx, true);
      await start(page);
      await spend(page, "30");
      await page.waitForTimeout(800);
      const id = path(page).split("/").pop() ?? "";
      const kept = (await keptBy(page)).held[0];
      const there = await onServer(page, id, kept.key);
      ok(kept.made && kept.waiting.length === 0 && there.seq === 1 && there.ledger.entries.length === 1 && there.ledger.members.length === 3, `a ledger started and an expense recorded are on the server a moment later (${there.ledger.entries.length} entry, change ${there.seq})`);
      ok((await syncSaid(page)) === null, "and the page says nothing about it: all is well");
      await button(page, "more").click();
      ok(await page.getByRole("dialog").getByText(W.synced.zh).isVisible(), "the ⋯ sheet, asked, says it is saved online");
      await page.keyboard.press("Escape");
      await closed(page);
      const wrong = await onServer(page, id, "x".repeat(43));
      ok(wrong.seq === -1 && wrong.ledger.name === "403", "and the server gives it to nobody without the key this phone keeps");

      await ctx.setOffline(true);
      await spend(page, "12");
      await spend(page, "7");
      ok((await amounts(page)) === "$7.00 $12.00 $30.00", "with no signal two more are recorded, and on the screen at once");
      await page.locator(".split-page > .split-sync").waitFor({ timeout: 15_000 });
      ok((await syncSaid(page)) === say("zh", "unsent", { n: 2 }) && !(await page.locator(".split-page > .split-sync.is-loud").count()), `a moment later the page says so, quietly (${await syncSaid(page)})`);
      ok((await page.locator(".split-figure").textContent())?.includes("$32.66"), "what you are owed counts them already");
      await button(page, "back").click();
      await page.locator(".split-ledger-flag").waitFor();
      ok((await page.locator(".split-ledger-flag").textContent()) === W.cardUnsent.zh, "and so does the ledger's card in the list");
      await page.locator(".split-ledger").click();
      await button(page, "addExpense").waitFor();
      await ctx.setOffline(false);
      await page.evaluate("window.dispatchEvent(new Event('online'))");
      await page.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 15_000 });
      await page.waitForTimeout(300);
      const after = await onServer(page, id, kept.key);
      ok(after.ledger.entries.length === 3 && new Set(after.ledger.entries.map((e) => e.id)).size === 3 && (await keptBy(page)).held[0].waiting.length === 0, `the signal back: both go up, each once, and the line goes away (${after.ledger.entries.length} entries on the server)`);
      await ctx.close();
    }

    // two phones on one ledger (the second holds it the way joining by a link will give it: with the same key)
    {
      const a = await phone(390, 664, "zh");
      const pa = await open(a, true);
      await start(pa, "两部手机", ["阿甲", "阿乙"]);
      await spend(pa, "30");
      await pa.waitForTimeout(600);
      const first = (await keptBy(pa)).held[0];
      const id = first.server.id;
      const b = await phone(390, 664, "zh");
      await holding(b, { held: [{ ...first, waiting: [], lost: [] }], me: { [id]: first.server.members[1].id } });
      const pb = await b.newPage();
      watch(pb, true);
      await pb.goto(`${base}/split/${id}`);
      await pb.locator(".split-row").first().waitFor();
      ok((await amounts(pb)) === "$30.00" && (await pb.locator(".split-standing-words").textContent()) === W.youOwe.zh, "a second phone holding the ledger's key opens it, and stands where its own owner stands (owing)");
      await spend(pa, "99");
      await pb.locator(".split-row-amount", { hasText: "$99.00" }).waitFor({ timeout: 5000 });
      await spend(pb, "5");
      await pa.locator(".split-row-amount", { hasText: "$5.00" }).waitFor({ timeout: 5000 });
      ok((await amounts(pa)) === (await amounts(pb)) && (await amounts(pa)) === "$5.00 $99.00 $30.00", `what one records the other sees without touching anything (${await amounts(pa)})`);

      // one of them loses its signal, renames someone and records an expense; meanwhile the other takes that name
      await b.setOffline(true);
      await rename(pb, "阿乙", "Zed");
      await spend(pb, "41");
      await rename(pa, "我", "Zed");
      await pa.waitForTimeout(400);
      await b.setOffline(false);
      await pb.evaluate("window.dispatchEvent(new Event('online'))");
      await pb.locator(".split-lost").waitFor({ timeout: 15_000 });
      const said = await pb.locator(".split-lost").innerText();
      ok(said.includes(W.lostOne.zh) && said.includes(say("zh", "lostRename", { who: "阿乙", name: "Zed" })) && said.includes(W.lostWhy.zh), `back with a signal, the phone that lost the name is told which change didn't stick, and why (${said.split("\n").filter(Boolean).slice(0, 2).join(" / ")})`);
      await pa.locator(".split-row-amount", { hasText: "$41.00" }).waitFor({ timeout: 5000 });
      const there = await onServer(pa, id, first.key);
      ok(there.ledger.members.map((m) => m.name).join() === "Zed,阿甲,阿乙" && there.ledger.entries.length === 4 && (await amounts(pa)) === (await amounts(pb)), "while the expense it recorded with no signal reached the server and the other phone, and both show the same ledger");
      await button(pb, "back").click();
      await pb.locator(".split-ledger-flag").waitFor();
      ok((await pb.locator(".split-ledger-flag").textContent()) === W.cardLost.zh, "the list flags the ledger that has something that didn't stick");
      await pb.locator(".split-ledger").click();
      await button(pb, "gotIt").click();
      await pb.locator(".split-lost").waitFor({ state: "detached" });
      await pb.reload();
      await pb.locator(".split-row").first().waitFor();
      ok((await pb.locator(".split-lost").count()) === 0, "知道了 puts the notice away, and it stays away after a reload");
      await a.close();
      await b.close();
    }

    // a day's allowance of new ledgers used up
    {
      const ctx = await phone(390, 664, "zh");
      await ctx.route("**/split/api/ledgers", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "limit" }) }) : route.fallback()));
      const page = await open(ctx, true);
      await start(page);
      await page.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 5000 });
      ok((await syncSaid(page)) === W.troubleLimit.zh, "the day's allowance of new ledgers used up: the page says so, in its strong voice");
      await spend(page, "8");
      ok((await amounts(page)) === "$8.00" && (await keptBy(page)).held[0].waiting.length === 1, "and the phone records all the same, keeping it for later");
      await ctx.unroute("**/split/api/ledgers");
      await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await page.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(300);
      const kept = (await keptBy(page)).held[0];
      const there = await onServer(page, kept.server.id, kept.key);
      ok(kept.made && kept.waiting.length === 0 && there.ledger.entries.length === 1, "the next day, the page back in front: the ledger is made and what was kept goes up");
      await ctx.close();
    }

    // an answer that isn't the server's
    {
      const ctx = await phone(390, 664, "zh");
      await ctx.route(API, (route) => route.fulfill({ status: 403, contentType: "text/html", body: "<html>Sign in to the hotel Wi-Fi</html>" }));
      const page = await open(ctx, true);
      await start(page);
      await page.locator(".split-page > .split-sync").waitFor({ timeout: 15_000 });
      ok((await syncSaid(page)) === W.notMade.zh && !(await page.locator(".split-page > .split-sync.is-loud").count()), "a refusal that isn't the server's (a hotel's sign-in page answering 403) is no signal, not a wrong key: the ledger waits");
      await ctx.unroute(API);
      await page.evaluate("window.dispatchEvent(new Event('online'))");
      await page.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 15_000 });
      ok((await keptBy(page)).held[0].made, "and is made when the real server answers");
      await ctx.close();
    }

    // an invitation: sent from one phone, opened on others
    {
      const a = await phone(390, 664, "zh");
      await a.grantPermissions(["clipboard-read", "clipboard-write"]);
      const pa = await open(a, true);
      await start(pa, "邀请", ["阿甲", "阿乙"]);
      await spend(pa, "30");
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("invite")) }).click();
      await pa.getByRole("dialog").getByText(t("inviteHow").split("\n")[0]).waitFor();
      const code = await pa.getByRole("dialog").locator(".split-qr svg").evaluate((svg) => ({ box: svg.getAttribute("viewBox") ?? "", squares: (svg.querySelector("path")?.getAttribute("d") ?? "").split("M").length - 1, name: svg.getAttribute("aria-label") }));
      ok(Number(code.box.split(" ")[2]) >= 21 && code.squares > 100 && code.name === t("qrLabel"), `the invitation shows a code to scan (${code.box.split(" ")[2]} squares wide)`);
      await pa.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
      await pa.getByRole("dialog").getByRole("button", { name: re(t("copied")) }).waitFor({ timeout: 2000 });
      const pasted = String(await pa.evaluate("navigator.clipboard.readText()")).split("\n");
      const link = pasted[pasted.length - 1];
      const mine = (await keptBy(pa)).held[0];
      ok(pasted.length === 2 && pasted[0] === say("zh", "inviteLine", { name: "邀请" }) && link === `${base}/split/${mine.server.id}#k=${mine.key}`, "复制邀请链接 copies a line saying what it is, then the ledger's address with its key after the #");
      await pa.keyboard.press("Escape");
      await closed(pa);

      // a friend opens it
      const b = await phone(390, 664, "zh");
      const pb = await b.newPage();
      watch(pb, true);
      const asked: string[] = [];
      pb.on("request", (r) => r.url().includes("/split/api/") && asked.push(r.url()));
      await pb.goto(link);
      await pb.locator(".split-who").waitFor({ timeout: 8000 });
      const theirs = await keptBy(pb);
      ok(theirs.held[0].key === mine.key && theirs.held[0].made && theirs.me[mine.server.id] === undefined, "opened on another phone: the ledger is read from the server and held there, and the page asks which one they are");
      ok(pb.url() === `${base}/split/${mine.server.id}` && asked.length > 0 && asked.every((u) => !u.includes(mine.key)), "the key is off the address once it is in, and was in no address the server was asked at");
      await pb.locator("#split-add-me").fill("阿乙");
      ok((await pb.locator("#split-add-me-note").textContent()) === t("nameListed") && (await pb.getByRole("button", { name: t("addMe"), exact: true }).isDisabled()), "typing a name that is on the list points back at the list");
      await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await pb.locator(".split-standing").waitFor();
      ok((await pb.locator(".split-standing-words").textContent()) === t("youOwe") && (await pb.locator(".split-figure").textContent())?.includes("$10.00"), "one tap on their name and they are in, seeing what they owe");
      await pb.reload();
      await pb.locator(".split-standing").waitFor();
      ok((await pb.locator(".split-who").count()) === 0, "a reload doesn't ask again");

      // another friend, whose chat app handed the address over with things of its own added
      const c = await phone(390, 664, "zh");
      const pc = await c.newPage();
      watch(pc, true);
      await pc.goto(link.replace("#", "/?from=singlemessage&isappinstalled=0#"));
      await pc.locator(".split-who").waitFor({ timeout: 8000 });
      ok(pc.url() === `${base}/split/${mine.server.id}`, "an address a chat app added to (a slash, a ?from=…) still gets in, and is tidied");
      await pc.locator("#split-add-me").fill("老陈");
      await pc.getByRole("button", { name: t("addMe"), exact: true }).click();
      await pc.locator(".split-standing").waitFor();
      await pa.locator(".split-standing-sub", { hasText: say("zh", "people", { n: 4 }) }).waitFor({ timeout: 5000 });
      ok((await pc.locator(".split-standing-lead").textContent()) === t("youSquare"), "someone the ledger didn't have adds themselves, is in, and the first phone sees four people");

      // only a look
      const d = await phone(390, 664, "zh");
      const pd = await d.newPage();
      watch(pd, true);
      await pd.goto(link);
      await pd.getByRole("button", { name: t("justLook"), exact: true }).click();
      await pd.locator(".split-row").first().waitFor();
      ok((await pd.locator(".split-standing-lead").textContent())?.includes("$30.00") && (await pd.locator(".split-standing-words").count()) === 0, "someone who only wants a look gets one: what was spent, and nothing about \"you\"");
      await pd.reload();
      ok(await pd.locator(".split-who").waitFor({ timeout: 8000 }).then(() => true, () => false), "and is asked again the next time");

      // the phone that sent it opens its own invitation
      await pa.goto(link);
      await pa.locator(".split-row").first().waitFor();
      await pa.waitForFunction("!location.hash");
      ok(pa.url() === `${base}/split/${mine.server.id}` && (await keptBy(pa)).held.length === 1, "a phone that already holds the ledger just opens it, and the key comes off the address");

      // the list asks after its ledgers
      await button(pb, "back").click();
      await pb.locator(".split-ledger-standing").waitFor();
      await spend(pa, "60");
      await pb.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      // 阿甲 owed a third of 30; the 60 is split among the four there are now
      const card = pb.locator(".split-ledger-standing", { hasText: "$25.00" });
      ok(await card.waitFor({ timeout: 8000 }).then(() => true, () => false), `on the list, a ledger's card says what you owe after what someone else recorded, without opening it (${(await pb.locator(".split-ledger-standing").first().textContent()) ?? ""})`);

      // invitations that don't get in
      const e = await phone(390, 664, "zh");
      const pe = await e.newPage();
      watch(pe, true);
      await pe.goto(`${base}/split/${mine.server.id}#k=${"a".repeat(43)}`);
      await pe.getByText(t("joinKey")).waitFor({ timeout: 8000 });
      ok((await keptBy(pe).catch(() => null))?.held.length !== 1, "a link whose key doesn't open the ledger says so, and leaves nothing on the phone");
      await pe.goto(`${base}/split`);
      await pe.goto(`${base}/split/${"z".repeat(22)}#k=${mine.key}`);
      await pe.getByText(t("joinGone")).waitFor({ timeout: 8000 });
      ok(true, "one to a ledger that isn't there says that");
      await e.route(API, (route) => route.abort("internetdisconnected"));
      await pe.goto(`${base}/split`);
      await pe.goto(link);
      await pe.getByText(t("joinAway")).waitFor({ timeout: 8000 });
      await e.unroute(API);
      await button(pe, "retry").click();
      await pe.locator(".split-who").waitFor({ timeout: 8000 });
      ok(true, "with no signal it says so and waits: 再试一次, with the signal back, gets in");
      for (const ctx of [a, b, c, d, e]) await ctx.close();
    }
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

// (ONLY=zh-320x568,en-390x664 walks just those two: quicker when one screen is being worked on)
const only = process.env.ONLY?.split(",");
if (what === "all" || what === "walk") for (const lang of ["zh", "en"] as const) for (const [w, h] of [[390, 844], [390, 664], [375, 553], [320, 568]]) if (!only || only.includes(`${lang}-${w}x${h}`)) await walk(lang, w, h);
if (what === "all" || what === "fits") await fits();
if (what === "all" || what === "behave") await behave();
ok(errors.length === 0, errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors anywhere");
await browser.close();
console.log(failed ? `\n${failed} FAILED (pictures in ${out})` : `\nall good (pictures in ${out})`);
process.exit(failed ? 1 : 0);
