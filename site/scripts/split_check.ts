/*
 * 两清 (changle.ca/split) in a phone-sized browser. With the site running (`npm run dev`) and 两清's
 * server beside it (in tools/split: `npm run dev -- --ip 127.0.0.1 --var ALLOW_TEST_SETTINGS:1`; a
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
 *                                           ones that don't get in, the list asking after its ledgers; an
 *                                           expense paid in another currency, changed, and with no rates to be had;
 *                                           signing in to start one, the account's ledgers on a second phone,
 *                                           taken off my ledgers, deleted for everyone, signed out, a sign-in
 *                                           that ran out; receipt photos
 *   npx tsx scripts/split_check.ts photos   behave's receipt photos alone: made smaller and kept on the server,
 *                                           seen on a friend's phone, taken off and changed back, sent and not
 *                                           kept, what can't go and why, ten at most, the back button; 照片空间
 *   npx tsx scripts/split_check.ts gate     stage two's gate, as far as this machine can take it: five phones on
 *                                           one ledger recording at once end up with the server's ledger, all
 *                                           five; three recorded with no signal and answers lost on the way back
 *                                           count once; one expense changed on two phones at once; one payment
 *                                           marked on both its people's phones with no signal is recorded once
 *   npx tsx scripts/split_check.ts read     a receipt read for its amount, by the stand-in for Google (the
 *                                           server run with --var FAKE_READ:1): read and said so, not read
 *                                           over what was typed, nothing on it, another currency, none to be had
 *   npx tsx scripts/split_check.ts friends  friends on changle.ca: picked while starting a ledger and invited
 *                                           as it is made, invited from the invitation, told in the chat; their
 *                                           invitations joined, turned down, and out of date once the link
 *                                           changed; signed out, a locked ledger, an account with no friends
 *
 * Options: --base http://127.0.0.1:5173 (a build: `npx vite preview`, then --base http://127.0.0.1:4173),
 * --out <folder for the pictures>. CHROME=/path/to/chrome uses that browser, else Playwright's own
 * (`npx playwright install chromium`).
 *
 * Nothing leaves the machine: the ledgers go to the server running on it, every phone here starts
 * with none, and the names in them are made up. The site's rooms server is never asked either:
 * each phone has a stand-in for it (rooms), with made-up exchange rates (RATES) and made-up
 * accounts. Starting a ledger needs a changle.ca sign-in, so the phones that start ledgers are
 * signed in, each as an account of its own that the local 两清 server knows too (its stand-in for
 * the rooms server, tools/split/tests/rooms). Pointed anywhere else (--base a preview, or
 * changle.ca), the server is left alone: every phone here is given no way to reach it, so it shows
 * what a phone with no signal shows, and the checks that need a server are skipped. This never
 * makes a ledger on the real server: its keys aren't kept, so it couldn't be deleted.
 *
 * (Inside page.evaluate, no named functions: tsx wraps them in a helper the page doesn't have.)
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDay } from "../src/split/format";
import { dayLabel } from "../src/split/lines";
import { say, W, type Word } from "../src/split/words";

type Lang = "zh" | "en";
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const what = args.find((a) => ["walk", "fits", "behave", "photos", "gate", "friends", "read", "view", "search", "pay", "kinds", "refund", "payers", "items"].includes(a)) ?? "all";
const base = flag("--base") ?? "http://127.0.0.1:5173";
const out = flag("--out") ?? join(tmpdir(), "split-check");
mkdirSync(out, { recursive: true });
/** Is the site on this machine? Only then is its server one this may make ledgers on. */
const local = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname);
if (!local) console.log(`${base} is not this machine: its server is left alone (every phone here has no signal), and the checks that need one are skipped\n`);
const API = "**/split/api/**";
const KEPT = "changle.split.v2";
/** Where the site asks for exchange rates (the rooms server, src/tools/fx.ts), and what these phones are told instead: so many of each for one US dollar. */
const FX = /\/api\/fx$/;
const RATES = { CAD: 1.4012, CNY: 7.1, USD: 1, HKD: 7.8, EUR: 0.92, GBP: 0.79, JPY: 153.6, KRW: 1389.5, TWD: 32.3, SGD: 1.34, AUD: 1.52 };
/** Where the site keeps the last rates it was given. */
const FX_KEPT = "changle.fx.v1";

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) failed++;
  console.log(cond ? "ok  " : "FAIL", msg);
};
/** The fields named in `want` are what `got` has (in any order), and it has none of them missing. */
const eqJson = (got: Record<string, unknown>, want: Record<string, unknown>, msg: string) => {
  const pick = JSON.stringify(Object.fromEntries(Object.keys(want).map((k) => [k, got[k]])));
  ok(pick === JSON.stringify(want), `${msg}${pick === JSON.stringify(want) ? "" : ` → ${pick}`}`);
};
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {});
const errors: string[] = [];
/** A browser says so in its console when a request fails. Where a check takes the signal away on purpose, that is expected. */
const noSignal = /Failed to load resource|WebSocket connection to|ERR_INTERNET_DISCONNECTED/;
const watch = (page: Page, signalMayGo = !local) => {
  page.on("console", (m) => m.type() === "error" && !(signalMayGo && noSignal.test(m.text())) && errors.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e}`));
};
/** The site's own address: anything a page asks for at /api/ anywhere else is the rooms server's. */
const site = new URL(base).origin;
/**
 * A changle.ca account of a phone's own: "test-account-" and this is its session
 * (tools/split/tests/accounts.ts). Its name there is what follows the "_" (Check); and every
 * account is in a circle of its own (what comes before the "_"), whose other accounts are its
 * friends: both rooms servers, the stand-in here and the one beside 两清's server, say so.
 */
const anAccount = (name = "Check") => `ck${randomBytes(6).toString("hex")}_${name}`;
const sessionOf = (account: string) => `test-account-${account}`;
/** Who else is in an account's circle: its friends on changle.ca, by the name after the "_" in their account, and the name they go by there. */
const CAST: [string, string][] = [
  ["Amy", "阿美"],
  ["Wang", "小王"],
  ["Jason", "Jason"],
  ["Li", "小李"],
  ["Mia", "Mia"],
];
const circleOf = (account: string) => account.slice(0, account.indexOf("_"));
/** A friend of `account`'s, by the name after the "_" in theirs. */
const friendOf = (account: string, name: string) => `${circleOf(account)}_${name}`;
/** The account as the rooms server describes it to its own phone (src/account/AccountContext.tsx, SelfUser). */
const userOf = (account: string) => ({ id: account, name: "Check", city: "", gender: "", bio: "", av: 0, ac: 2, handle: account, since: 0, email: "check@example.com", phone: "", admin: false });
/** The messages phones sent in the site's chat, to whom and what: an invitation's friend is told there. */
const chats: { from: string; to: string; body: string }[] = [];
/** Where the site keeps who is signed in on a phone (src/lib/api.ts, src/account/AccountContext.tsx). */
const SESSION = "changle.session";
const ME = "changle.me";
/**
 * The rooms server (site/worker), as these phones see it: a stand-in, so the real one is never
 * asked. The site is open, no sign-in is kept in a cookie, today's rates are RATES, and every
 * "test-account-…" session is that account. Signing in through the site's own sheet signs the
 * phone in as a new account of its own. Anything else asked of it is a finding.
 */
const rooms = async (ctx: BrowserContext) => {
  await ctx.route(
    (url) => url.origin !== site && url.pathname.startsWith("/api/"),
    (route) => {
      const req = route.request();
      const at = new URL(req.url()).pathname;
      const who = /^Bearer test-account-([A-Za-z0-9_-]{7,60})$/.exec(req.headers().authorization ?? "")?.[1];
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (at === "/api/status") return json(200, { paused: false });
      if (at === "/api/fx") return json(200, { rates: RATES, at: Date.now() - 3_600_000, source: "check" });
      // the owner's changes to the site's words (src/lib/copy.ts): none, so every page says what the code does
      if (at === "/api/copy" && req.method() === "GET") return json(200, { zh: {}, en: {} });
      if (at === "/api/auth/restore") return route.fulfill({ status: 204 });
      if (at === "/api/auth/keep" || at === "/api/auth/logout") return json(200, { ok: true });
      if (at === "/api/me" && req.method() === "GET") return who ? json(200, { user: userOf(who) }) : json(401, { error: "signin" });
      if (at === "/api/auth/code") return json(200, { sent: true, dev: "123456" });
      // an account's friends: the others in its circle (an account with none has none)
      if (at === "/api/friends" && req.method() === "GET") {
        if (!who) return json(401, { error: "signin" });
        const friends = who.includes("_") ? CAST.map(([key, name], i) => ({ id: friendOf(who, key), name, city: "", gender: "", bio: "", av: 0, ac: i + 3, handle: key, since: 0, last: null, unread: 0 })).filter((f) => f.id !== who) : [];
        return json(200, { friends, incoming: [], outgoing: [], blocked: [] });
      }
      const chat = /^\/api\/chat\/([A-Za-z0-9_-]+)$/.exec(at)?.[1];
      if (chat && req.method() === "POST") {
        if (!who) return json(401, { error: "signin" });
        const body = String((req.postDataJSON() as { body?: unknown } | null)?.body ?? "");
        chats.push({ from: who, to: chat, body });
        return json(200, { message: { id: chats.length, from: who, body, at: Date.now(), read: false } });
      }
      if (at === "/api/auth/verify") {
        const account = anAccount();
        return json(200, { token: sessionOf(account), user: userOf(account) });
      }
      errors.push(`a page asked the rooms server for ${req.method()} ${at}, which these checks have no stand-in for`);
      return route.abort("failed");
    },
  );
  // (the live line a signed-in page keeps open: it hears nothing, and answers a ping)
  await ctx.routeWebSocket(
    (url) => url.origin.replace(/^ws/, "http") !== site && url.pathname === "/api/live",
    (ws) => ws.onMessage((m) => m === "ping" && ws.send("pong")),
  );
};
const phone = async (width: number, height: number, lang: Lang, motion: "reduce" | "no-preference" = "reduce", video?: string) => {
  // (`video`: a folder the phone's screen is recorded into, as a film, until it is closed)
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: lang === "zh" ? "zh-CN" : "en-CA",
    reducedMotion: motion,
    serviceWorkers: "block",
    // (filmed at the screen's own size: a film is made of the page as CSS draws it, not of the phone's pixels)
    ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}),
  });
  await rooms(ctx);
  if (!local) {
    await ctx.route(API, (route) => route.abort("internetdisconnected"));
    await ctx.routeWebSocket(/\/split\/api\//, (ws) => void ws.close());
  }
  await ctx.route("https://open.er-api.com/**", (route) => route.abort("internetdisconnected"));
  return ctx;
};
const signedIn = new WeakSet<BrowserContext>();
/**
 * This phone is signed in to changle.ca from its first page on, as `account` (a new one of its own
 * unless given): what the site keeps on a phone that is. Once: signing out on it later stays so.
 */
const signIn = async (ctx: BrowserContext, account = anAccount()) => {
  signedIn.add(ctx);
  await ctx.addInitScript(
    ([s, session, m, me]) => {
      try {
        if (localStorage.getItem("check.signed")) return;
        localStorage.setItem("check.signed", "1");
        localStorage.setItem(s, session);
        localStorage.setItem(m, me);
      } catch {
        /* (a page with no storage of its own) */
      }
    },
    [SESSION, sessionOf(account), ME, JSON.stringify(userOf(account))] as const,
  );
  return account;
};
/** The site's own sign-in sheet, open on the page: an email, the code (the stand-in's comes filled in), and signed in as a new account. */
const viaSheet = async (page: Page, lang: Lang) => {
  await page.locator("#si-email").fill("check@example.com");
  await page.getByRole("button", { name: lang === "zh" ? "发验证码" : "Send me a code", exact: true }).click();
  await page.getByRole("button", { name: lang === "zh" ? "确认" : "Confirm", exact: true }).click();
  await page.locator("#si-email, .otp-input").waitFor({ state: "detached" });
};
/** Who the page is signed in as, by what the site keeps (null: nobody). */
const signedAs = async (page: Page) => /^test-account-(.+)$/.exec(String(await page.evaluate(`localStorage.getItem(${JSON.stringify(SESSION)})`)))?.[1] ?? null;
/** Signed out, as the site does it (what it keeps of the sign-in comes off the phone), or signed in again as `account`; then the page loaded afresh. */
const signTo = async (page: Page, account: string | null) => {
  await page.evaluate(
    account
      ? `localStorage.setItem(${JSON.stringify(SESSION)}, ${JSON.stringify(sessionOf(account))}); localStorage.setItem(${JSON.stringify(ME)}, ${JSON.stringify(JSON.stringify(userOf(account)))})`
      : `localStorage.removeItem(${JSON.stringify(SESSION)}); localStorage.removeItem(${JSON.stringify(ME)})`,
  );
  await page.reload();
};
/** The signed-in account's ledgers as the server keeps them ("my ledgers"), asked for with the page's sign-in. */
const myLedgers = async (page: Page) =>
  (await page.evaluate(`fetch("/split/api/me/ledgers", { headers: { authorization: "Bearer " + localStorage.getItem(${JSON.stringify(SESSION)}) } }).then((r) => (r.ok ? r.json() : { ledgers: [] }))`)) as { ledgers: { id: string; key: string; owner?: string; me?: string }[] };
/** From here on this phone gets no rates from anywhere, and has none kept. */
const noRates = async (ctx: BrowserContext, page: Page) => {
  await ctx.route(FX, (route) => route.abort("internetdisconnected"));
  await page.evaluate(`localStorage.removeItem(${JSON.stringify(FX_KEPT)})`);
};
/** What a phone keeps of its ledgers (src/split/store.ts). */
type Kept = { held: { key: string; owner?: string; next?: string; acct?: string; made: boolean; seq: number; server: { id: string; name: string; members: { id: string; name: string }[]; entries: unknown[] }; waiting: unknown[]; lost: unknown[] }[]; me: Record<string, string> };
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
// 记一笔's note is in the 详情 sheet, which the line under 分摊 opens (Steve, 2026-11-19)
const detailsLine = (page: Page) => page.locator(".split-details-line");
const noteInSheet = (page: Page) => page.locator("dialog[open] .split-details > label.split-field:first-child input");
async function setNote(page: Page, text: string | ((was: string) => string)) {
  await detailsLine(page).click();
  const field = noteInSheet(page);
  await field.waitFor();
  await field.fill(typeof text === "string" ? text : text(await field.inputValue()));
  await page.keyboard.press("Escape");
  await closed(page);
}
async function noteOf(page: Page) {
  await detailsLine(page).click();
  const field = noteInSheet(page);
  await field.waitFor();
  const note = await field.inputValue();
  await page.keyboard.press("Escape");
  await closed(page);
  return note;
}
/** A ledger just started comes up with its invitation open: closed, for what comes next. */
const pastInvite = async (page: Page) => {
  await page.locator("dialog[open] .split-invite-all").waitFor();
  await page.keyboard.press("Escape");
  await closed(page);
};
const key = (page: Page, d: string) => (d === "+" ? page.locator(".split-key.is-plus") : page.locator(".split-key", { hasText: new RegExp(`^${d === "." ? "\\." : d}$`) })).click();
const type = async (page: Page, digits: string) => {
  for (const d of digits) await key(page, d);
};
const path = (page: Page) => new URL(page.url()).pathname;
/**
 * A receipt as a phone's camera takes one (3024 by 4032, a few MB): a JPEG drawn in the page, so the
 * page's own shrinking has a real photo to make smaller. `mark` is printed on it, to tell two apart.
 */
const receipt = async (page: Page, mark = "1", width = 3024, height = 4032) =>
  Buffer.from(
    String(
      await page.evaluate(`(async () => {
        const w = ${width}, h = ${height};
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext("2d");
        g.fillStyle = "#efe9dc"; g.fillRect(0, 0, w, h);
        // (a camera's noise, so the JPEG is as big as a photo's)
        for (let i = 0; i < 9000; i++) { g.fillStyle = "rgba(60,50,40," + (Math.random() * 0.25) + ")"; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 6 + Math.random() * 30); }
        g.fillStyle = "#2a2622"; g.textAlign = "center"; g.font = "bold " + Math.round(w / 11) + "px sans-serif";
        g.fillText("CAFE ${mark}", w / 2, h * 0.12);
        g.textAlign = "left"; g.font = Math.round(w / 20) + "px monospace";
        ["2 x Poutine     24.00", "1 x Burger      18.50", "3 x Beer        27.00", "Tax              9.10", "TOTAL           78.60"].forEach((l, i) => g.fillText(l, w * 0.1, h * (0.3 + i * 0.09)));
        const b = await c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
        const bytes = new Uint8Array(await b.arrayBuffer());
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      })()`),
    ),
    "base64",
  );
/** A PDF, as far as its first bytes go (the server looks at those). */
const aPdf = (mark = "1") => Buffer.from(`%PDF-1.7\n% invoice ${mark}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
/** A ledger's photos as the server lists them, asked for with the key. */
const filesOn = async (page: Page, id: string, key: string) =>
  (await page.evaluate(`fetch("/split/api/ledgers/${id}/files", { headers: { "x-split-key": ${JSON.stringify(key)} } }).then((r) => (r.ok ? r.json() : { files: [], status: r.status }))`)) as { files: { id: string; size: number; type: string }[]; status?: number };

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
        // (hidden on purpose, as the photo picker a button opens: nothing to press)
        if (el.closest(".ui-visually-hidden")) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) found.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return found;
    });
    for (const s of small) findings.push(`${name}: smaller than 44px: ${s}`);
  };

  /** 开一个账本's sheet, filled in (`press`: opened by its button; or already open) */
  const startSheet = async (name: string, me: string, others: string[], currency?: string, press = true) => {
    if (press) await button("start").click();
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
    if (note) await setNote(page, note);
  };

  await page.goto(`${base}/split`);
  await button("startSignIn").waitFor();
  await shot("01-empty");
  // starting one needs a sign-in: the button opens the site's own sheet, and signed in, the sheet it was pressed for opens
  await button("startSignIn").click();
  await page.locator("#si-email").waitFor();
  await shot("01b-sign-in");
  await viaSheet(page, lang);
  await page.getByRole("dialog").locator("#split-who-else").waitFor();
  ok(!!(await signedAs(page)), `${lang} ${width}x${height}: signed in from 两清's list, 开一个账本 opens by itself`);
  await page.keyboard.press("Escape");
  await closed(page);
  await shot("01c-empty-signed-in");
  let sheet = await startSheet("惠斯勒周末", "Steve", ["小王", "阿美", "Jason", "小李"]);
  // a friend on changle.ca, picked: the name typed is them now, and they get an invitation as it starts
  await sheet.getByRole("button", { name: "Jason", exact: true, pressed: false }).click();
  await sheet.getByText(t("pickedNote").split("\n")[0]).waitFor();
  await shot("02-start");
  await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
  // it comes up with its invitation open: the friend picked is invited as soon as the server has the ledger
  if (local) {
    await page.locator("dialog[open] .split-person", { hasText: "Jason" }).getByRole("button", { name: t("friendInvited"), exact: true }).waitFor({ timeout: 15_000 });
    await page.locator("dialog[open] .split-qr").waitFor();
  } else await page.locator("dialog[open] .split-invite-all").waitFor();
  await shot("02b-started");
  if (local) {
    const me = (await signedAs(page)) ?? "";
    const told = chats.filter((c) => c.from === me && c.to === friendOf(me, "Jason"));
    ok(told.length === 1 && told[0].body.includes("惠斯勒周末") && told[0].body.includes("changle.ca/split"), `${lang} ${width}x${height}: the friend picked is told in the site's chat, once: the ledger's name, and where to find it`);
    const jasonsId = (await keptBy(page)).held[0].server.members.find((m) => m.name === "Jason")?.id;
    const waiting = (await page.evaluate(`fetch("/split/api/me/invites", { headers: { authorization: "Bearer ${sessionOf(friendOf(me, "Jason"))}" } }).then((r) => r.json())`)) as { invites: { name: string; member?: string; from: { name: string } }[] };
    ok(waiting.invites.length === 1 && waiting.invites[0].name === "惠斯勒周末" && waiting.invites[0].member === jasonsId && waiting.invites[0].from.name === "Check", `${lang} ${width}x${height}: and the invitation waits in their account, from Check, for the Jason in the ledger`);
  }
  await page.keyboard.press("Escape");
  await closed(page);
  if (local) {
    // the friend picked when the ledger started, on their own phone: the invitation waits on their
    // page of ledgers; 加入, and the ledger opens, with them as the Jason in it, nothing asked
    const me = (await signedAs(page)) ?? "";
    const jasons = await phone(width, height, lang);
    await speak(jasons, lang);
    await signIn(jasons, friendOf(me, "Jason"));
    const jp = await jasons.newPage();
    watch(jp, true);
    await jp.goto(`${base}/split`);
    await jp.locator(".split-invitation").waitFor();
    await shot("14b-invitation", jp);
    await jp.locator(".split-invitation").getByRole("button", { name: t("inviteJoin"), exact: true }).click();
    await jp.locator(".split-crew").waitFor();
    const theirs = await keptBy(jp);
    const there = theirs.held.find((h) => h.server.name === "惠斯勒周末");
    ok(!!there && theirs.me[there.server.id] === there.server.members.find((m) => m.name === "Jason")?.id, `${lang} ${width}x${height}: 加入 opens the ledger on the friend's phone, as the Jason in it, without asking`);
    await shot("14c-invitation-joined", jp);
    await jp.goto(`${base}/split`);
    await jp.locator(".split-ledger").first().waitFor();
    await jp.waitForTimeout(800);
    ok((await jp.locator(".split-invitation").count()) === 0, `${lang} ${width}x${height}: and the invitation is used up: the ledger is on their list instead`);
    await jasons.close();
  }
  await button("addExpense").waitFor();
  await shot("03-ledger-empty");
  await page.getByRole("tab", { name: t("settle") }).click();
  await shot("03b-settle-empty");
  await page.getByRole("tab", { name: t("expenses") }).click();

  // a new expense with nothing typed: the line saying a receipt fills it in, and the screen still whole
  await button("addExpense").click();
  await page.locator(".split-add-hint").waitFor({ timeout: 8000 });
  const fit = (await page.evaluate(`(() => ({ scrolls: document.scrollingElement.scrollHeight - innerHeight, key: document.querySelector(".split-key").getBoundingClientRect().height }))()`)) as { scrolls: number; key: number };
  // (shorter than 535 the page scrolls on purpose: split.css)
  ok(height < 535 || (fit.scrolls <= 0 && fit.key >= 44), `${lang} ${width}x${height}: a new expense says a receipt fills it in, and nothing scrolls, keys ${Math.round(fit.key)}px`);
  await shot("04-add-hint");
  await button("close").first().click();
  await page.locator(".split-keys").waitFor({ state: "hidden" });

  // the plan's three expenses
  await fill("186", "小王", "晚饭");
  await shot("04-add");
  await button("done").click();
  await fill("120", null, "油费");
  await button("done").click();
  // (breakfast typed as two amounts, with the keypad's +: it comes to the same $81.50)
  await fill("60+21.50", "阿美", "早餐");
  await shot("04b-add-sum");
  const summed = { figure: await page.locator(".split-add-amount .split-figure").innerText(), line: await page.locator(".split-add-sum").innerText(), keys: await page.locator(".split-key").count() };
  ok(summed.figure === "$81.50" && summed.line === "$60 + $21.50" && summed.keys === 13, `${lang} ${width}x${height}: 60 + 21.50 on the keypad comes to ${summed.figure}, the amounts under it (${summed.line}), thirteen keys`);
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
  // 每个人 (2026-11-26): everyone's sums under the plan; a row opens that person's statement, whose last line is the row's
  const everyone = page.locator(".split-people .split-row");
  await page.getByRole("heading", { name: t("eachPerson"), exact: true }).evaluate((h) => h.scrollIntoView({ block: "start" }));
  await shot("11b2-everyone");
  const rowSays = ((await everyone.first().locator(".split-row-amount").innerText()) ?? "").replace(/\s+/g, " ").trim();
  await everyone.first().click();
  const statement = page.getByRole("dialog").locator(".split-statement");
  await statement.waitFor();
  await shot("11b3-statement");
  const totalSays = ((await statement.locator(".is-total").innerText()) ?? "").replace(/\s+/g, " ").trim();
  ok((await everyone.count()) >= 3 && rowSays.length > 0 && totalSays === rowSays, `${lang} ${width}x${height}: 每个人 has a row each, and a statement ends where its row stands (${rowSays})`);
  await page.keyboard.press("Escape");
  await closed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  // the plan as a picture, for the group chat: as this browser has it (no share sheet: the picture is saved as a file)
  await button("sendPicture").click();
  const picture = page.getByRole("dialog").locator(".split-picture img");
  await picture.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot("11c-picture");
  const png = (await picture.evaluate((img) => ({ src: (img as HTMLImageElement).src, w: (img as HTMLImageElement).naturalWidth, h: (img as HTMLImageElement).naturalHeight }))) as { src: string; w: number; h: number };
  ok(png.src.startsWith("data:image/png;base64,") && png.w === 1080 && png.h > 1000, `${lang} ${width}x${height}: 结清图 is a PNG 1080 wide (${png.w}x${png.h}), saved beside the screens`);
  writeFileSync(join(out, `11e-picture-image-${lang}-${width}x${height}.png`), Buffer.from(png.src.slice(png.src.indexOf(",") + 1), "base64"));
  await page.getByRole("dialog").getByRole("button", { name: re(t("copyAsText")) }).click();
  await shot("11d-picture-copied");
  ok((await page.evaluate(() => navigator.clipboard.readText())).split("\n").length === 5, `${lang} ${width}x${height}: 复制成文字 copies the name and four transfers`);
  await page.keyboard.press("Escape");
  await closed(page);
  // as a phone has it: a share sheet of its own
  await page.evaluate("navigator.share = async () => {}; navigator.canShare = () => true");
  await button("sendPicture").click();
  await page.getByRole("dialog").getByRole("button", { name: t("pictureShare"), exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot("11f-picture-phone");
  await page.evaluate("delete navigator.share; delete navigator.canShare");
  await page.keyboard.press("Escape");
  await closed(page);
  // the picture out of date (here the phone's note of it is made to say other transfers; behave records a real expense)
  await page.evaluate(`(() => { const k = ${JSON.stringify(KEPT)}; const s = JSON.parse(localStorage.getItem(k)); for (const id in s.pictures) s.pictures[id].print = "x"; localStorage.setItem(k, JSON.stringify(s)); window.dispatchEvent(new StorageEvent("storage", { key: k })); })()`);
  await page.locator(".split-stale").waitFor();
  await shot("11g-picture-stale");
  await button("sendPicture").click();
  await picture.waitFor({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await closed(page);
  ok((await page.locator(".split-stale").count()) === 0, `${lang} ${width}x${height}: a new picture made, the settle tab no longer says it is out of date`);
  // 查看链接 (Steve, 2026-11-23): beside 把结清图发到群里, on one line with it, as tall as it is
  const dock = await page.evaluate(() => {
    const row = document.querySelector(".split-dock .split-dock-row");
    const pill = row?.querySelector(".split-view-button");
    const big = row?.querySelector(".ui-button");
    const label = pill?.querySelector(".split-view-label");
    if (!pill || !big || !label) return null;
    const [p, b] = [pill.getBoundingClientRect(), big.getBoundingClientRect()];
    const shown = label.getBoundingClientRect().width > 1;
    // how many lines each one's words take: the tops of the boxes its text is drawn in
    // (no named functions in here: the page has none of the helpers tsx would wrap them in)
    const lines = [label, big].map((el) => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
      }
      return tops.size;
    });
    return { top: Math.abs(p.top - b.top), tall: Math.abs(p.height - b.height), lines: [shown ? lines[0] : 1, lines[1]], shown, h: Math.round(b.height) };
  });
  ok(!!dock && dock.top < 1 && dock.tall < 1 && dock.lines.every((n) => n === 1), `${lang} ${width}x${height}: 查看链接 sits beside 发结清图, as tall (${dock?.h}px), each on one line (${dock?.lines.join(", ")} lines${dock?.shown ? "" : "; 查看链接 its link alone"})`);
  await button("viewLink").click();
  let viewing = "";
  if (local) {
    await page.getByRole("dialog").getByRole("button", { name: t("copyLink"), exact: true }).waitFor({ timeout: 15_000 });
    await shot("11h-view-link");
    await page.getByRole("dialog").getByRole("button", { name: t("copyLink"), exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    viewing = copied.split("\n").pop() ?? "";
    ok(copied.startsWith(`${say(lang, "viewLine", { name: "惠斯勒周末" })}\n`) && /\/split\/[A-Za-z0-9_-]{22}#v=[A-Za-z0-9_-]{43}$/.test(viewing), `${lang} ${width}x${height}: 复制链接 copies what it is, then the ledger's address with the link's own key after the #`);
  } else {
    await page.getByRole("dialog").getByText(t("viewLinkNotYet")).waitFor();
    await shot("11h-view-link-not-yet");
  }
  await page.keyboard.press("Escape");
  await closed(page);
  if (local) {
    // as a phone shows it (a share sheet of its own): 复制链接 and 发到群里 side by side, each on one line
    await page.evaluate("navigator.share = async () => {}");
    await button("viewLink").click();
    await page.getByRole("dialog").getByRole("button", { name: t("sendViewLink"), exact: true }).waitFor({ timeout: 15_000 });
    await shot("11h2-view-link-phone");
    const tall = (await page.evaluate(`[...document.querySelectorAll("dialog[open] .split-pair .ui-button")].map((b) => b.getBoundingClientRect().height)`)) as number[];
    ok(tall.length === 2 && tall.every((h) => h < 56), `${lang} ${width}x${height}: 复制链接 and 发到群里 sit side by side, each on one line (${tall.map(Math.round).join(", ")}px tall)`);
    await page.evaluate("delete navigator.share");
    await page.keyboard.press("Escape");
    await closed(page);
  }
  if (local) {
    // the link opened on a phone that isn't in the ledger: the ledger to look at, and nothing on the page changes it
    const v = await phone(width, height, lang);
    await speak(v, lang);
    const looker = await v.newPage();
    watch(looker, true);
    await looker.goto(viewing);
    await looker.locator(".split-viewing").waitFor({ timeout: 15_000 });
    await shot("11i-viewing", looker);
    const seen = await looker.evaluate(() => ({
      title: document.querySelector(".split-page h1, .split-page .split-bar-title")?.textContent ?? "",
      rows: document.querySelectorAll(".split-row").length,
      buttons: [...document.querySelectorAll(".split-panel button, .split-dock button")].map((b) => b.textContent),
      address: location.hash.startsWith("#v="),
    }));
    ok(seen.title.includes("惠斯勒周末") && seen.rows > 0 && seen.buttons.length === 0 && seen.address && (await looker.getByRole("button", { name: t("addExpense") }).count()) === 0 && (await looker.getByRole("button", { name: t("more") }).count()) === 0, `${lang} ${width}x${height}: 查看链接 opens the ledger, its name and ${seen.rows} rows, with nothing to press in the list and no 记一笔 or ⋯ (the link stays in the address)`);
    await looker.getByRole("tab", { name: t("settle") }).click();
    await looker.locator("#split-settle .split-row").first().waitFor();
    await shot("11j-viewing-settle", looker);
    await looker.locator("#split-settle .split-row").first().click();
    await looker.getByRole("dialog").getByRole("button", { name: re(t("copyAmount")) }).waitFor();
    await shot("11k-viewing-step", looker);
    const step = looker.getByRole("dialog");
    ok((await step.getByRole("button", { name: t("markPaid") }).count()) === 0 && (await step.getByRole("button", { name: t("undoPaid") }).count()) === 0 && (await step.getByText(new RegExp(`^(${re(t("viewOnlyPaid")).source}|${re(t("paid")).source})$`)).count()) === 1, `${lang} ${width}x${height}: a transfer opened by 查看链接 can be copied, not marked (and says who marks it)`);
    await v.close();
  }

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

    // the owner's two (this phone started the ledger). Locked: every screen can be read, and nothing on it changes the ledger
    await button("more").click();
    await page.getByRole("button", { name: re(t("lockIt")) }).click();
    await page.getByRole("button", { name: re(t("unlockIt")) }).waitFor();
    await shot("31-menu-locked");
    await page.getByRole("button", { name: re(t("members")) }).click();
    await page.getByRole("dialog").getByText(t("lockedPeople")).waitFor();
    await shot("31b-people-locked");
    await page.keyboard.press("Escape");
    await closed(page);
    await shot("31c-settle-locked");
    // (a transfer nobody has marked yet: it can be looked at, its amount copied, and that is all)
    await page.locator(".split-row", { hasNotText: t("paid") }).first().click();
    await page.getByRole("dialog").getByText(t("locked")).waitFor();
    await shot("31d-step-locked");
    await page.keyboard.press("Escape");
    await closed(page);
    await page.getByRole("tab", { name: t("expenses") }).click();
    await shot("31e-ledger-locked");
    ok((await button("addExpense").count()) === 0 && (await page.locator("button.split-row").count()) === 0 && (await page.locator(".split-row.is-still").count()) > 0, `${lang} ${width}x${height}: locked, the ledger has no 记一笔 and its rows don't open`);
    await page.goto(`${base}/split`);
    await page.locator(".split-ledger-flag").waitFor();
    await shot("31f-ledgers-locked");
    await page.locator(".split-ledger").first().click();
    await button("more").click();
    await page.getByRole("button", { name: re(t("unlockIt")) }).click();
    await page.getByRole("button", { name: re(t("lockIt")) }).waitFor();
    // a new key for the invitation: asked about first, then the new code and link
    await page.getByRole("button", { name: re(t("rekey")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).waitFor();
    await shot("32-rekey-ask");
    await page.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).click();
    await page.getByRole("dialog").getByText(t("rekeyDone")).waitFor({ timeout: 8000 });
    await shot("32b-rekey-done");
    await page.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
    const renewed = (await page.evaluate(() => navigator.clipboard.readText())).split("\n").pop() ?? "";
    ok(renewed !== invitation && renewed.split("#")[0] === invitation.split("#")[0] && /#k=[A-Za-z0-9_-]{43}$/.test(renewed), `${lang} ${width}x${height}: 换邀请链接 leaves the ledger's address as it was and gives it another key`);
    invitation = renewed;
    await page.keyboard.press("Escape");
    await closed(page);
    // the owner's third: deleting the ledger for everyone, asked about first
    await button("more").click();
    await page.getByRole("button", { name: re(t("eraseIt")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("eraseYes"), exact: true }).waitFor();
    await shot("35-erase-ask");
    await page.getByRole("dialog").getByRole("button", { name: t("keep"), exact: true }).click();
    await page.keyboard.press("Escape");
    await closed(page);
    await page.getByRole("tab", { name: t("settle") }).click();
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
  // (signed in, once the server has it the ledger is in the account's ledgers, and comes off those)
  await page.getByRole("button", { name: re(t(local ? "removeMine" : "deleteLedger")) }).click();
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
  // its note changed, for the record to say what changed; and, where there is a server to keep them, a receipt's photo and a PDF on it
  await page.locator(".split-row").first().click();
  await setNote(page, (was) => `${was}和酒`);
  const picker = page.locator(".split-note-row input[type=file]");
  if (local) {
    await picker.setInputFiles({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: await receipt(page) });
    await page.locator(".split-photo-button img").waitFor({ timeout: 20_000 });
    await shot("16c-edit-photo");
    await page.locator(".split-photo-button").click();
    await page.locator(".split-photo-tile img").waitFor();
    await shot("16d-photos");
    await page.locator(".split-photo-tile").first().click();
    await page.locator(".split-photo-whole img").waitFor();
    await shot("16e-photo-whole");
    const whole = (await page.locator(".split-photo-whole img").evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight])) as number[];
    ok(whole.join("x") === "1200x1600", `${lang} ${width}x${height}: a camera's photo of a receipt goes 1600 on its long side (${whole.join("x")})`);
    await page.keyboard.press("Escape");
    await page.locator(".split-photo-tile").first().waitFor();
    await page.locator("dialog[open] input[type=file]").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: aPdf() });
    await page.locator(".split-photo-tile .split-thumb.is-pdf").waitFor({ timeout: 20_000 });
    await shot("16f-photos-two");
    await page.locator(".split-photo-tile").nth(1).click();
    await page.getByRole("dialog").getByRole("button", { name: t("photoOpen"), exact: true }).waitFor();
    await shot("16g-photo-pdf");
    await page.keyboard.press("Escape");
    await page.locator(".split-photo-tile").first().waitFor();
    await page.keyboard.press("Escape");
    await closed(page);
    await page.locator(".split-photo-count").waitFor();
    await shot("16h-edit-photos");
  } else {
    // (no server to keep it: said at once)
    await picker.setInputFiles({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: await receipt(page) });
    await page.locator(".ui-toast", { hasText: t("photoNotYet") }).waitFor();
    await shot("16c-photo-not-yet");
  }
  await button("saveChanges").click();
  await page.locator(".split-keys").waitFor({ state: "hidden" });
  if (local) ok((await page.locator(".split-row .lucide-paperclip").count()) === 1, `${lang} ${width}x${height}: saved, the expense's row has a paperclip`);

  // a receipt read for its amount (the server reads with its stand-in for Google here: FAKE_READ),
  // being read and read; then closed without recording it
  if (local) {
    await button("addExpense").click();
    let hold = true;
    const at = "**/split/api/ledgers/*/files/*/read";
    await ctx.route(at, async (route) => {
      while (hold) await new Promise((r) => setTimeout(r, 100));
      await route.fallback();
    });
    await page.locator(".split-note-row input[type=file]").setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:42.50 CAD Tim Hortons") });
    await page.locator(".split-add-read", { hasText: t("readingReceipt") }).waitFor({ timeout: 15_000 });
    await shot("16m-read-busy");
    hold = false;
    await page.locator(".split-add-extras", { hasText: "Tim Hortons" }).waitFor({ timeout: 15_000 });
    await shot("16n-read-done");
    ok((await page.locator(".split-add-amount output").textContent()) === "$42.50", `${lang} ${width}x${height}: the receipt read fills in the amount`);
    await ctx.unroute(at);
    await button("close").first().click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
  }

  // 照片空间 (signed in, in ⋯): how much of the room the photos take, and where they are
  const openStorage = async () => {
    await button("more").click();
    await page.getByRole("dialog").getByRole("button", { name: re(t("storage")) }).click();
  };
  await openStorage();
  if (local) {
    await page.locator(".split-storage-used").waitFor({ timeout: 10_000 });
    await shot("16i-storage");
    // (and as the server would say it weeks on: most of the room used, photos no expense uses, clearing them)
    const MB = 1024 * 1024;
    const here = path(page).split("/").pop()!;
    const nothing = { count: 0, bytes: 0 };
    const weeksOn = { used: 412 * MB, quota: 500 * MB, unused: { count: 3, bytes: 2 * MB }, ledgers: [{ id: "a-ledger-elsewhere", count: 1_300, bytes: 400 * MB, unused: nothing }, { id: here, count: 14, bytes: 12 * MB, unused: { count: 3, bytes: 2 * MB } }] };
    await page.route("**/split/api/me/files", (route) => route.fulfill({ json: weeksOn }));
    await page.route("**/split/api/me/files/unused", (route) => route.fulfill({ json: { ...weeksOn, used: 410 * MB, unused: nothing, ledgers: [weeksOn.ledgers[0], { id: here, count: 11, bytes: 10 * MB, unused: nothing }] } }));
    await page.keyboard.press("Escape");
    await closed(page);
    await openStorage();
    await page.locator(".split-storage-ledgers").getByText(t("storageElsewhere")).waitFor();
    await shot("16j-storage-unused");
    await page.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).click();
    await page.getByRole("dialog").getByText(t("storageClearAsk")).waitFor();
    await shot("16k-storage-ask");
    await page.getByRole("dialog").getByRole("button", { name: t("storageClearYes"), exact: true }).click();
    await page.getByRole("dialog").locator(".split-note", { hasText: say(lang, "storageCleared", { mb: "2" }) }).waitFor();
    await shot("16l-storage-cleared");
    await page.unroute("**/split/api/me/files");
    await page.unroute("**/split/api/me/files/unused");
  } else {
    await page.getByRole("dialog").getByText(t("storageAway")).waitFor();
    await shot("16i-storage-away");
  }
  await page.keyboard.press("Escape");
  await closed(page);

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

  // the record: what was done, by whom, when; with no server to ask, what this phone has waiting, and why there is no more
  await button("more").click();
  await page.getByRole("button", { name: re(t("history")) }).click();
  const record = page.getByRole("dialog").locator(".split-history-line").first();
  await record.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot(local ? "37-history" : "37-history-unreached");
  ok((await page.getByRole("dialog").getByRole("button", { name: t("revert"), exact: true }).count()) === 1 && (await page.getByRole("dialog").getByText(t("historyEdit").split("{")[0], { exact: false }).count()) >= 1, `${lang} ${width}x${height}: 改动记录 has the note's change, and offers to change it back`);
  await page.keyboard.press("Escape");
  await closed(page);

  // 导出账目: what the file holds; this browser saves it, a phone shares it
  await button("more").click();
  await page.getByRole("button", { name: re(t("export")) }).click();
  await page.getByRole("dialog").getByRole("button", { name: t("exportSave"), exact: true }).waitFor();
  await shot("38-export");
  await page.keyboard.press("Escape");
  await closed(page);
  await page.evaluate("navigator.share = async () => {}; navigator.canShare = () => true");
  await button("more").click();
  await page.getByRole("button", { name: re(t("export")) }).click();
  await page.getByRole("dialog").getByRole("button", { name: t("exportShare"), exact: true }).waitFor();
  await shot("38b-export-phone");
  await page.evaluate("delete navigator.share; delete navigator.canShare");
  await page.keyboard.press("Escape");
  await closed(page);
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
    // taking it off my ledgers needs the server: with no signal, nothing changes, and the sheet says so
    await page.getByRole("button", { name: re(t("removeMine")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("removeMineYes"), exact: true }).click();
    await page.getByRole("dialog").locator(".split-note", { hasText: t("removeFailed") }).waitFor({ timeout: 20_000 });
    await shot("26d-remove-failed");
    await page.keyboard.press("Escape");
    await closed(page);
    // the record needs the server too: it says so, with what this phone has waiting under it
    await button("more").click();
    await page.getByRole("button", { name: re(t("history")) }).click();
    await page.getByRole("dialog").getByText(t("historyFailed")).waitFor({ timeout: 20_000 });
    await shot("26e-history-failed");
    ok((await page.getByRole("dialog").getByText(t("notSentYet"), { exact: false }).count()) >= 1, `${lang} ${width}x${height}: with no signal, 改动记录 says it can't be read, and shows what is waiting on this phone`);
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
    // (its invitation can't be ready: the sheet says why, and is closed)
    await page.getByRole("dialog").getByText(t("inviteNotYet")).waitFor();
    await page.keyboard.press("Escape");
    await closed(page);
    await page.locator(".split-page > .split-sync.is-loud").waitFor();
    await shot("28-trouble");
    await button("more").click();
    await shot("28b-menu-trouble");
    await page.keyboard.press("Escape");
    await closed(page);
    await ctx.unroute("**/split/api/ledgers");
    await button("back").click();
    await button("start").waitFor();

    // the sign-in ran out before the ledger could go up: said in the strong voice, with the sign-in one tap away
    await ctx.route("**/split/api/ledgers", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "signin" }) }) : route.fallback()));
    sheet = await startSheet("周三午饭", "Steve", ["小王"]);
    await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
    await page.getByRole("dialog").getByText(t("inviteNotYet")).waitFor();
    await page.keyboard.press("Escape");
    await closed(page);
    await page.locator(".split-sync-act").waitFor();
    await shot("28c-signin");
    await button("more").click();
    await page.getByRole("dialog").getByRole("button", { name: t("signIn"), exact: true }).waitFor();
    await shot("28d-menu-signin");
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
    // (joined signed out: not the owner, and the ledger is that phone's alone)
    await theirs.getByRole("button", { name: t("more"), exact: true }).click();
    await theirs.getByRole("dialog").getByRole("button", { name: re(t("deleteLedger")) }).click();
    await theirs.getByRole("dialog").getByRole("button", { name: t("deleteYes"), exact: true }).waitFor();
    await shot("29g-menu-guest", theirs);
    await theirs.getByRole("dialog").getByRole("button", { name: t("keep"), exact: true }).click();
    await theirs.keyboard.press("Escape");
    await closed(theirs);
    // the receipts on a friend's phone: seen with the key; adding one needs a sign-in
    await theirs.locator("button.split-row:has(.lucide-paperclip)").click();
    await theirs.locator(".split-photo-button img").waitFor({ timeout: 15_000 });
    await shot("29h-friend-photo", theirs);
    await theirs.locator(".split-photo-button").click();
    await theirs.getByRole("dialog").getByText(t("photoSignIn")).waitFor();
    await theirs.locator(".split-photo-tile img").waitFor();
    await shot("29i-friend-photos", theirs);
    await theirs.keyboard.press("Escape");
    await closed(theirs);
    await theirs.getByRole("button", { name: t("close"), exact: true }).first().click();
    await theirs.locator(".split-keys").waitFor({ state: "hidden" });

    // the owner locks the ledger: a friend's phone says so, and has nothing to press; someone new can still say who they are
    await page.locator(".split-ledger", { hasText: "惠斯勒周末" }).click();
    await button("more").click();
    await page.getByRole("button", { name: re(t("lockIt")) }).click();
    await page.getByRole("button", { name: re(t("unlockIt")) }).waitFor();
    await theirs.locator(".split-page > .split-sync").waitFor({ timeout: 8000 });
    await shot("33-locked-friend", theirs);
    const late = await phone(width, height, lang);
    await speak(late, lang);
    const latecomer = await late.newPage();
    watch(latecomer, true);
    await latecomer.goto(invitation);
    await latecomer.getByText(t("whoLocked")).waitFor({ timeout: 8000 });
    await shot("33b-who-locked", latecomer);
    await late.close();
    // opened again, and then a new key: the friend's phone is shut out, and says what puts it right
    await page.getByRole("button", { name: re(t("unlockIt")) }).click();
    await page.getByRole("button", { name: re(t("lockIt")) }).waitFor();
    await page.getByRole("button", { name: re(t("rekey")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).click();
    await page.getByRole("dialog").getByText(t("rekeyDone")).waitFor({ timeout: 8000 });
    await page.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
    invitation = (await page.evaluate(() => navigator.clipboard.readText())).split("\n").pop() ?? "";
    await page.keyboard.press("Escape");
    await closed(page);
    await theirs.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 15_000 });
    await shot("34-key-changed", theirs);
    {
      // the 查看链接 made with the old key: changing the key turned it off too
      const v = await phone(width, height, lang);
      await speak(v, lang);
      const looker = await v.newPage();
      watch(looker, true);
      await looker.goto(viewing);
      await looker.getByText(t("viewGone")).waitFor({ timeout: 15_000 });
      await shot("34c-view-gone", looker);
      await v.close();
    }
    await theirs.goto(invitation);
    await theirs.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 8000 });
    ok((await theirs.locator(".split-standing").count()) === 1, `${lang} ${width}x${height}: a friend shut out by a new key opens the new invitation and is in again`);
    await button("back").click();
    await button("start").waitFor();
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

    // its owner deletes the ledger: gone from the owner's list, and a friend's page says so
    await theirs.goto(invitation);
    await theirs.locator(".split-standing").waitFor();
    await page.locator(".split-ledger", { hasText: "惠斯勒周末" }).click();
    await button("more").click();
    await page.getByRole("button", { name: re(t("eraseIt")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: t("eraseYes"), exact: true }).click();
    await page.getByText(t("erased")).waitFor({ timeout: 8000 });
    await shot("36-erased");
    await theirs.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 15_000 });
    await shot("36b-erased-friend", theirs);
    await guest.close();
  }

  // yen (no decimals), the longest names, the most an entry can be
  sheet = await startSheet("Hokkaido ski trip with the whole office", "Bartholomew-Alexander", ["Wilhelmina Featherstone", "欧阳娜娜的朋友小明同学"], lang === "zh" ? "日元" : "JPY");
  await shot("19-start-long");
  await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
  await pastInvite(page);
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

  // another currency: the button in the corner, the currencies, what the amount comes to, the rate
  await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(page);
  await button("close").first().click();
  await button("back").click();
  await button("start").waitFor();
  sheet = await startSheet(lang === "zh" ? "东京五天" : "Five days in Tokyo", lang === "zh" ? "我" : "Me", lang === "zh" ? ["小王", "阿美"] : ["Wang", "Mei"]);
  await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
  await pastInvite(page);
  const cur = (zh: string, code: string) => page.getByRole("dialog").getByRole("button", { name: lang === "zh" ? zh : code, exact: true });
  const corner = page.locator(".split-currency button");
  const comes = page.locator(".split-add-comes");
  const whole = async (what: string) => {
    const m = (await page.evaluate(`(() => { const t = document.querySelector(".split-bar-title"); return { cut: t.scrollWidth - t.clientWidth, scrolls: document.scrollingElement.scrollHeight - innerHeight, key: document.querySelector(".split-key").getBoundingClientRect().height }; })()`)) as { cut: number; scrolls: number; key: number };
    // (shorter than 535 the page scrolls on purpose: split.css)
    ok(m.cut <= 0 && (height < 535 || (m.scrolls <= 0 && m.key >= 44)), `${lang} ${width}x${height}: ${what}: the title shows whole, nothing scrolls, keys ${Math.round(m.key)}px${m.cut > 0 ? `, but the title is cut by ${m.cut}px` : ""}${m.scrolls > 0 ? `, but the page scrolls ${m.scrolls}px` : ""}`);
  };
  await button("addExpense").click();
  await type(page, "86.40");
  await corner.click();
  await cur("美元", "USD").waitFor();
  await shot("40-currencies");
  await cur("美元", "USD").click();
  await closed(page);
  await comes.waitFor();
  await shot("41-abroad");
  await whole("paid in another currency");
  await comes.click();
  await page.getByRole("dialog").locator("input").waitFor();
  await shot("42-rate");
  await page.getByRole("dialog").locator("input").fill("1.38");
  await shot("42b-rate-typed");
  await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(page);
  await page.getByRole("button", { name: re(t("sharedBy")) }).click();
  await shot("43-share-abroad");
  await page.getByRole("radio", { name: t("amounts"), exact: true }).click();
  await page.getByRole("dialog").locator(".split-person-field input").first().fill("40");
  await shot("43b-amounts-abroad");
  await page.getByRole("radio", { name: t("evenly"), exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(page);
  await button("done").click();
  await button("addExpense").waitFor();
  await shot("44-ledger-abroad");
  await page.locator("button.split-row").first().click();
  await comes.waitFor();
  await shot("45-edit-abroad");
  await whole("an expense paid in another currency, being changed (the currency and the bin share the corner)");
  await button("close").first().click();
  await button("addExpense").click();
  await comes.waitFor();
  await shot("46-next-abroad");
  await corner.click();
  await cur("日元", "JPY").click();
  await closed(page);
  await type(page, "9999999999");
  await shot("47-yen-most");
  await whole("the most yen there can be");
  for (let i = 0; i < 10; i++) await page.locator(".split-key.is-back").click();
  await corner.click();
  await cur("韩元", "KRW").click();
  await closed(page);
  await type(page, "1");
  await page.locator(".split-add-comes.is-loud").waitFor();
  await shot("48-too-little");
  // no rates to be had (the screen is opened afresh: it had today's from the last sheet)
  await button("close").first().click();
  await noRates(ctx, page);
  await button("addExpense").click();
  await type(page, "20");
  await corner.click();
  await cur("欧元", "EUR").click();
  await closed(page);
  await page.locator(".split-add-comes.is-loud").waitFor({ timeout: 20_000 });
  await shot("49-needs-rate");
  await comes.click();
  await page.getByRole("dialog").locator("input").waitFor();
  await shot("49b-rate-none");

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
      // (signed in: a ledger is made on the server only for a phone that is)
      await signIn(ctx);
      await holding(ctx, saved);
      const page = await ctx.newPage();
      watch(page);
      await page.goto(`${base}/split/${id}`);
      await page.locator(".split-row").first().click();
      await page.locator(".split-key").first().waitFor();
      for (let i = 0; i < 4; i++) await page.locator(".split-key.is-back").click(); // 100.00 becomes 10
      await page.waitForTimeout(200);
      const m = (await page.evaluate(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        return {
          scrolls: document.scrollingElement.scrollHeight - window.innerHeight,
          linesEnd: Math.round(box(".split-note-row").bottom),
          keysStart: Math.round(box(".split-keys").top),
          key: Math.round(box(".split-key").height),
          said: !!document.querySelector(".split-field strong svg"),
        };
      })()`)) as { scrolls: number; linesEnd: number; keysStart: number; key: number; said: boolean };
      ok(m.scrolls <= 0 && m.linesEnd <= m.keysStart && m.key >= 44 && m.said, `${lang} ${w}x${h} (${phoneName}): 记一笔 shows whole, keys ${m.key}px tall, ${m.keysStart - m.linesEnd}px to spare${m.scrolls > 0 ? `, but the page scrolls ${m.scrolls}px` : ""}${m.said ? "" : ", but it doesn't say the parts don't add up"}`);
      await page.screenshot({ path: join(out, `fits-${lang}-${w}x${h}.png`) });
      // the same expense paid in another currency: a line more under the amount, and the screen is an expense being changed, so the currency and the bin share the corner
      await page.locator(".split-currency button").click();
      await page.getByRole("dialog").getByRole("button", { name: lang === "zh" ? "美元" : "USD", exact: true }).click();
      await closed(page);
      await page.locator(".split-add-comes").waitFor();
      await page.waitForTimeout(200);
      const a = (await page.evaluate(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const title = document.querySelector(".split-bar-title");
        return {
          scrolls: document.scrollingElement.scrollHeight - window.innerHeight,
          linesEnd: Math.round(box(".split-note-row").bottom),
          keysStart: Math.round(box(".split-keys").top),
          key: Math.floor(box(".split-key").height),
          line: Math.floor(box(".split-add-comes").height),
          cut: title.scrollWidth - title.clientWidth,
        };
      })()`)) as { scrolls: number; linesEnd: number; keysStart: number; key: number; line: number; cut: number };
      ok(a.scrolls <= 0 && a.linesEnd <= a.keysStart && a.key >= 44 && a.line >= 44 && a.cut <= 0, `${lang} ${w}x${h} (${phoneName}): paid in another currency it still shows whole, keys ${a.key}px tall, the amount and its line ${a.line}px to press${a.scrolls > 0 ? `, but the page scrolls ${a.scrolls}px` : ""}${a.cut > 0 ? `, but the title is cut by ${a.cut}px` : ""}`);
      await page.screenshot({ path: join(out, `fits-abroad-${lang}-${w}x${h}.png`) });
      await ctx.close();
    }
  }
}

// ---------- what behave and gate share: a phone in 中文 ----------
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
  await pastInvite(page);
  await button(page, "addExpense").waitFor();
};
/** 两清's list on a phone signed in (starting a ledger needs that); `signed` false: one that isn't */
const open = async (ctx: BrowserContext, signalMayGo?: boolean, signed = true) => {
  if (signed && !signedIn.has(ctx)) await signIn(ctx);
  const page = await ctx.newPage();
  watch(page, signalMayGo);
  await page.goto(`${base}/split`);
  await button(page, signed ? "start" : "startSignIn").waitFor();
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

// ---------- photos: receipt photos, part of behave (and alone: `photos`) ----------
/** Receipt photos: made smaller and kept on the server, on a friend's phone too; taken off, changed back; what can't go, and why. */
async function photos() {
  const until = async (check: () => Promise<boolean>, ms = 10_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) if (await check()) return true;
    return false;
  };
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "小票", ["阿甲"]);
  await spend(pa, "78.60");
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0 && JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made`);
  const kept = (await keptBy(pa)).held[0];
  const id = kept.server.id;
  const listed = async () => (await filesOn(pa, id, kept.key)).files;
  const kept1 = async () => ((await onServer(pa, id, kept.key)).ledger.entries as { files?: string[] }[])[0]?.files ?? [];
  const sheetNote = (page: Page) => page.locator("dialog[open] .split-photos-foot [role=status]");
  /** The next photo this phone sends waits at the door: what comes back lets it through, once it has come. */
  const holdNext = async () => {
    const at = `**/split/api/ledgers/${id}/files/*`;
    let came!: () => void;
    let go!: () => void;
    const arrived = new Promise<void>((r) => (came = r));
    const through = new Promise<void>((r) => (go = r));
    await a.route(at, async (route) => {
      if (route.request().method() === "PUT") {
        came();
        await through;
      }
      await route.fallback();
    });
    return async () => {
      await arrived;
      go();
      await a.unroute(at);
    };
  };

  // the camera, pressed with nothing on the expense yet: the phone's picker, straight away; busy while it goes
  await pa.locator("button.split-row").first().click();
  let release = await holdNext();
  const choosing = pa.waitForEvent("filechooser");
  await pa.locator(".split-photo-button").click();
  const original = await receipt(pa, "A");
  await (await choosing).setFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: original });
  await pa.locator(".split-photo-button[aria-busy=true] .ui-button-progress").waitFor();
  ok(await button(pa, "saveChanges").isDisabled(), "the camera with no photo yet opens the phone's picker; while the photo goes, the button turns and 改好了 waits");
  await release();
  await pa.locator(".split-photo-button img").waitFor({ timeout: 20_000 });
  const [jpeg] = await listed();
  const served = (await pa.evaluate(`fetch("/split/api/ledgers/${id}/files/${jpeg?.id}", { headers: { "x-split-key": ${JSON.stringify(kept.key)} } }).then(async (r) => { const b = await r.blob(); const i = await createImageBitmap(b); return { type: r.headers.get("content-type"), csp: r.headers.get("content-security-policy") ?? "", sniff: r.headers.get("x-content-type-options"), size: b.size, w: i.width, h: i.height }; })`)) as { type: string; csp: string; sniff: string; size: number; w: number; h: number };
  ok(jpeg?.type === "image/jpeg" && served.w === 1200 && served.h === 1600 && served.size === jpeg.size && served.size < original.length / 2 && served.csp.includes("sandbox") && served.sniff === "nosniff", `the server keeps it as the phone made it: a JPEG ${served.w}x${served.h}, ${Math.round(served.size / 1024)} KB of the camera's ${Math.round(original.length / 1024)} KB, given back only to be looked at`);
  ok((await kept1()).length === 0, "and the expense has no photo until 改好了");
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok(await until(async () => (await kept1()).join() === jpeg?.id), "改好了: the expense keeps the photo's id on the server");
  ok((await pa.locator("button.split-row .lucide-paperclip").count()) === 1 && (await pa.locator("button.split-row").first().textContent())?.includes(t("photoMark")), "and its row has a paperclip, which a screen reader reads");

  // a friend's phone (joined by the link, signed out): sees it, and adding one needs a sign-in, which the sheet gives
  const b = await phone(390, 664, "zh");
  const pb = await b.newPage();
  watch(pb, true);
  await pb.goto(`${base}/split/${id}#k=${kept.key}`);
  await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
  // (signed out, a new expense doesn't say a receipt fills it in: reading one needs a sign-in)
  await button(pb, "addExpense").click();
  await pb.locator(".split-keys").waitFor();
  await pb.waitForTimeout(300);
  ok((await pb.locator(".split-add-hint").count()) === 0, "a friend's phone, signed out: a new expense doesn't say a receipt fills it in (reading one needs a sign-in)");
  await button(pb, "close").first().click();
  await pb.locator(".split-keys").waitFor({ state: "hidden" });
  await pb.locator("button.split-row:has(.lucide-paperclip)").click();
  await pb.locator(".split-photo-button img").waitFor({ timeout: 15_000 });
  await pb.locator(".split-photo-button").click();
  await pb.getByRole("dialog").getByText(t("photoSignIn")).waitFor();
  ok((await pb.locator("dialog[open] .split-photo-tile img").count()) === 1 && (await pb.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("addPhoto"), exact: true }).count()) === 0, "a friend's phone, signed out, sees the photo with the key; the sheet says adding one needs a sign-in, and has no button for it");
  // (closed without signing in, it stays closed)
  await pb.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("signIn"), exact: true }).click();
  await closed(pb);
  await pb.locator("#si-email").waitFor();
  await pb.keyboard.press("Escape");
  await pb.locator("#si-email").waitFor({ state: "detached" });
  await pb.waitForTimeout(500);
  ok((await pb.locator("dialog[open]").count()) === 0 && (await pb.locator(".split-keys").isVisible()), "登录 in the sheet, the sign-in closed without signing in: back on the expense, the sheet stays closed");
  await pb.locator(".split-photo-button").click();
  await pb.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("signIn"), exact: true }).click();
  await closed(pb);
  await viaSheet(pb, "zh");
  await pb.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("addAnother"), exact: true }).waitFor();
  ok(true, "登录 there: the sheet gives way to the site's sign-in, and once signed in it is back, with 再加一张");
  const pdf = aPdf("B");
  const fromSheet = pb.waitForEvent("filechooser");
  await pb.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("addAnother"), exact: true }).click();
  await (await fromSheet).setFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: pdf });
  await pb.locator("dialog[open] .split-photo-tile .split-thumb.is-pdf").waitFor({ timeout: 15_000 });
  // the PDF opens in the phone's own viewer
  await pb.locator("dialog[open] .split-photo-tile").nth(1).click();
  const viewer = b.waitForEvent("page");
  await pb.getByRole("dialog").getByRole("button", { name: t("photoOpen"), exact: true }).click();
  const shown = await viewer;
  ok(shown.url().startsWith("blob:"), `再加一张 opens the picker from the sheet; a PDF goes as it is, and 打开 PDF opens it in a tab of its own (${shown.url().slice(0, 5)})`);
  await shown.close();
  await pb.keyboard.press("Escape");
  await pb.locator("dialog[open] .split-photo-tile").first().waitFor();
  await pb.keyboard.press("Escape");
  await closed(pb);
  await button(pb, "saveChanges").click();
  await pb.locator(".split-keys").waitFor({ state: "hidden" });
  const theirs = (await pb.evaluate(`fetch("/split/api/me/files", { headers: { authorization: "Bearer " + localStorage.getItem(${JSON.stringify(SESSION)}) } }).then((r) => r.json())`)) as { used: number; ledgers: { id: string; count: number }[] };
  ok(await until(async () => (await kept1()).length === 2), "saved on the friend's phone, the expense keeps both");
  ok(theirs.used === pdf.length && theirs.ledgers[0]?.id === id && theirs.ledgers[0]?.count === 1, `and the PDF takes the friend's room, not the owner's (${theirs.used} bytes)`);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].server.entries[0].files?.length === 2`, null, { timeout: 10_000 });
  await pa.locator("button.split-row").first().click();
  await pa.locator(".split-photo-count", { hasText: "2" }).waitFor({ timeout: 10_000 });
  ok(true, "the owner's phone has the friend's PDF too, without touching anything");

  // taken off: off the expense, still on the server (改回去 brings it back), and the record says so
  await pa.locator(".split-photo-button").click();
  await pa.locator("dialog[open] .split-photo-tile").nth(1).click();
  await pa.getByRole("dialog").getByRole("button", { name: t("photoRemove"), exact: true }).click();
  await pa.locator("dialog[open] .split-photo-tile").first().waitFor();
  ok((await pa.locator("dialog[open] .split-photo-tile").count()) === 1, "去掉这张 takes it off the sheet");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok(await until(async () => (await kept1()).length === 1), "saved, the expense keeps the one");
  ok((await listed()).length === 2, "and the PDF stays on the server: the record can bring it back");
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("history")) }).click();
  await pa.getByRole("dialog").getByText(t("historyFilesRemoved")).waitFor({ timeout: 10_000 });
  await pa.getByRole("dialog").getByRole("button", { name: t("revert"), exact: true }).first().click();
  ok(await until(async () => (await kept1()).length === 2), "改动记录 says a photo was taken off; 改回去 puts it back on the expense");
  await pa.keyboard.press("Escape");
  await closed(pa);

  // sent and never saved: gone from the server again, however the screen is left
  await pa.locator("button.split-row").first().click();
  await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "C", 900, 1200) });
  await pa.locator(".split-photo-count", { hasText: "3" }).waitFor({ timeout: 15_000 });
  ok((await listed()).length === 3, "a third photo goes to the server as it is chosen");
  await button(pa, "close").first().click();
  ok(await until(async () => (await listed()).length === 2), "the screen closed without 改好了: it goes from the server again");
  await pa.locator("button.split-row").first().click();
  await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_0003.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "D", 900, 1200) });
  await pa.locator(".split-photo-count", { hasText: "3" }).waitFor({ timeout: 15_000 });
  await pa.locator(".split-photo-button").click();
  await pa.locator("dialog[open] .split-photo-tile").nth(2).click();
  await pa.getByRole("dialog").getByRole("button", { name: t("photoRemove"), exact: true }).click();
  ok(await until(async () => (await listed()).length === 2), "one sent and taken off again before saving goes at once");
  await pa.keyboard.press("Escape");
  await closed(pa);
  // (and one still on its way when the screen closes, as it lands)
  release = await holdNext();
  await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_0004.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "E", 900, 1200) });
  await pa.locator(".split-photo-button[aria-busy=true]").waitFor();
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  await release();
  await pa.waitForTimeout(1500);
  ok((await listed()).length === 2 && (await kept1()).length === 2, "one still on its way when the screen closed goes again once it lands; the expense keeps its two");

  // what can't go, said in the sheet while it is open (a toast would be under it), and nothing is sent
  await pa.locator("button.split-row").first().click();
  await pa.locator(".split-photo-button").click();
  const sheetPicker = pa.locator("dialog[open] input[type=file]");
  const said = async (file: { name: string; mimeType: string; buffer: Buffer }, word: Word) => {
    await sheetPicker.setInputFiles(file);
    await sheetNote(pa).filter({ hasText: W[word].zh }).waitFor({ timeout: 15_000 });
    return (await pa.locator(".ui-toast").count()) === 0;
  };
  const before = (await listed()).length;
  ok(await said({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just words") }, "photoBad"), "a file that is neither a photo nor a PDF: said in the sheet, in its strong voice");
  ok(await said({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.concat([aPdf("F"), Buffer.alloc(10 * 1024 * 1024)]) }, "photoBig"), "a PDF over 10 MB: said in the sheet");
  await a.setOffline(true);
  ok(await said({ name: "IMG_0005.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "G", 600, 800) }, "photoAway"), "no signal: said in the sheet");
  await a.setOffline(false);
  ok((await listed()).length === before, "and none of the three went to the server");
  // the server's own refusals (made up here: this server has room for them all)
  const refuse = async (status: number, error: string) =>
    a.route(`**/split/api/ledgers/${id}/files/*`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error }) }) : route.fallback()));
  await refuse(413, "quota");
  ok(await said({ name: "IMG_0006.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "H", 600, 800) }, "photoQuota"), "the account's 500 MB used up: said in the sheet");
  await a.unroute(`**/split/api/ledgers/${id}/files/*`);
  await refuse(429, "limit");
  ok(await said({ name: "IMG_0007.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "I", 600, 800) }, "photoLimit"), "today's 200 sent: said in the sheet");
  await a.unroute(`**/split/api/ledgers/${id}/files/*`);
  await refuse(401, "signin");
  await sheetPicker.setInputFiles({ name: "IMG_0008.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "J", 600, 800) });
  await pa.locator("dialog[open] .split-photos-foot").getByRole("button", { name: t("signIn"), exact: true }).waitFor({ timeout: 15_000 });
  ok((await pa.locator("dialog[open] .split-photos-foot").getByText(t("photoSignIn")).count()) === 1, "the sign-in run out on the server: the sheet asks for it again, with 登录");
  await a.unroute(`**/split/api/ledgers/${id}/files/*`);
  // filling up: said once, until the account is under it again
  let used = 420 * 1024 * 1024;
  await a.route(`**/split/api/ledgers/${id}/files/*`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { id: route.request().url().split("/").pop(), size: 1, type: "image/jpeg", at: 1 }, used, quota: 500 * 1024 * 1024 }) }) : route.fallback()));
  await pa.keyboard.press("Escape");
  await closed(pa);
  const sendOne = async (mark: string) => {
    const n = await pa.locator(".split-photo-count").textContent();
    await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: `IMG_${mark}.jpg`, mimeType: "image/jpeg", buffer: await receipt(pa, mark, 300, 400) });
    await pa.waitForFunction(`document.querySelector(".split-photo-count")?.textContent !== ${JSON.stringify(n)}`, null, { timeout: 10_000 });
    await pa.waitForTimeout(300);
    return (await pa.locator(".ui-toast", { hasText: say("zh", "photoWarn", { used: "420" }) }).count()) === 1;
  };
  ok(await sendOne("K"), "past 400 MB: a toast says how much is used");
  await pa.locator(".ui-toast").waitFor({ state: "detached", timeout: 10_000 });
  ok(!(await sendOne("L")), "and doesn't say it again with the next photo");
  used = 100 * 1024 * 1024;
  await sendOne("M");
  used = 420 * 1024 * 1024;
  await pa.locator(".ui-toast").waitFor({ state: "detached", timeout: 10_000 });
  ok(await sendOne("N"), "under it again, then over: said again");
  // 10 at most: the sheet says so, and has no button
  while (Number(await pa.locator(".split-photo-count").textContent()) < 10) await sendOne(`O${await pa.locator(".split-photo-count").textContent()}`);
  await pa.locator(".split-photo-button").click();
  await sheetNote(pa).filter({ hasText: t("photoMax") }).waitFor();
  ok((await pa.locator("dialog[open] .split-photos-foot .ui-button").count()) === 0 && (await pa.locator("dialog[open] .split-photo-tile").count()) === 10, "ten on an expense: the sheet says that is the most, and has no button for more");
  // the back button: the photo, then the sheet, then 记一笔, each closed in turn
  await pa.locator("dialog[open] .split-photo-tile").first().click();
  await pa.locator(".split-photo-whole img").waitFor();
  await pa.goBack();
  await pa.locator("dialog[open] .split-photo-tile").first().waitFor();
  ok((await pa.locator(".split-photo-whole img").isVisible()) === false, "back on a photo seen whole: the sheet of photos again");
  await pa.goBack();
  await closed(pa);
  ok(await pa.locator(".split-keys").isVisible(), "back again: the sheet closes, 记一笔 stays");
  await pa.goBack();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok(path(pa) === `/split/${id}`, "and again: 记一笔 closes, on the ledger (nothing saved, so the eight it sent go again)");
  await a.unroute(`**/split/api/ledgers/${id}/files/*`);
  ok((await kept1()).length === 2, "the expense still keeps its two");

  // a ledger not on the server yet: no photo, said at once
  await a.setOffline(true);
  await button(pa, "back").click();
  await start(pa, "还没存上", ["阿乙"]);
  await spend(pa, "12");
  await pa.locator("button.split-row").first().click();
  const notYet = pa.waitForEvent("filechooser");
  await pa.locator(".split-photo-button").click();
  await (await notYet).setFiles({ name: "IMG_0009.jpg", mimeType: "image/jpeg", buffer: await receipt(pa, "P", 600, 800) });
  await pa.locator(".ui-toast", { hasText: t("photoNotYet") }).waitFor({ timeout: 10_000 });
  ok(true, "a ledger not saved online yet: the toast says photos wait for a signal");
  await a.setOffline(false);
  for (const ctx of [a, b]) await ctx.close();

  // 照片空间 (⋯, signed in): the room as the server keeps it; photos no expense uses, cleared after asking
  const c = await phone(390, 664, "zh");
  const pc = await open(c, true);
  const settled = (page: Page) => page.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held.every((h) => h.made && !h.waiting.length)`, null, { timeout: 15_000 });
  await start(pc, "空间", ["阿丙"]);
  await spend(pc, "20");
  await settled(pc);
  const space = (await keptBy(pc)).held.find((h) => h.server.name === "空间")!;
  const spaceFiles = async () => (await filesOn(pc, space.server.id, space.key)).files;
  await pc.locator("button.split-row").first().click();
  await pc.locator(".split-note-row input[type=file]").setInputFiles([
    { name: "IMG_0101.jpg", mimeType: "image/jpeg", buffer: await receipt(pc, "S", 900, 1200) },
    { name: "bill.pdf", mimeType: "application/pdf", buffer: aPdf("S") },
  ]);
  await pc.locator(".split-photo-count", { hasText: "2" }).waitFor({ timeout: 15_000 });
  await button(pc, "saveChanges").click();
  await pc.locator(".split-keys").waitFor({ state: "hidden" });
  const storageRow = () => pc.getByRole("dialog").getByRole("button", { name: re(t("storage")) });
  const openStorage = async () => {
    await button(pc, "more").click();
    await storageRow().click();
  };
  await openStorage();
  await pc.locator(".split-storage-ledgers li").first().waitFor({ timeout: 10_000 });
  const keptBytes = (await spaceFiles()).reduce((n, f) => n + f.size, 0);
  const meter = await pc.locator("[role=meter]").getAttribute("aria-valuenow");
  const line = await pc.locator(".split-storage-ledgers li").first().textContent();
  ok(Number(meter) === keptBytes && line?.includes("空间") && line.includes(t("storageThis")) && line.includes("2 张") && (await pc.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).count()) === 0, `the storage sheet: the bar is the bytes the server keeps (${meter}), this ledger by its name, 2 张, and nothing to clear`);
  await pc.keyboard.press("Escape");
  await closed(pc);

  // one taken off; the server asked as of two hours on (what was just stored has settled by then: ledger.ts, SETTLING_MS)
  await pc.locator("button.split-row").first().click();
  await pc.locator(".split-photo-button").click();
  await pc.locator("dialog[open] .split-photo-tile").nth(1).click();
  await pc.getByRole("dialog").getByRole("button", { name: t("photoRemove"), exact: true }).click();
  await pc.locator("dialog[open] .split-photo-tile").first().waitFor();
  await pc.keyboard.press("Escape");
  await closed(pc);
  await button(pc, "saveChanges").click();
  await pc.locator(".split-keys").waitFor({ state: "hidden" });
  await settled(pc);
  await c.route("**/split/api/me/files**", (route) => route.continue({ url: `${route.request().url().split("?")[0]}?at=${Date.now() + 2 * 60 * 60 * 1000}` }));
  await openStorage();
  await pc.getByRole("dialog").getByText(say("zh", "storageUnused", { n: 1, mb: "1" })).waitFor({ timeout: 10_000 });
  await pc.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).click();
  await pc.getByRole("dialog").getByText(t("storageClearAsk")).waitFor();
  await pc.getByRole("dialog").getByRole("button", { name: t("keep"), exact: true }).click();
  await pc.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).waitFor();
  ok((await spaceFiles()).length === 2, "one taken off an expense and settled: the sheet says it is on no expense; 现在清掉 asks first, and 先留着 clears nothing");
  await pc.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).click();
  await pc.getByRole("dialog").getByRole("button", { name: t("storageClearYes"), exact: true }).click();
  await pc.getByRole("dialog").locator(".split-note", { hasText: say("zh", "storageCleared", { mb: "1" }) }).waitFor({ timeout: 10_000 });
  const after = await spaceFiles();
  ok(after.length === 1 && after[0].type === "image/jpeg" && Number(await pc.locator("[role=meter]").getAttribute("aria-valuenow")) === after[0].size && (await pc.getByRole("dialog").getByRole("button", { name: t("storageClear"), exact: true }).count()) === 0, "清掉: the PDF goes from the server, the bar is the photo left, and there is nothing more to clear");
  await c.unroute("**/split/api/me/files**");
  await pc.keyboard.press("Escape");
  await closed(pc);

  // a ledger taken off this phone, with a photo in it still: named as one not on this phone
  await button(pc, "more").click();
  await pc.getByRole("button", { name: re(t("removeMine")) }).click();
  await button(pc, "removeMineYes").click();
  await button(pc, "start").waitFor();
  await start(pc, "第二个", ["阿丁"]);
  await settled(pc);
  await openStorage();
  await pc.locator(".split-storage-ledgers li").first().waitFor({ timeout: 10_000 });
  ok((await pc.locator(".split-storage-ledgers li").first().textContent())?.startsWith(t("storageElsewhere")) === true, "a ledger taken off this phone, with a photo of the account's still in it: named as one not on this phone");
  await pc.keyboard.press("Escape");
  await closed(pc);

  // no signal: said, with 再试一次
  await c.setOffline(true);
  await openStorage();
  await pc.getByRole("dialog").getByText(t("storageAway")).waitFor({ timeout: 10_000 });
  await c.setOffline(false);
  await pc.getByRole("dialog").getByRole("button", { name: t("retry"), exact: true }).click();
  await pc.locator(".split-storage-used").waitFor({ timeout: 10_000 });
  ok(true, "no signal: the sheet says it can't see the room; 再试一次 with a signal, it can");
  await pc.keyboard.press("Escape");
  await closed(pc);

  // the sign-in run out: the sheet says so, and makes way for the site's sign-in
  await c.route("**/split/api/me/files", (route) => route.fulfill({ status: 401, json: { error: "signin" } }));
  await openStorage();
  await pc.getByRole("dialog").getByText(t("storageSignIn")).waitFor({ timeout: 10_000 });
  await pc.getByRole("dialog").getByRole("button", { name: t("signIn"), exact: true }).click();
  await closed(pc);
  await pc.locator("#si-email").waitFor();
  ok(true, "the sign-in run out: the sheet says so; 登录 there gives way to the site's sign-in");
  await pc.keyboard.press("Escape");
  await c.unroute("**/split/api/me/files");

  // signed out (a friend who joined by the link): no storage in ⋯
  const second = (await keptBy(pc)).held.find((h) => h.server.name === "第二个")!;
  const d = await phone(390, 664, "zh");
  const pd = await d.newPage();
  watch(pd, true);
  await pd.goto(`${base}/split/${second.server.id}#k=${second.key}`);
  await pd.locator(".split-who").getByRole("button", { name: re("阿丁") }).click();
  await pd.getByRole("button", { name: t("more"), exact: true }).click();
  await pd.getByRole("dialog").getByRole("button", { name: re(t("export")) }).waitFor();
  ok((await pd.getByRole("dialog").getByRole("button", { name: re(t("storage")) }).count()) === 0, "signed out, ⋯ has no 照片空间");
  for (const ctx of [c, d]) await ctx.close();
}

// ---------- behave: what it does, beyond how it looks ----------
async function behave() {
  const rename = async (page: Page, who: string, to: string) => {
    await button(page, "more").click();
    await page.getByRole("button", { name: re(t("members")) }).click();
    await page.getByRole("dialog").getByText(t("addPerson")).waitFor();
    await page.getByRole("button", { name: re(`${t("renamePerson")} ${who}`) }).click();
    await page.getByRole("dialog").locator(".split-person-edit .field input").fill(to);
    await page.getByRole("dialog").locator(".split-person-edit").getByRole("button", { name: t("save"), exact: true }).click();
    await page.getByRole("dialog").locator(".split-person-edit").waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    await closed(page);
  };

  // the back button, links, a reload
  {
    const ctx = await phone(390, 664, "zh");
    await signIn(ctx);
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
    // (signed in, a ledger the server has is in the account's ledgers: it comes off those)
    await page.getByRole("button", { name: re(t(local ? "removeMine" : "deleteLedger")) }).click();
    await button(page, local ? "removeMineYes" : "deleteYes").click();
    await button(page, "start").waitFor();
    ok(path(page) === "/split" && (await page.locator(".split-ledger").count()) === 0, "taking a ledger off lands on the list, and the ledger is gone from it");
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
    // (signed in before storing stops: what the site keeps of a sign-in is there to read)
    await signIn(ctx);
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
    await button(page, "sendPicture").click();
    await page.getByRole("dialog").getByRole("button", { name: re(t("copyAsText")) }).click();
    await page.getByRole("dialog").getByRole("button", { name: re(t("copied")) }).waitFor({ timeout: 2000 });
    ok(String(await page.evaluate("navigator.clipboard.readText()")).startsWith("复制 · 结清"), "and so is the plan as text, from the picture's sheet");
    await ctx.close();
  }

  // a real keyboard, on a computer
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block" });
    await rooms(ctx);
    const page = await open(ctx);
    await start(page);
    await button(page, "addExpense").click();
    await page.locator(".split-keys").waitFor();
    await page.keyboard.type("12.345");
    ok((await amountShown(page)) === "$12.34", "typing on a keyboard fills the amount, to the cent");
    await page.keyboard.press("Backspace");
    ok((await amountShown(page)) === "$12.3", "Backspace takes a digit off");
    await detailsLine(page).click();
    await noteInSheet(page).click();
    await page.keyboard.type("12 个饺子");
    await page.keyboard.press("Escape");
    await closed(page);
    ok((await amountShown(page)) === "$12.3" && (await detailsLine(page).innerText()).includes("12 个饺子"), "typing the note (in 详情) leaves the amount alone, and the 详情 line says it");
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

  // an expense paid in another currency (on the phone: the server has its own turn further down)
  {
    const ctx = await phone(390, 664, "zh");
    const page = await open(ctx, true);
    const asked: string[] = [];
    page.on("request", (r) => FX.test(new URL(r.url()).pathname) && asked.push(r.url()));
    await start(page, "东京", ["阿甲", "阿乙"]);
    await spend(page, "30");
    ok(asked.length === 0, "an expense in the ledger's own currency asks nothing about rates");
    const corner = page.locator(".split-currency button");
    const comes = page.locator(".split-add-comes");
    const said = async () => ((await comes.textContent()) ?? "").replace(/\s+/g, " ");
    const pick = async (name: string) => {
      await corner.click();
      await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
      await closed(page);
    };
    const wipe = async (digits: number) => {
      for (let i = 0; i < digits; i++) await page.locator(".split-key.is-back").click();
    };
    const top = async () => ((await page.locator(".split-row-amount").first().textContent()) ?? "").replace(/\s+/g, "");

    await button(page, "addExpense").click();
    ok((await corner.textContent())?.includes("加元") && (await comes.count()) === 0, "记一笔 says in its corner what the amount is typed in: the ledger's currency, and nothing about a rate");
    await corner.click();
    await page.getByRole("dialog").getByRole("button", { name: "日元", exact: true }).waitFor();
    await page.goBack();
    await closed(page);
    ok(await page.locator(".split-keys").isVisible(), "the phone's back button closes the currencies, and 记一笔 is still there");
    await type(page, "3000.5");
    await pick("日元");
    await comes.waitFor();
    ok(asked.length >= 1, "opening the currencies asks for today's rates");
    ok((await amountShown(page)) === "JP¥3,000" && (await said()).includes("折合 $27.37") && (await said()).includes("汇率 0.0091224"), `yen picked: the digits before the point stay, and the line under the amount says what it comes to and at what rate (${await amountShown(page)}, ${await said()})`);
    ok(await page.locator(".split-key", { hasText: /^\.$/ }).isDisabled(), "yen has no cents, so the point is off");
    await button(page, "done").click();
    await page.locator(".split-row").first().waitFor();
    ok((await top()) === "$27.37JP¥3,000" && (await page.locator(".split-standing-sub").textContent())?.includes("$57.37"), `the row says what it counts for, and under it what was paid; the total is in the ledger's currency (${await top()})`);

    // the next one
    const before = asked.length;
    await button(page, "addExpense").click();
    await comes.waitFor();
    ok((await amountShown(page)) === "JP¥0" && (await corner.textContent())?.includes("日元") && (await said()).includes("1 日元 = 0.0091224 加元") && asked.length === before, `the next expense starts in yen at the same rate, and asks nothing (${await said()})`);
    await type(page, "1000");

    // the rate, by hand
    await comes.click();
    const rate = page.getByRole("dialog").locator("input");
    ok((await rate.inputValue()) === "0.0091224", "the line under the amount opens the rate");
    await rate.fill("0,01x");
    ok((await rate.inputValue()) === "0.01" && (await page.getByRole("dialog").getByText(say("zh", "comesToFrom", { paid: "JP¥1,000", amount: "$10.00" })).count()) === 1, "a rate typed with a comma is a rate, and what the amount comes to at it shows at once");
    await page.getByRole("dialog").getByRole("button", { name: say("zh", "useToday", { rate: "0.0091224" }), exact: true }).click();
    ok((await rate.inputValue()) === "0.0091224", "用今天的汇率 puts today's back");
    await rate.fill("0.01");
    await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
    await closed(page);
    ok((await said()).includes("折合 $10.00") && (await said()).includes("汇率 0.01"), "the line says the new rate");
    await button(page, "done").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
    ok((await top()) === "$10.00JP¥1,000", "recorded at the rate that was typed");

    // changed
    await page.locator("button.split-row").first().click();
    await comes.waitFor();
    ok((await amountShown(page)) === "JP¥1,000" && (await said()).includes("汇率 0.01"), "opened again, it is in yen at the rate it was recorded at, not today's");
    await wipe(4);
    await type(page, "2500");
    await button(page, "saveChanges").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
    ok((await top()) === "$25.00JP¥2,500", "changed to 2,500 yen: it counts for 25.00 at its own rate");
    await page.locator("button.split-row").first().click();
    await pick("加元");
    ok((await amountShown(page)) === "$2,500" && (await comes.count()) === 0, "put back into the ledger's currency: the digits stay, and the line about the rate goes");
    await wipe(4);
    await type(page, "45");
    await button(page, "saveChanges").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
    ok((await top()) === "$45.00", "and it is an expense of 45.00 with no other currency to it");

    // no rates to be had
    await noRates(ctx, page);
    await button(page, "addExpense").click();
    ok((await amountShown(page)) === "$0", "the last expense being in the ledger's currency, the next starts there");
    await type(page, "20");
    await pick("欧元");
    await page.locator(".split-add-comes.is-loud").waitFor({ timeout: 20_000 });
    ok((await said()).includes(t("needRate")) && (await button(page, "done").isDisabled()), "with no rates to be had, and no expense in euros before, it says a rate is needed and can't be recorded yet");
    await comes.click();
    ok(await page.getByRole("dialog").getByText(t("rateNone")).waitFor({ timeout: 20_000 }).then(() => true, () => false), "the rate's sheet says why there is none, and to type one");
    await page.getByRole("dialog").locator("input").fill("1.5");
    await page.getByRole("dialog").getByRole("button", { name: t("ok"), exact: true }).click();
    await closed(page);
    ok((await said()).includes("折合 $30.00") && (await button(page, "done").isEnabled()), "a rate typed in, it comes to 30.00 and can be recorded");
    await button(page, "done").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
    await button(page, "addExpense").click();
    await comes.waitFor();
    ok((await amountShown(page)) === "€0" && (await said()).includes("1 欧元 = 1.5 加元"), "and the next one starts in euros at that rate, still with no rates from anywhere");
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
      // (as joining gives it: the key, and neither the owner's key nor the first phone's account)
      await holding(b, { held: [{ ...first, owner: undefined, acct: undefined, waiting: [], lost: [] }], me: { [id]: first.server.members[1].id } });
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
      await pa.locator(".split-crew-faces", { hasText: say("zh", "people", { n: 4 }) }).waitFor({ timeout: 5000 });
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

    // the owner's two: the lock, and a new key for the invitation
    {
      const a = await phone(390, 664, "zh");
      await a.grantPermissions(["clipboard-read", "clipboard-write"]);
      const pa = await open(a, true);
      await start(pa, "主人", ["阿甲", "阿乙"]);
      await spend(pa, "30");
      const mine = (await keptBy(pa)).held[0];
      const id = mine.server.id;
      const link = `${base}/split/${id}#k=${mine.key}`;
      const b = await phone(390, 664, "zh");
      const pb = await b.newPage();
      watch(pb, true);
      await pb.goto(link);
      await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await pb.locator(".split-standing").waitFor();
      const line = async (page: Page) => (await page.locator(".split-page > .split-sync").textContent()) ?? "";

      await button(pb, "more").click();
      ok((await pb.getByRole("button", { name: re(t("lockIt")) }).count()) === 0 && (await pb.getByRole("button", { name: re(t("rekey")) }).count()) === 0 && (await keptBy(pb)).held[0].owner === undefined, "a friend's phone has no owner's key, and its ⋯ has neither of the owner's lines");
      await pb.keyboard.press("Escape");
      await closed(pb);
      ok(!!mine.owner && mine.owner !== mine.key, "the phone that started the ledger has one, which isn't the invitation's");

      // the friend records something with no signal, and the owner locks the ledger meanwhile
      await b.setOffline(true);
      await spend(pb, "8");
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("lockIt")) }).click();
      await pa.getByRole("button", { name: re(t("unlockIt")) }).waitFor({ timeout: 8000 });
      await pa.keyboard.press("Escape");
      await closed(pa);
      ok((await line(pa)) === t("lockedOwner") && (await button(pa, "addExpense").count()) === 0 && (await pa.locator("button.split-row").count()) === 0, "the owner locks it with one tap: the page says so, and has no 记一笔 and no row that opens");
      ok(typeof ((await onServer(pa, id, mine.key)).ledger as { locked?: number }).locked === "number", "and the server holds it locked");
      await b.setOffline(false);
      await pb.evaluate("window.dispatchEvent(new Event('online'))");
      await pb.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 15_000 });
      ok((await line(pb)) === t("lockedUnsentOne") && (await keptBy(pb)).held[0].waiting.length === 1 && (await pb.locator(".split-row").count()) === 2 && (await button(pb, "addExpense").count()) === 0, "the friend's phone comes back: what it recorded stays on it and on its screen, and the page says the ledger is locked and one change can't go up");
      ok((await onServer(pa, id, mine.key)).ledger.entries.length === 1, "nothing got into the locked ledger");
      await pb.getByRole("tab", { name: t("settle") }).click();
      await pb.locator(".split-row").first().click();
      ok((await button(pb, "markPaid").count()) === 0 && (await pb.getByRole("dialog").getByText(t("locked")).count()) === 1, "a transfer can be looked at and its amount copied, and not marked as paid");
      await pb.keyboard.press("Escape");
      await closed(pb);
      await pb.getByRole("tab", { name: t("expenses") }).click();

      // opened again: what waited goes up by itself
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("unlockIt")) }).click();
      await pa.getByRole("button", { name: re(t("lockIt")) }).waitFor({ timeout: 8000 });
      await pa.keyboard.press("Escape");
      await closed(pa);
      await pb.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 15_000 });
      await pa.locator(".split-row").nth(1).waitFor({ timeout: 8000 });
      ok((await onServer(pa, id, mine.key)).ledger.entries.length === 2 && (await keptBy(pb)).held[0].waiting.length === 0 && (await button(pb, "addExpense").count()) === 1 && (await button(pa, "addExpense").count()) === 1, "the owner opens it again: the friend's expense goes up without anyone touching that phone, and both can record");

      // a new key
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("rekey")) }).click();
      await pa.getByRole("dialog").getByRole("button", { name: t("rekeyNo"), exact: true }).click();
      await closed(pa);
      ok((await keptBy(pa)).held[0].key === mine.key, "换邀请链接 asks first, and 不换了 changes nothing");
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("rekey")) }).click();
      await pa.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).click();
      await pa.getByRole("dialog").getByText(t("rekeyDone")).waitFor({ timeout: 8000 });
      await pa.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
      const link2 = String(await pa.evaluate("navigator.clipboard.readText()")).split("\n").pop() ?? "";
      await pa.keyboard.press("Escape");
      await closed(pa);
      const now = (await keptBy(pa)).held[0];
      ok(now.key !== mine.key && now.owner === mine.owner && now.next === undefined && link2 === `${base}/split/${id}#k=${now.key}`, "said yes to: the phone holds a new key, the same owner's key, and the invitation it copies carries the new one");
      ok((await onServer(pa, id, mine.key)).ledger.name === "403" && (await onServer(pa, id, now.key)).ledger.entries.length === 2, "the server turns the old key away and opens to the new one, with everything in the ledger");
      ok(await pa.locator(".split-page > .split-sync").count().then((n) => n === 0), "the owner's own page carries on with nothing to say");

      // the friend: shut out, told why, still recording; then let in by the new invitation
      await pb.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 15_000 });
      ok((await line(pb)) === t("troubleKey"), "the friend's page says the link was changed, and what to do");
      await spend(pb, "5");
      ok((await keptBy(pb)).held[0].waiting.length === 1 && (await pb.locator(".split-row").count()) === 3, "it still records, on the phone");
      await pb.goto(link2);
      await pb.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 15_000 });
      await pa.locator(".split-row").nth(2).waitFor({ timeout: 8000 });
      // (the owner hears it over the live line the moment the server has it, which can be before the answer reaches the phone that sent it)
      await pb.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`, undefined, { timeout: 8000 });
      const theirsNow = await keptBy(pb);
      const parts = { address: pb.url() === `${base}/split/${id}`, key: theirsNow.held[0].key === now.key, sent: theirsNow.held[0].waiting.length === 0, there: (await onServer(pa, id, now.key)).ledger.entries.length === 3, who: theirsNow.me[id] !== undefined };
      ok(Object.values(parts).every(Boolean), `the new invitation opened on it: the phone takes the new key, is still who it was, and what it kept goes up; the owner sees it${Object.values(parts).every(Boolean) ? "" : ` → ${JSON.stringify(parts)}`}`);
      const c = await phone(390, 664, "zh");
      const pc = await c.newPage();
      watch(pc, true);
      await pc.goto(link);
      await pc.getByText(t("joinKey")).waitFor({ timeout: 8000 });
      ok(true, "someone opening the old invitation is told it doesn't open the ledger");

      // taking the ledger off the owner's ledgers says what goes with it
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("removeMine")) }).click();
      ok((await pa.getByRole("dialog").getByText(t("removeMineOwner")).count()) === 1, "taking the ledger off its owner's ledgers says that the lock, the link and deleting it go with it");
      await button(pb, "more").click();
      await pb.getByRole("button", { name: re(t("deleteLedger")) }).click();
      ok((await pb.getByRole("dialog").getByText(t("deleteOwner")).count()) === 0 && (await pb.getByRole("dialog").getByText(t("removeMineOwner")).count()) === 0, "(a friend's phone, signed out, takes it off that phone only, and is told no such thing)");
      for (const ctx of [a, b, c]) await ctx.close();
    }

    // an expense paid in another currency: what the server holds, and what another phone shows and changes
    {
      const a = await phone(390, 664, "zh");
      const pa = await open(a, true);
      await start(pa, "货币", ["阿甲", "阿乙"]);
      const mine = (await keptBy(pa)).held[0];
      const id = mine.server.id;
      const b = await phone(390, 664, "zh");
      const pb = await b.newPage();
      watch(pb, true);
      await pb.goto(`${base}/split/${id}#k=${mine.key}`);
      await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await button(pb, "addExpense").waitFor();
      type Abroad = { amount: number; paidIn?: { currency: string; amount: number; rate: string } };
      const first = async () => (await onServer(pa, id, mine.key)).ledger.entries[0] as unknown as Abroad;
      const pick = async (page: Page, name: string) => {
        await page.locator(".split-currency button").click();
        await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
        await closed(page);
      };
      const top = async (page: Page) => ((await page.locator(".split-row-amount").first().textContent()) ?? "").replace(/\s+/g, "");

      await button(pa, "addExpense").click();
      await type(pa, "3000");
      await pick(pa, "日元");
      await button(pa, "done").click();
      await pb.locator(".split-row-amount small").waitFor({ timeout: 8000 });
      eqJson(await first(), { amount: 2737, paidIn: { currency: "JPY", amount: 3000, rate: "0.0091224" } }, "3,000 yen recorded on one phone: the server holds what it counts for, what was paid, and the rate");
      ok((await top(pb)) === "$27.37JP¥3,000" && (await pb.locator(".split-figure").textContent())?.includes("$9.12"), "the other phone shows both amounts, and owes its third of what it counts for");

      await pb.locator("button.split-row").first().click();
      await pb.locator(".split-add-comes").waitFor();
      for (let i = 0; i < 4; i++) await pb.locator(".split-key.is-back").click();
      await type(pb, "5000");
      await button(pb, "saveChanges").click();
      await pa.locator(".split-row-amount", { hasText: "JP¥5,000" }).waitFor({ timeout: 8000 });
      eqJson(await first(), { amount: 4561, paidIn: { currency: "JPY", amount: 5000, rate: "0.0091224" } }, "changed to 5,000 yen on the other phone: both amounts change on the server, at the same rate");

      await pa.locator("button.split-row").first().click();
      await pick(pa, "加元");
      for (let i = 0; i < 4; i++) await pa.locator(".split-key.is-back").click();
      await type(pa, "45");
      await button(pa, "saveChanges").click();
      await pb.locator(".split-row-amount", { hasText: /^\$45\.00$/ }).waitFor({ timeout: 8000 });
      const plain = await first();
      ok(plain.amount === 4500 && !("paidIn" in plain) && (await pb.locator(".split-row-amount small").count()) === 0, "put back into the ledger's currency: the server holds 45.00 and no other currency, and the other phone's row has one amount");
      for (const ctx of [a, b]) await ctx.close();
    }

    // signed in: the account's ledgers
    {
      // signed out, the list's one button signs in first, through the site's own sheet
      const a = await phone(390, 664, "zh");
      const pa = await open(a, true, false);
      ok((await button(pa, "start").count()) === 0, "signed out, the list's one button is 登录，开一个账本");
      await button(pa, "startSignIn").click();
      await pa.locator("#si-email").waitFor();
      await pa.keyboard.press("Escape");
      await closed(pa);
      ok(!(await signedAs(pa)) && (await pa.getByRole("dialog").count()) === 0, "the sign-in closed without signing in: nothing else opens");
      await button(pa, "startSignIn").click();
      await viaSheet(pa, "zh");
      const sheet = pa.getByRole("dialog");
      await sheet.locator("#split-who-else").waitFor();
      const account = (await signedAs(pa)) ?? "";
      ok(!!account, "signed in through it, the sheet 开一个账本 was pressed for opens by itself");
      await sheet.locator("input").nth(0).fill("账号");
      await sheet.locator("input").nth(1).fill("我");
      for (const n of ["阿甲", "阿乙"]) {
        await sheet.locator("#split-who-else").fill(n);
        await sheet.getByRole("button", { name: t("add"), exact: true }).click();
      }
      await sheet.getByRole("button", { name: t("startIt"), exact: true }).click();
      await pastInvite(pa);
      await button(pa, "addExpense").waitFor();
      await spend(pa, "30");
      await pa.waitForTimeout(800);
      const kept = await keptBy(pa);
      const first = kept.held[0];
      const id = first.server.id;
      const listed = (await myLedgers(pa)).ledgers;
      ok(listed.length === 1 && listed[0].id === id && listed[0].key === first.key && !!first.owner && listed[0].owner === first.owner && listed[0].me === kept.me[id] && first.acct === account,
        "made signed in: the server keeps it in the account's ledgers, with the owner's key and who they are in it, and the phone holds it as the account's");

      // the same account, signed in on another phone
      const a2 = await phone(390, 664, "zh");
      await signIn(a2, account);
      const pa2 = await open(a2, true);
      await pa2.locator(".split-ledger").click({ timeout: 8000 });
      await pa2.locator(".split-row").first().waitFor();
      const second = await keptBy(pa2);
      ok(second.held.length === 1 && second.held[0].owner === first.owner && second.held[0].acct === account && second.me[id] === kept.me[id] && (await amounts(pa2)) === "$30.00",
        "another phone signed in to the same account has the ledger, with what was recorded, as its owner, and as the same person in it");
      await button(pa2, "more").click();
      ok((await pa2.getByRole("button", { name: re(t("lockIt")) }).count()) === 1 && (await pa2.getByRole("button", { name: re(t("eraseIt")) }).count()) === 1, "and its ⋯ has the owner's lines");
      await pa2.keyboard.press("Escape");
      await closed(pa2);

      // a friend joins signed out, and signs in later
      const g = await phone(390, 664, "zh");
      const pg = await g.newPage();
      watch(pg, true);
      await pg.goto(`${base}/split/${id}#k=${first.key}`);
      await pg.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await pg.locator(".split-standing").waitFor();
      ok((await keptBy(pg)).held[0].acct === undefined && !(await signedAs(pg)), "a friend signed out joins by the invitation: the ledger is that phone's alone");
      const friend = anAccount();
      await signTo(pg, friend);
      await pg.locator(".split-standing").waitFor();
      await pg.waitForTimeout(800);
      const theirs = (await myLedgers(pg)).ledgers;
      ok(theirs.length === 1 && theirs[0].id === id && theirs[0].me === (await keptBy(pg)).me[id] && theirs[0].owner === undefined && (await keptBy(pg)).held[0].acct === friend,
        "signed in, it goes to their account, with who they are in it, and no owner's key");

      // taken off my ledgers on one phone: off the account, and then off its other phone; the ledger stays for the others
      await a2.setOffline(true);
      await button(pa2, "more").click();
      await pa2.getByRole("button", { name: re(t("removeMine")) }).click();
      await pa2.getByRole("dialog").getByRole("button", { name: t("removeMineYes"), exact: true }).click();
      await pa2.getByRole("dialog").locator(".split-note", { hasText: t("removeFailed") }).waitFor({ timeout: 20_000 });
      ok((await keptBy(pa2)).held.length === 1, "with no signal it can't come off the account's ledgers: the sheet says so, and nothing changes");
      await a2.setOffline(false);
      await pa2.getByRole("button", { name: re(t("removeMine")) }).click();
      await pa2.getByRole("dialog").getByRole("button", { name: t("removeMineYes"), exact: true }).click();
      await button(pa2, "start").waitFor();
      ok((await pa2.locator(".split-ledger").count()) === 0 && (await keptBy(pa2)).held.length === 0 && (await myLedgers(pa2)).ledgers.length === 0, "with one, it comes off this phone and off the account");
      await button(pa, "back").click();
      await pa.locator(".split-ledger").waitFor();
      await pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await pa.locator(".split-ledger").waitFor({ state: "detached", timeout: 8000 });
      ok((await keptBy(pa)).held.length === 0, "the account's other phone takes it off too, the next time it comes to the front");
      ok((await onServer(pg, id, first.key)).ledger.entries.length === 1 && (await keptBy(pg)).held.length === 1, "and the ledger is still there for the others");

      // its owner deletes one, for everyone
      await start(pa, "删掉", ["阿甲"]);
      await spend(pa, "12");
      const doomed = (await keptBy(pa)).held.find((h) => h.server.name === "删掉")!;
      const gone = doomed.server.id;
      await pg.goto(`${base}/split/${gone}#k=${doomed.key}`);
      await pg.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await pg.locator(".split-standing").waitFor();
      await pg.waitForTimeout(800);
      ok((await myLedgers(pg)).ledgers.some((m) => m.id === gone), "(a friend signed in joins it: it is in their account too)");
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("eraseIt")) }).click();
      await pa.getByRole("dialog").getByRole("button", { name: t("keep"), exact: true }).click();
      ok((await keptBy(pa)).held.some((h) => h.server.id === gone) && (await onServer(pa, gone, doomed.key)).ledger.entries.length === 1, "删掉账本 asks first, and 先留着 changes nothing");
      await pa.getByRole("button", { name: re(t("eraseIt")) }).click();
      await pa.getByRole("dialog").getByRole("button", { name: t("eraseYes"), exact: true }).click();
      await pa.getByText(t("erased")).waitFor({ timeout: 8000 });
      ok(path(pa) === "/split" && !(await keptBy(pa)).held.some((h) => h.server.id === gone) && !(await myLedgers(pa)).ledgers.some((m) => m.id === gone), "deleted: the owner's page goes to the list and says so, and it is off the phone and the account");
      ok((await onServer(pa, gone, doomed.key)).ledger.name === "404", "and the server has it no more");
      await pg.locator(".split-page > .split-sync.is-loud").waitFor({ timeout: 15_000 });
      ok((await syncSaid(pg)) === t("troubleGone") && (await pg.locator(".split-row").count()) === 1, "a friend's page open on it says it was deleted, and keeps what it shows");

      // signed out: the account's ledgers leave the list; another account on the same phone doesn't see them; signed in again, they are back
      await start(pa, "留下", ["阿甲"]);
      // (on the server, and so in the account, before signing out: one that isn't yet goes up with whoever signs in next)
      await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held.some((h) => h.server.name === "留下" && h.acct)`);
      await button(pa, "back").click();
      await pa.locator(".split-ledger").waitFor();
      await signTo(pa, null);
      await button(pa, "startSignIn").waitFor();
      ok((await pa.locator(".split-ledger").count()) === 0 && (await keptBy(pa)).held.length === 1, "signed out, the account's ledgers leave the list (they stay on the phone, out of sight)");
      await signTo(pa, anAccount());
      await button(pa, "start").waitFor();
      await pa.waitForTimeout(500);
      ok((await pa.locator(".split-ledger").count()) === 0, "signed in on the same phone as someone else, they stay out of sight");
      await signTo(pa, account);
      await pa.locator(".split-ledger", { hasText: "留下" }).waitFor({ timeout: 8000 });
      ok((await pa.locator(".split-ledger").count()) === 1, "signed in again as the account, they are back");

      // the sign-in ran out before a ledger could go up
      await a.route("**/split/api/ledgers", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "signin" }) }) : route.fallback()));
      await start(pa, "过期", ["阿甲"]);
      await pa.locator(".split-sync-act").waitFor({ timeout: 8000 });
      await spend(pa, "9");
      const waiting = (await keptBy(pa)).held.find((h) => h.server.name === "过期")!;
      ok((await syncSaid(pa)) === t("troubleSignin") && !waiting.made && waiting.waiting.length === 1, "the sign-in ran out before the ledger went up: the page says so with 登录 under it, and records all the same, on the phone");
      await a.unroute("**/split/api/ledgers");
      await pa.locator(".split-sync-act").getByRole("button", { name: t("signIn"), exact: true }).click();
      await pa.locator("#si-email").waitFor();
      await pa.keyboard.press("Escape");
      await pa.locator("#si-email").waitFor({ state: "detached" });
      // (the ⋯ sheet's 登录 too: the sheet gives way, since the site's sign-in is drawn under any sheet still open)
      await button(pa, "more").click();
      await pa.getByRole("dialog").getByRole("button", { name: t("signIn"), exact: true }).click();
      await closed(pa);
      await viaSheet(pa, "zh");
      await pa.locator(".split-page > .split-sync").waitFor({ state: "detached", timeout: 15_000 });
      await pa.waitForTimeout(800);
      const after = (await keptBy(pa)).held.find((h) => h.server.name === "过期")!;
      const now = await signedAs(pa);
      ok(!!now && now !== account && after.made && after.waiting.length === 0 && after.acct === now && (await myLedgers(pa)).ledgers.some((m) => m.id === after.server.id) && (await onServer(pa, after.server.id, after.key)).ledger.entries.length === 1,
        "signed in again (here as another account): the ledger goes up with what was recorded, into that account's ledgers");
      for (const ctx of [a, a2, g]) await ctx.close();
    }

    // the record (改动记录): who did what; an edit changed back, a deleted expense brought back, from another phone
    {
      const a = await phone(390, 664, "zh");
      const pa = await open(a, true);
      await start(pa, "记录", ["阿甲"]);
      await spend(pa, "30");
      await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0 && JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made`);
      const kept = (await keptBy(pa)).held[0];
      const b = await phone(390, 664, "zh");
      const pb = await b.newPage();
      watch(pb, true);
      await pb.goto(`${base}/split/${kept.server.id}#k=${kept.key}`);
      await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
      await button(pb, "addExpense").waitFor();
      const openRecord = async (page: Page) => {
        await button(page, "more").click();
        await page.getByRole("button", { name: re(t("history")) }).click();
      };
      const recordLines = async (page: Page) => (await page.getByRole("dialog").locator(".split-history-line").allTextContents()).map((x) => x.replace(/\s+/g, " ").trim());
      await openRecord(pb);
      await pb.getByRole("dialog").locator(".split-history-line").first().waitFor();
      const first = await recordLines(pb);
      ok(first.length === 1 && first[0].startsWith(`${say("zh", "historyExpense", { what: `${t("noNote")} $30.00` })}我 · ${t("today").split(" ")[0]}`), `another phone's record: what was done, by whom (by name), and when → ${first[0]}`);

      // changed on the first phone while the record is open on the second: it reads it again
      await pa.locator("button.split-row").first().click();
      await pa.locator(".split-keys").waitFor();
      while (((await amountShown(pa)) ?? "").replace(/[^0-9.]/g, "") !== "0") await pa.locator(".split-key.is-back").click();
      await type(pa, "45");
      await button(pa, "saveChanges").click();
      await pa.locator(".split-keys").waitFor({ state: "hidden" });
      await pb.getByRole("dialog").getByText(say("zh", "historyAmount", { from: "$30.00", to: "$45.00" })).waitFor({ timeout: 10_000 });
      ok((await recordLines(pb))[0].startsWith(say("zh", "historyEdit", { what: `${t("noNote")} $45.00` })), "changed on the other phone, with the record open: the record reads it again, and says what changed");

      // changed back from the record
      await pb.getByRole("dialog").getByRole("button", { name: t("revert"), exact: true }).click();
      await pa.locator(".split-row-amount", { hasText: "$30.00" }).waitFor({ timeout: 10_000 });
      await pb.getByRole("dialog").getByText(say("zh", "historyAmount", { from: "$45.00", to: "$30.00" })).waitFor({ timeout: 10_000 });
      // (what this phone did is on top while it is on its way, and once it is there)
      const yours = await pb.waitForFunction(`(document.querySelector("dialog[open] .split-history-line")?.textContent ?? "").includes(${JSON.stringify(`${t("you")} · `)})`, null, { timeout: 10_000 }).then(() => true, () => false);
      const reverted = (await recordLines(pb))[0];
      ok(yours, `改回去: the expense is what it was, on both phones, and the record's newest line is yours → ${reverted}`);
      await pb.keyboard.press("Escape");
      await closed(pb);

      // deleted on the first phone, brought back from the record on the second
      await pa.locator("button.split-row").first().click();
      await button(pa, "deleteExpense").click();
      await pa.locator(".split-row").waitFor({ state: "detached", timeout: 5000 });
      await pb.locator(".split-row").waitFor({ state: "detached", timeout: 10_000 });
      await openRecord(pb);
      await pb.getByRole("dialog").getByRole("button", { name: t("restore"), exact: true }).click();
      await pa.locator(".split-row-amount", { hasText: "$30.00" }).waitFor({ timeout: 10_000 });
      await pb.getByRole("dialog").getByText(say("zh", "historyBack", { what: `${t("noNote")} $30.00` })).waitFor({ timeout: 10_000 });
      ok((await onServer(pa, kept.server.id, kept.key)).ledger.entries.filter((e) => e.gone === undefined).length === 1, "恢复: the deleted expense is back, on the server and both phones, and the record says so");
      await pb.keyboard.press("Escape");
      await closed(pb);

      // no signal: the record can't be read, and says so; with one again, 再试一次 reads it
      await b.setOffline(true);
      await openRecord(pb);
      await pb.getByRole("dialog").getByText(t("historyFailed")).waitFor({ timeout: 20_000 });
      await b.setOffline(false);
      await pb.getByRole("dialog").getByRole("button", { name: t("retry"), exact: true }).click();
      await pb.getByRole("dialog").locator(".split-history-line").first().waitFor({ timeout: 10_000 });
      ok((await pb.getByRole("dialog").getByText(t("historyFailed")).count()) === 0 && (await recordLines(pb)).length === 5, "no signal: the record says it can't be read; 再试一次 with a signal reads all five lines");
      await pb.keyboard.press("Escape");
      await closed(pb);
      for (const ctx of [a, b]) await ctx.close();
    }

    await photos();

    // the 结清图: through a phone's share sheet; held, in WeChat; saved, on a computer; out of date once the plan changes
    {
      const sheet = (page: Page) => page.getByRole("dialog");
      const makePicture = async (page: Page) => {
        await button(page, "sendPicture").click();
        await sheet(page).locator(".split-picture img").waitFor({ timeout: 15_000 });
      };
      const a = await phone(390, 664, "zh");
      // a phone with a share sheet: what it is given is kept to look at, and it can be made to refuse once
      // (as a script of its own: a function from here would bring along a helper the page doesn't have)
      await a.addInitScript(`
        window.shared = [];
        Object.defineProperty(navigator, "canShare", { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
        Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => {
          const no = window.refuse;
          window.refuse = undefined;
          if (no) throw new DOMException("not sent", no);
          for (const f of d.files || []) {
            const head = [...new Uint8Array(await f.slice(0, 3).arrayBuffer())];
            window.shared.push({ name: f.name, type: f.type, size: f.size, bom: head.join() === "239,187,191", text: f.type === "text/csv" ? await f.text() : "" });
          }
        } });
      `);
      const pa = await open(a);
      await start(pa, "结清图", ["阿甲"]);
      await spend(pa, "30");
      await pa.getByRole("tab", { name: t("settle") }).click();
      ok((await pa.locator(".split-stale").count()) === 0, "no picture made yet: nothing is out of date");
      await makePicture(pa);
      const drawn = (await sheet(pa).locator(".split-picture img").evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight])) as number[];
      await sheet(pa).getByRole("button", { name: t("pictureShare"), exact: true }).click();
      await pa.waitForFunction("window.shared.length === 1");
      const shared = (await pa.evaluate("window.shared")) as { name: string; type: string; size: number }[];
      ok(/^all-square-\d{4}-\d{2}-\d{2}\.png$/.test(shared[0].name) && shared[0].type === "image/png" && shared[0].size > 10_000 && drawn[0] === 1080, `a phone with a share sheet: 发给朋友 hands it one picture, a PNG 1080 wide (${drawn.join("x")}, ${shared[0].size} bytes)`);
      ok((await sheet(pa).getByText(t("pictureHoldToo")).count()) === 1 && (await sheet(pa).getByRole("button", { name: t("pictureSave"), exact: true }).count()) === 0, "and says it can be held to save it, with no button to save it as a file");
      await pa.evaluate("window.refuse = 'AbortError'");
      await sheet(pa).getByRole("button", { name: t("pictureShare"), exact: true }).click();
      await pa.waitForTimeout(300);
      ok((await sheet(pa).locator(".split-picture-hint.is-loud").count()) === 0, "the share sheet closed without sending: nothing more is said");
      await pa.evaluate("window.refuse = 'NotAllowedError'");
      await sheet(pa).getByRole("button", { name: t("pictureShare"), exact: true }).click();
      await sheet(pa).locator(".split-picture-hint.is-loud", { hasText: t("pictureHold") }).waitFor({ timeout: 5000 });
      ok((await sheet(pa).getByRole("button", { name: t("pictureShare"), exact: true }).count()) === 0 && (await sheet(pa).getByRole("button", { name: t("pictureSave"), exact: true }).count()) === 1, "the phone wouldn't share it: the sheet says to hold the picture, and offers to save it");
      await pa.keyboard.press("Escape");
      await closed(pa);

      // out of date: an expense recorded since; still so after the page is opened again; a new picture puts it right
      await pa.getByRole("tab", { name: t("expenses") }).click();
      await spend(pa, "12");
      await pa.getByRole("tab", { name: t("settle") }).click();
      await pa.locator(".split-stale", { hasText: t("pictureStale") }).waitFor({ timeout: 5000 });
      await pa.reload();
      await button(pa, "addExpense").waitFor();
      await pa.getByRole("tab", { name: t("settle") }).click();
      await pa.locator(".split-stale").waitFor({ timeout: 5000 });
      ok(((await pa.locator(".split-stale").textContent()) ?? "").includes(say("zh", "today", { time: "" }).trim()), "an expense recorded since: the settle tab says the picture is out of date, and when it was made; so it does when the page is opened again");
      await makePicture(pa);
      await pa.keyboard.press("Escape");
      await closed(pa);
      await pa.locator(".split-row").first().click();
      await button(pa, "markPaid").click();
      await closed(pa);
      await pa.waitForTimeout(500);
      ok((await pa.locator(".split-stale").count()) === 0 && (await pa.locator(".split-rows:not(.split-people) .split-row", { hasText: t("paid") }).count()) === 1, "a new picture: up to date; a transfer marked as paid since doesn't put it out of date");

      // 导出账目 through the same share sheet: the ledger as one CSV file
      await button(pa, "more").click();
      await pa.getByRole("button", { name: re(t("export")) }).click();
      await sheet(pa).getByRole("button", { name: t("exportShare"), exact: true }).click();
      // (the page was opened again since the picture was shared: what the share sheet was given starts afresh)
      await pa.waitForFunction(`window.shared.some((f) => f.type === "text/csv")`);
      // (its first three bytes are the byte-order mark; reading it as text takes them off)
      const csv = ((await pa.evaluate("window.shared")) as { name: string; type: string; bom: boolean; text: string }[]).find((f) => f.type === "text/csv")!;
      const csvLines = csv.text.split("\r\n");
      ok(/^all-square-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name) && csv.type === "text/csv" && csv.bom && csv.text.startsWith(`${t("csvWhen")},`) && csvLines.length === 6 && csvLines[4].startsWith(`,${t("csvTotal")},`), `导出账目 on a phone: one CSV file to the share sheet (${csv.name}): the headings, two expenses and the payment, the totals`);
      await pa.evaluate("window.refuse = 'NotAllowedError'");
      await sheet(pa).getByRole("button", { name: t("exportShare"), exact: true }).click();
      await sheet(pa).getByRole("button", { name: t("exportSave"), exact: true }).waitFor({ timeout: 5000 });
      ok((await sheet(pa).getByRole("button", { name: t("exportShare"), exact: true }).count()) === 0, "the phone wouldn't take it: the sheet offers to save it instead");
      await pa.keyboard.press("Escape");
      await closed(pa);
      await a.close();

      // WeChat's own browser: no share sheet; the picture is held to send it or save it
      const w = await phone(390, 664, "zh");
      await w.addInitScript(`
        const ua = navigator.userAgent;
        Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: () => ua + " MicroMessenger/8.0.47(0x18002f2c) NetType/WIFI Language/zh_CN" });
      `);
      const pw = await open(w);
      await start(pw, "微信", ["阿甲"]);
      await spend(pw, "30");
      await pw.getByRole("tab", { name: t("settle") }).click();
      await makePicture(pw);
      ok((await sheet(pw).locator(".split-picture-hint.is-loud", { hasText: t("pictureHold") }).count()) === 1 && (await sheet(pw).getByRole("button", { name: t("pictureShare"), exact: true }).count()) === 0 && (await sheet(pw).getByRole("button", { name: t("pictureSave"), exact: true }).count()) === 0, "in WeChat: hold the picture to send it or save it, said over the picture; no button to share it or to save it as a file (neither works there)");
      ok((await sheet(pw).getByRole("button", { name: re(t("copyAsText")) }).count()) === 1, "and the plan can still be copied as text");
      await pw.keyboard.press("Escape");
      await closed(pw);
      await button(pw, "more").click();
      await pw.getByRole("button", { name: re(t("export")) }).click();
      await sheet(pw).getByText(t("exportWeChat")).waitFor({ timeout: 5000 });
      ok((await sheet(pw).getByRole("button", { name: t("exportShare"), exact: true }).count()) === 0 && (await sheet(pw).getByRole("button", { name: t("exportSave"), exact: true }).count()) === 0, "导出账目 in WeChat: it says to open 两清 in the phone's browser and export there, with no button that can't work in WeChat");
      await w.close();

      // a computer: no share sheet and no long press; the picture is saved as a file
      const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
      await rooms(d);
      const pd = await open(d);
      await start(pd, "电脑", ["阿甲"]);
      await button(pd, "more").click();
      await pd.getByRole("button", { name: re(t("export")) }).click();
      await sheet(pd).getByText(t("exportEmpty")).waitFor({ timeout: 5000 });
      ok((await sheet(pd).getByRole("button", { name: t("exportSave"), exact: true }).count()) === 0, "导出账目 with nothing recorded: it says so, and there is nothing to save");
      await pd.keyboard.press("Escape");
      await closed(pd);
      await spend(pd, "30");
      await pd.getByRole("tab", { name: t("settle") }).click();
      await makePicture(pd);
      const saving = pd.waitForEvent("download");
      await sheet(pd).getByRole("button", { name: t("pictureSave"), exact: true }).click();
      const file = await saving;
      ok(/^all-square-\d{4}-\d{2}-\d{2}\.png$/.test(file.suggestedFilename()) && (await sheet(pd).locator(".split-picture-hint").count()) === 0, `a computer: 存图片 saves it as a file (${file.suggestedFilename()}), with nothing said about holding it`);
      await pd.keyboard.press("Escape");
      await closed(pd);
      await button(pd, "more").click();
      await pd.getByRole("button", { name: re(t("export")) }).click();
      const exporting = pd.waitForEvent("download");
      await sheet(pd).getByRole("button", { name: t("exportSave"), exact: true }).click();
      const csvFile = await exporting;
      const saved = readFileSync(await csvFile.path(), "utf8");
      ok(/^all-square-\d{4}-\d{2}-\d{2}\.csv$/.test(csvFile.suggestedFilename()) && saved.startsWith("\uFEFF") && saved.split("\r\n").length === 4, `导出账目 on a computer: saved as a file (${csvFile.suggestedFilename()}): the headings, the expense, the totals`);
      await d.close();
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

// ---------- gate: stage two's gate, as far as phones on this machine can take it ----------
// Five phones on one ledger, recording at the same time, end up showing what the server holds, the
// same on all five. One with no signal records three, and they go up once each; one whose answers
// are lost on the way back sends again, and nothing counts twice. Two people changing one expense
// at once: all five show whichever the server took last. The one who paid and the one paid both
// mark the payment, with no signal: it is recorded once. (On real phones, and in WeChat: Steve.)
async function gate() {
  if (!local) {
    console.log("gate: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const people = ["阿甲", "阿乙", "阿丙", "阿丁"];
  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  // the one who starts it, signed in; four friends by the invitation, two of them signed in
  const first = await phone(390, 664, "zh");
  ctxs.push(first);
  const po = await open(first, true);
  await start(po, "五部手机", people);
  await po.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  const started = (await keptBy(po)).held[0];
  const id = started.server.id;
  const key = started.key;
  pages.push(po);
  for (const [i, name] of people.entries()) {
    const ctx = await phone(390, 664, "zh");
    if (i < 2) await signIn(ctx);
    ctxs.push(ctx);
    const page = await ctx.newPage();
    watch(page, true);
    await page.goto(`${base}/split/${id}#k=${key}`);
    await page.locator(".split-who").getByRole("button", { name: re(name) }).click();
    await button(page, "addExpense").waitFor();
    pages.push(page);
  }
  const ledgerOn = async (page: Page) => (await keptBy(page)).held.find((h) => h.server.id === id)!;
  ok((await Promise.all(pages.map(ledgerOn))).every((h) => h.server.members.length === 5), "five phones on one ledger: the one who started it, and four by the invitation (two signed in, two not)");

  // 阿乙's phone: the server takes what it sends, and the answer is lost on the way back, three times
  let lose = 3;
  await ctxs[2].route("**/split/api/ledgers/*/changes", async (route) => {
    if (lose <= 0) return route.fallback();
    lose--;
    await route.fetch();
    await route.abort("connectionreset");
  });
  // all five record at once, six each (phone p's j-th is p·10 + j dollars, so each is its own)
  const amountsOf = (p: number, n: number) => Array.from({ length: n }, (_, j) => (p + 1) * 10 + j + 1);
  await Promise.all(pages.map(async (page, p) => {
    for (const d of amountsOf(p, 6)) await spend(page, String(d));
  }));
  ok(lose === 0, "(阿乙's phone lost the answer to three of its sends)");
  // 阿丙's phone, with no signal, records three; two others record one more each meanwhile
  await ctxs[3].setOffline(true);
  await Promise.all([
    (async () => {
      for (const d of [37, 38, 39]) await spend(pages[3], String(d));
    })(),
    spend(pages[0], "17"),
    spend(pages[1], "27"),
  ]);
  ok((await ledgerOn(pages[3])).waiting.length === 3, "阿丙's phone, with no signal, recorded three: they wait on the phone");
  await ctxs[3].setOffline(false);

  /** Everyone has sent what they had, and holds the server's ledger as it is: the server's, then. */
  const settled = async () => {
    for (let tries = 0; tries < 80; tries++) {
      const server = await onServer(po, id, key);
      const all = await Promise.all(pages.map(ledgerOn));
      if (all.every((h) => h.waiting.length === 0 && h.seq === server.seq)) return server;
      await po.waitForTimeout(400);
    }
    return null;
  };
  let server = await settled();
  const recorded = [...pages.flatMap((_, p) => amountsOf(p, 6)), 37, 38, 39, 17, 27].map((d) => d * 100).sort((x, y) => x - y);
  const live = (entries: { gone?: number; kind?: string; amount?: number }[]) => entries.filter((e) => e.kind === "expense" && e.gone === undefined);
  const onIt = server ? live(server.ledger.entries as { gone?: number; kind?: string; amount?: number }[]).map((e) => e.amount!).sort((x, y) => x - y) : [];
  ok(!!server && JSON.stringify(onIt) === JSON.stringify(recorded), `everything recorded is on the server once: ${onIt.length} of ${recorded.length}, none twice, none missing`);
  const same = async () => {
    const all = await Promise.all(pages.map(ledgerOn));
    const theirs = JSON.stringify(server?.ledger.entries);
    return all.every((h) => JSON.stringify(h.server.entries) === theirs && h.lost.length === 0);
  };
  ok(await same(), "all five hold the server's ledger, entry for entry, and none says anything didn't stick");
  const rows = await Promise.all(pages.map(async (page) => (await page.locator(".split-row-amount").allTextContents()).sort().join(" ")));
  ok(rows.every((r) => r === rows[0]) && rows[0].split(" ").length === recorded.length, "and all five screens show the same rows");

  // two people change one expense at the same moment
  const change = async (page: Page, from: string, to: string) => {
    await page.locator("button.split-row", { hasText: from }).click();
    await page.locator(".split-keys").waitFor();
    // (an expense opened again shows its amount with its cents: "11.00")
    while (((await amountShown(page)) ?? "").replace(/[^0-9.]/g, "") !== "0") await page.locator(".split-key.is-back").click();
    await type(page, to);
    await button(page, "saveChanges").click();
    await page.locator(".split-keys").waitFor({ state: "hidden" });
  };
  await Promise.all([change(pages[0], "$11.00", "71"), change(pages[1], "$11.00", "72")]);
  server = await settled();
  const changed = server ? live(server.ledger.entries as { gone?: number; kind?: string; amount?: number }[]).filter((e) => e.amount === 7100 || e.amount === 7200) : [];
  ok(changed.length === 1 && (await same()), `two people change one expense at once: it is the one the server took last (${(changed[0]?.amount ?? 0) / 100}) on all five`);

  // the one who paid and the one paid both mark the payment as made, neither with a signal
  const settleTab = async (page: Page) => {
    await page.getByRole("tab", { name: t("settle") }).click();
    await page.locator(".split-row").first().waitFor();
  };
  for (const page of pages) await settleTab(page);
  const plans = await Promise.all(pages.map(async (page) => (await page.locator(".split-row").allTextContents()).length));
  ok(plans.every((n) => n === plans[0] && n > 0), `the plan to settle up has the same ${plans[0]} lines on all five`);
  // (the first line of the plan names its two people; the phones that are theirs mark it)
  const firstLine = (await pages[0].locator(".split-row").first().textContent()) ?? "";
  const names = ["我", ...people];
  const whose = names.map((n, i) => ({ n, i })).filter(({ n }) => firstLine.includes(n === "我" ? "你" : n)).map(({ i }) => i);
  const pair = whose.length === 2 ? whose : [0, 1];
  for (const i of pair) await ctxs[i].setOffline(true);
  for (const i of pair) {
    await pages[i].locator(".split-row").first().click();
    await button(pages[i], "markPaid").click();
    await closed(pages[i]);
  }
  for (const i of pair) await ctxs[i].setOffline(false);
  server = await settled();
  const transfers = server ? (server.ledger.entries as { kind?: string; gone?: number }[]).filter((e) => e.kind === "transfer" && e.gone === undefined) : [];
  ok(transfers.length === 1 && (await same()), `the payment, marked on both its people's phones with no signal: recorded once (${transfers.length}), and all five show it so`);
  for (const ctx of ctxs) await ctx.close();
}

// ---------- friends: inviting friends on changle.ca, and their invitations ----------
async function friends() {
  /** The invitations waiting for an account, as the server keeps them. */
  const waitingFor = async (page: Page, account: string) =>
    ((await page.evaluate(`fetch("/split/api/me/invites", { headers: { authorization: "Bearer ${sessionOf(account)}" } }).then((r) => r.json())`)) as { invites: { ledger: string; name: string; member?: string; from: { id: string; name: string } }[] }).invites;
  const sheet = (page: Page) => page.locator("dialog[open]");
  const row = (page: Page, name: string) => sheet(page).locator(".split-person", { hasText: name });

  const ctx = await phone(390, 664, "zh");
  const steve = await signIn(ctx);
  // (a refusal on purpose, and the link changed further down, each leave the browser saying a request was refused)
  const page = await open(ctx, true);
  // starting one: a name typed, and two friends picked (one picked, taken back, and picked again)
  await button(page, "start").click();
  const starting = page.getByRole("dialog");
  await starting.locator("input").nth(0).fill("周五火锅");
  await starting.locator("input").nth(1).fill("我");
  await starting.locator("#split-who-else").fill("阿甲");
  await starting.getByRole("button", { name: t("add"), exact: true }).click();
  const pills = starting.locator("fieldset", { hasText: t("pickFriends") }).getByRole("button");
  ok((await pills.allTextContents()).join(",") === CAST.map(([, name]) => name).join(","), `开一个账本: the friends on changle.ca to pick, every one (${(await pills.allTextContents()).join(",")})`);
  await starting.getByRole("button", { name: "阿美", exact: true, pressed: false }).click();
  await starting.getByRole("button", { name: "Mia", exact: true, pressed: false }).click();
  await starting.getByRole("button", { name: "Mia", exact: true, pressed: true }).click();
  const chips = () => starting.locator(".split-chips .ui-roster-name").allTextContents();
  ok((await chips()).join(",") === "阿甲,阿美", `picked, a friend is one of the people; picked again, taken back (${(await chips()).join(",")})`);
  await starting.getByRole("button", { name: "Mia", exact: true, pressed: false }).click();
  await starting.getByText(t("pickedNote").split("\n")[0]).waitFor();
  await starting.getByRole("button", { name: t("startIt"), exact: true }).click();

  // it comes up with the invitation open: the two picked are invited as the server has the ledger, and told in the chat
  await row(page, "阿美").getByRole("button", { name: t("friendInvited"), exact: true }).waitFor({ timeout: 15_000 });
  await sheet(page).getByRole("button", { name: t("friendsMore").replace("{n}", "2"), exact: true }).click();
  await row(page, "Mia").getByRole("button", { name: t("friendInvited"), exact: true }).waitFor();
  const kept = await keptBy(page);
  const ledger = kept.held[0].server;
  const idOf = (name: string) => ledger.members.find((m) => m.name === name)?.id;
  const amy = friendOf(steve, "Amy");
  const mia = friendOf(steve, "Mia");
  const wang = friendOf(steve, "Wang");
  const toAmy = await waitingFor(page, amy);
  const toMia = await waitingFor(page, mia);
  ok(toAmy.length === 1 && toAmy[0].ledger === ledger.id && toAmy[0].member === idOf("阿美") && toMia[0]?.member === idOf("Mia") && toAmy[0].from.id === steve, "each friend picked has the invitation waiting in their account, for the person made for them");
  const told = chats.filter((c) => c.from === steve);
  ok(told.length === 2 && told.some((c) => c.to === amy) && told.some((c) => c.to === mia) && told.every((c) => c.body.includes("周五火锅")), `and each is told once in the site's chat (${told.length})`);

  // one invited from the sheet: someone who isn't in the ledger, so nobody in it is said for them
  await row(page, "小王").getByRole("button", { name: t("inviteShort"), exact: true }).click();
  await row(page, "小王").getByRole("button", { name: t("friendInvited"), exact: true }).waitFor();
  ok((await row(page, "小王").getByRole("button").isDisabled()) && (await waitingFor(page, wang))[0]?.member === undefined, "邀请 on a friend's line: invited (and the button says so, and can't be pressed again); nobody in the ledger is said for them");
  ok(chats.filter((c) => c.from === steve && c.to === wang).length === 1, "told in the chat too");
  // a friend who isn't one any more, as the server says
  await page.route("**/split/api/ledgers/*/invites", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "friends" }) }));
  await row(page, "Jason").getByRole("button", { name: t("inviteShort"), exact: true }).click();
  await sheet(page).getByText(t("friendNotFriend").replace("{who}", "Jason")).waitFor();
  ok((await row(page, "Jason").getByRole("button", { name: t("inviteShort"), exact: true }).isEnabled()) && !chats.some((c) => c.to === friendOf(steve, "Jason")), "not a friend any more: said under the list, by name; the line can be tried again, and nobody is told");
  await page.unroute("**/split/api/ledgers/*/invites");
  await page.keyboard.press("Escape");
  await closed(page);

  // the ledger's page: the faces open the people, 邀请 the invitation, which still knows who was invited
  await page.locator(".split-crew-faces").click();
  await page.getByRole("dialog").getByText(t("addPerson")).waitFor();
  ok(true, "the faces open the people");
  await page.keyboard.press("Escape");
  await closed(page);
  await page.locator(".split-crew").getByRole("button", { name: t("inviteShort"), exact: true }).click();
  await row(page, "小王").getByRole("button", { name: t("friendInvited"), exact: true }).waitFor();
  ok(true, "邀请 opens the invitation, and a friend invited earlier is still said to be");
  await page.keyboard.press("Escape");
  await closed(page);

  // 小王's phone: the invitation waits on the page of ledgers; joined, they say which one they are (nobody was said)
  const wangs = await phone(390, 664, "zh");
  await signIn(wangs, wang);
  const wp = await wangs.newPage();
  // (their phone is let go when the link changes, further down: the browser says a request was refused)
  watch(wp, true);
  await wp.goto(`${base}/split`);
  const card = wp.locator(".split-invitation", { hasText: "周五火锅" });
  await card.waitFor();
  ok((await card.textContent())?.includes(t("invitedBy").replace("{who}", "Check")), "the invitation says who sent it");
  ok((await wp.locator(".ui-empty").count()) === 0, "and with it on the page, the page isn't empty");
  await card.getByRole("button", { name: t("inviteJoin"), exact: true }).click();
  await wp.locator(".split-who").waitFor();
  await wp.locator("#split-add-me").fill("小王");
  await wp.getByRole("button", { name: t("addMe"), exact: true }).click();
  await wp.locator(".split-crew").waitFor();
  await wp.waitForTimeout(1500);
  ok((await waitingFor(wp, wang)).length === 0 && (await myLedgers(wp)).ledgers.some((l) => l.id === ledger.id), "joined: the ledger is in 小王's account, and the invitation is used up");

  // Mia's phone: turned down
  const mias = await phone(390, 664, "zh");
  await signIn(mias, mia);
  const mp = await mias.newPage();
  watch(mp);
  await mp.goto(`${base}/split`);
  await mp.locator(".split-invitation").getByRole("button", { name: t("inviteNo").replace("{name}", "周五火锅"), exact: true }).click();
  await mp.locator(".split-invitation").waitFor({ state: "detached" });
  await mp.waitForTimeout(800);
  await mp.reload();
  await button(mp, "start").waitFor();
  await mp.waitForTimeout(1500);
  ok((await mp.locator(".split-invitation").count()) === 0 && (await waitingFor(mp, mia)).length === 0, "turned down: gone from the page, and from the account");

  // a phone with the link, signed out: the invitation sheet says signing in brings friends
  const link = `${base}/split/${ledger.id}#k=${kept.held[0].key}`;
  const guests = await phone(390, 664, "zh");
  const gp = await guests.newPage();
  watch(gp);
  await gp.goto(link);
  await gp.getByRole("button", { name: t("justLook"), exact: true }).click();
  await gp.locator(".split-crew").getByRole("button", { name: t("inviteShort"), exact: true }).click();
  await sheet(gp).getByText(t("friendsSignIn")).waitFor();
  ok((await sheet(gp).getByRole("button", { name: t("signIn"), exact: true }).count()) === 1 && (await sheet(gp).locator(".split-qr").count()) === 1, "signed out: a line saying signing in brings your friends, a way to, and the code and link as ever");
  await guests.close();

  // the owner changes the link: 阿美's invitation no longer opens the ledger, and says so
  await button(page, "more").click();
  await page.getByRole("button", { name: re(t("rekey")) }).click();
  await page.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).click();
  await page.getByRole("dialog").getByText(t("rekeyDone")).waitFor({ timeout: 15_000 });
  await row(page, "小王").getByRole("button", { name: t("inviteShort"), exact: true }).waitFor();
  ok(true, "the link changed: the friends invited with the old one can be invited again");
  await page.keyboard.press("Escape");
  await closed(page);
  const amys = await phone(390, 664, "zh");
  await signIn(amys, amy);
  const ap = await amys.newPage();
  watch(ap, true);
  await ap.goto(`${base}/split`);
  await ap.locator(".split-invitation").getByRole("button", { name: t("inviteJoin"), exact: true }).click();
  await ap.locator(".split-invitation").getByText(t("inviteStale")).waitFor();
  await ap.waitForTimeout(800);
  ok((await ap.locator(".split-invitation").getByRole("button", { name: t("inviteJoin"), exact: true }).count()) === 0 && (await waitingFor(ap, amy)).length === 0, "阿美 opens hers: it says it no longer opens the ledger, and is gone from her account");

  // locked: nobody new, so no 邀请 (the faces still open the people)
  await button(page, "more").click();
  await page.getByRole("button", { name: re(t("lockIt")) }).click();
  await page.getByRole("button", { name: re(t("unlockIt")) }).waitFor();
  await page.keyboard.press("Escape");
  await closed(page);
  ok((await page.locator(".split-crew .ui-button").count()) === 0 && (await page.locator(".split-crew-faces").count()) === 1, "a locked ledger: the faces, and no 邀请");

  // an account with no friends on changle.ca: nothing to pick, and the invitation says where friends come from
  const lone = await phone(390, 664, "zh");
  await signIn(lone, `lone${randomBytes(6).toString("hex")}`);
  const lp = await open(lone);
  await button(lp, "start").click();
  await lp.getByRole("dialog").locator("#split-who-else").waitFor();
  await lp.waitForTimeout(800);
  ok((await lp.getByRole("dialog").getByText(t("pickFriends")).count()) === 0, "no friends: nothing to pick while starting");
  await lp.keyboard.press("Escape");
  await closed(lp);
  await start(lp, "独自", ["阿甲"]).catch(() => undefined);
  await lp.locator(".split-crew").getByRole("button", { name: t("inviteShort"), exact: true }).click();
  await sheet(lp).getByText(t("friendsNone")).waitFor();
  ok(true, "and the invitation says friends there can be invited here");
  for (const c of [ctx, wangs, mias, amys, lone]) await c.close();
}

// ---------- reading: a receipt read for its amount ----------
async function reading() {
  const a = await phone(390, 664, "zh");
  // (one read refused on purpose, further down, leaves the browser saying so)
  const pa = await open(a, true);
  await start(pa, "小票", ["阿甲"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made`);
  const asked: string[] = [];
  pa.on("request", (r) => {
    if (/\/files\/[^/]+\/read$/.test(new URL(r.url()).pathname)) asked.push(r.method());
  });
  const amount = () => pa.locator(".split-add-amount output").textContent();
  const line = pa.locator(".split-add-read");
  const attach = (text: string) => pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: aPdf(text) });
  const hint = pa.locator(".split-add-hint");

  // a new expense with nothing typed says a receipt can fill it in; the line opens the camera
  await button(pa, "addExpense").click();
  await hint.filter({ hasText: t("readHint") }).waitFor();
  await pa.screenshot({ path: join(out, "read-hint-zh-390x664.png") });
  const box = await hint.boundingBox();
  ok(!!box && box.height >= 44, `a new expense says a receipt fills the amount in, on a block big enough to press (${Math.round(box?.height ?? 0)}px)`);
  let hold = true;
  let through = 0; // reads let past the hold, one each
  await a.route("**/split/api/ledgers/*/files/*/read", async (route) => {
    while (hold && through === 0) await new Promise((r) => setTimeout(r, 100));
    if (hold) through--;
    await route.fallback();
  });
  const [chooser] = await Promise.all([pa.waitForEvent("filechooser"), hint.click()]);
  await chooser.setFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:42.50 CAD Tim Hortons") });
  ok(true, "and pressing it opens the photo picker, as the camera button does");
  await line.filter({ hasText: t("readingReceipt") }).waitFor({ timeout: 15_000 });
  await pa.locator(".split-photo-button.is-scanning .split-thumb").waitFor({ timeout: 15_000 });
  await pa.screenshot({ path: join(out, "read-busy-zh-390x664.png") });
  ok(true, "while it is read, the line under the amount says Google is reading it");
  // (this phone asks for less motion: the scan's corners only, round the amount as it is)
  const quiet = await pa.evaluate(() => {
    const scan = document.querySelector(".split-add-amount.is-scanning > .split-scan");
    const roll = document.querySelector(".split-scan-digit > :last-child");
    if (!scan || !roll) return null;
    return {
      corners: getComputedStyle(scan, "::before").backgroundImage.split("linear-gradient").length - 1,
      sweep: getComputedStyle(scan, "::after").display,
      thumb: getComputedStyle(document.querySelector(".split-photo-button")!, "::after").display,
      roll: getComputedStyle(roll).animationName,
      shown: getComputedStyle(document.querySelector(".split-add-amount > output")!).opacity,
    };
  });
  ok(!!quiet && quiet.corners === 8 && quiet.sweep === "none" && quiet.thumb === "none" && quiet.roll === "none" && quiet.shown === "1", `with less motion asked for, the scan is its corners round the amount as it is: nothing sweeps or rolls (${JSON.stringify(quiet)})`);
  hold = false;
  const extras = pa.locator(".split-add-extras");
  await extras.filter({ hasText: "Tim Hortons" }).waitFor({ timeout: 15_000 });
  await pa.screenshot({ path: join(out, "read-done-zh-390x664.png") });
  ok((await amount()) === "$42.50" && (await extras.textContent())?.startsWith("从小票读的：Tim Hortons") && (await noteOf(pa)) === "" && asked.length === 1, `read: the amount ($42.50), and the line says the business it read (the note stays the person's own) (${await extras.textContent()}, asked ${asked.length} time)`);
  await pa.keyboard.press("Backspace");
  ok((await line.count()) === 0 && (await amount()) !== "$42.50", `the amount changed: it is the person's now, and the line goes (${await amount()})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // an amount typed first: nothing is read
  await button(pa, "addExpense").click();
  await hint.waitFor();
  await type(pa, "9");
  ok((await hint.count()) === 0, "a key pressed: the hint gives way to the amount");
  await attach("receipt:42.50 CAD Tim Hortons");
  await pa.locator(".split-photo-button img, .split-photo-button .split-thumb").first().waitFor({ timeout: 15_000 });
  await pa.waitForTimeout(800);
  ok(asked.length === 1 && (await amount()) === "$9", "with an amount typed first, the receipt isn't read: what was typed stands");
  await pa.locator(".split-key.is-back").click();
  await pa.waitForTimeout(300);
  ok(!(await amount())?.match(/[1-9]/) && (await hint.count()) === 0, "a receipt already there, the amount taken back to nothing: no hint");
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // an expense being changed (no photo), its amount taken back to nothing: no hint either
  await button(pa, "addExpense").click();
  await type(pa, "3");
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  await pa.locator(".split-row").first().click();
  await pa.locator(".split-keys").waitFor();
  for (let i = 0; i < 6; i++) await pa.locator(".split-key.is-back").click();
  await pa.waitForTimeout(300);
  ok(!(await amount())?.match(/[1-9]/) && (await hint.count()) === 0, "an expense being changed, its amount taken back to nothing: no hint");
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // an amount typed while it is being read: what was typed stands, and nothing of the reading goes in
  await button(pa, "addExpense").click();
  hold = true;
  await attach("receipt:42.50 CAD Tim Hortons");
  await line.filter({ hasText: t("readingReceipt") }).waitFor({ timeout: 15_000 });
  // (there, and being read: typed while it is still going, it wouldn't be read at all)
  await pa.locator(".split-photo-button:not(.is-sending) .split-thumb").waitFor({ timeout: 15_000 });
  await type(pa, "8");
  const answered = pa.waitForResponse((r) => /\/files\/[^/]+\/read$/.test(new URL(r.url()).pathname));
  hold = false;
  await answered;
  await pa.waitForTimeout(400);
  const note = await noteOf(pa);
  ok((await amount()) === "$8" && !note && (await line.count()) === 0, `typed while it was being read: what was typed stands, the note stays empty, the line goes (${await amount()} ${JSON.stringify(note)})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // nothing on it to read: said, until a key is pressed
  await button(pa, "addExpense").click();
  await attach("receipt:none");
  await line.filter({ hasText: t("readNothing") }).waitFor({ timeout: 15_000 });
  ok((await amount()) === "$0" || !(await amount())?.match(/[1-9]/), "nothing read: the amount stays empty, and the line says to type it");
  await type(pa, "5");
  ok((await line.count()) === 0, "a key pressed: the line goes");
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // nothing read off one: the next photo is read
  await button(pa, "addExpense").click();
  await attach("receipt:none");
  await line.filter({ hasText: t("readNothing") }).waitFor({ timeout: 15_000 });
  await attach("receipt:7.25 CAD Second Cup");
  await extras.filter({ hasText: "Second Cup" }).waitFor({ timeout: 15_000 });
  ok((await amount()) === "$7.25", `nothing read off the first: the next photo is read (${await amount()})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // paid in another currency: the currency is the receipt's, at a rate, and the rate's line is said instead
  await button(pa, "addExpense").click();
  await attach("receipt:3200 JPY Ichiran Ramen");
  await pa.locator(".split-add-comes").waitFor({ timeout: 15_000 });
  ok((await amount()) === "JP¥3,200" && (await pa.locator(".split-currency").textContent())?.includes("日元") && (await line.count()) === 0, `in yen: the currency changes to the receipt's, the rate's line is said, not the receipt's (${await amount()})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // a receipt with a tip, tax and a day in it: kept with the expense, said under the amount, beside
  // 记好了 and on its row, put right in the sheet with the day, the tip and the tax; summed up at the foot of 结清
  const today = localDay(Date.now());
  const ago = (days: number) => localDay(Date.now() - days * 86_400_000);
  const dayButton = detailsLine(pa);
  await button(pa, "addExpense").click();
  ok((await dayButton.innerText()).includes(t("dayToday")), `a new expense is spent today (${await dayButton.innerText()})`);
  await attach(`receipt:123.00 CAD Joe's Diner tip=18.00 tax=5.25 date=${ago(5)}`);
  await extras.filter({ hasText: "Joe's Diner" }).waitFor({ timeout: 15_000 });
  ok((await amount()) === "$123.00" && (await extras.textContent())?.includes("从小票读的：Joe's Diner · 含小费 $18.00 · 税 $5.25"), `a receipt with a tip and tax: the amount, and the line says what of it was tip and tax (${await extras.textContent()})`);
  ok((await dayButton.innerText()).includes(dayLabel(ago(5), today, "zh")), `and beside 记好了, the day on the receipt (${await dayButton.innerText()})`);
  await pa.screenshot({ path: join(out, "read-extras-zh-390x664.png") });
  await extras.click();
  const fields = pa.locator("dialog[open] .split-extras input");
  const dayField = pa.locator('dialog[open] input[type="date"]');
  await fields.first().waitFor();
  ok((await fields.nth(0).inputValue()) === "18.00" && (await fields.nth(1).inputValue()) === "5.25" && (await dayField.inputValue()) === ago(5), "pressing it opens the sheet with the day, the tip and the tax, to put right");
  ok((await dayField.getAttribute("max")) === today, "no day after today can be picked");
  await pa.screenshot({ path: join(out, "read-extras-sheet-zh-390x664.png") });
  await fields.nth(0).fill("200");
  await pa.locator("dialog[open] .split-extras .split-note").waitFor();
  ok(true, "a tip that with the tax comes to more than the expense: the sheet says it won't be kept");
  await pa.screenshot({ path: join(out, "read-extras-over-zh-390x664.png") });
  await fields.nth(0).fill("20,5");
  ok((await fields.nth(0).inputValue()) === "20.5" && (await pa.locator("dialog[open] .split-extras .split-note").count()) === 0, "put right (a comma typed is a dot): nothing said");
  await dayField.fill(ago(6));
  await pa.keyboard.press("Escape");
  await closed(pa);
  ok((await extras.textContent())?.includes("含小费 $20.50 · 税 $5.25"), `back on the expense, the line says the tip as put right (${await extras.textContent()})`);
  ok((await dayButton.innerText()).includes(dayLabel(ago(6), today, "zh")), `and the day picked (${await dayButton.innerText()})`);
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  await pa.locator(".split-row-extras", { hasText: "小费 $20.50 · 税 $5.25" }).waitFor();
  ok(true, "its row says the tip and tax");
  const dayOf = (note: string) => pa.locator(".split-day", { has: pa.locator(".split-row", { hasText: note }) }).locator(".split-day-head").innerText();
  ok((await dayOf("Joe's Diner")) === dayLabel(ago(6), today, "zh", true) && (await dayOf(t("noNote"))) === dayLabel(today, today, "zh", true), `and it is under its own day, the one recorded today under 今天 (${await dayOf("Joe's Diner")}, ${await dayOf(t("noNote"))})`);
  await pa.screenshot({ path: join(out, "read-extras-row-zh-390x664.png") });
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const onServer = (await keptBy(pa)).held[0].server.entries as { note?: string; tip?: number; tax?: number; date?: string }[];
  const joes = onServer.find((e) => (e as { merchant?: string }).merchant === "Joe's Diner");
  ok(joes?.tip === 2050 && joes?.tax === 525 && joes?.date === ago(6), `the server keeps them, and the day (${joes?.tip}, ${joes?.tax}, ${joes?.date})`);
  await pa.locator(".split-row", { hasText: "Joe's Diner" }).click();
  await pa.locator(".split-keys").waitFor();
  ok((await extras.textContent())?.includes("含小费 $20.50 · 税 $5.25") && !(await extras.textContent())?.includes("从小票"), "opened again, the line says the tip and tax it keeps");
  for (let i = 0; i < 6; i++) await pa.locator(".split-key.is-back").click();
  await type(pa, "10");
  ok((await extras.count()) === 0 && (await detailsLine(pa).innerText()).includes("Joe's Diner"), "the amount typed down below them: the line under it goes (they wouldn't be kept), the business stays on the 详情 line");
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // a day picked first stays when a receipt with another day is read
  await button(pa, "addExpense").click();
  await dayButton.click();
  await dayField.waitFor();
  await dayField.fill(ago(3));
  await pa.keyboard.press("Escape");
  await closed(pa);
  await attach(`receipt:9.00 CAD Kiosk date=${ago(8)}`);
  await extras.or(pa.locator(".split-add-read")).first().waitFor({ timeout: 15_000 });
  await pa.waitForFunction(`!document.querySelector(".split-add-read")?.textContent?.includes(${JSON.stringify(t("readingReceipt"))})`);
  ok((await amount()) === "$9.00" && (await dayButton.innerText()).includes(dayLabel(ago(3), today, "zh")), `a day picked by hand stays when a receipt with another day is read (${await dayButton.innerText()})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // no receipt: a tip typed in the same sheet, from the button beside 记好了
  await button(pa, "addExpense").click();
  await type(pa, "50");
  await dayButton.click();
  await fields.first().waitFor();
  await fields.nth(0).fill("5");
  await pa.keyboard.press("Escape");
  await closed(pa);
  ok((await extras.textContent())?.includes("含小费 $5.00"), `no receipt: a tip typed in the sheet, said under the amount (${await extras.textContent()})`);
  await pa.screenshot({ path: join(out, "read-tip-typed-zh-390x664.png") });
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  await pa.locator(".split-row-extras", { hasText: "小费 $5.00" }).waitFor();
  ok(true, "and on its row");

  await pa.getByRole("tab", { name: t("settle") }).click();
  const summary = pa.locator(".split-summary");
  await summary.waitFor();
  const summed = async (k: Word) => (await summary.locator("div", { has: pa.locator("dt", { hasText: new RegExp(`^${t(k)}$`) }) }).locator("dd").innerText()).replace(/\s+/g, " ");
  const got = [await summed("summarySpent"), await summed("summaryTips"), await summed("summaryTax"), await summed("summaryPaidMost"), await summed("summarySpentMost")];
  ok(JSON.stringify(got) === JSON.stringify(["$176.00 3 笔", "$25.50 2 笔里的", "$5.25 1 笔里的", "你 $176.00", "一样多 每人 $88.00"]), `结清 ends with the summary: spent, tips, tax, who paid the most, whose share came to the most (both: 一样多) (${got.join(" | ")})`);
  await summary.scrollIntoViewIfNeeded();
  await pa.screenshot({ path: join(out, "read-summary-zh-390x664.png") });
  await pa.getByRole("tab", { name: t("expenses") }).click();

  // where it was bought and how it was paid (Steve, 2026-11-18): the business named under the amount;
  // all three in the details sheet, where one typed before is never replaced; kept by the server; the
  // row says the business when there is no note; emptied in the sheet, taken off
  const lines3 = pa.locator('dialog[open] .split-details > .split-field:not(:first-child) input:not([type="date"])');
  await button(pa, "addExpense").click();
  await dayButton.click();
  await lines3.first().waitFor();
  ok((await pa.locator("dialog[open] h2").first().innerText()) === t("details") && (await lines3.count()) === 3 && (await noteInSheet(pa).count()) === 1, `the sheet the 详情 line opens is the expense's details: the note first, a name, a place and what paid, with the day and the tip and tax (${await pa.locator("dialog[open] h2").first().innerText()})`);
  await lines3.nth(2).fill("Visa");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await attach("receipt:20.00 CAD McDonald's place=Aldergrove,_BC paid=Mastercard tax=1.38");
  await extras.filter({ hasText: "McDonald's" }).waitFor({ timeout: 15_000 });
  ok((await extras.textContent())?.startsWith("从小票读的：McDonald's · 含税 $1.38"), `read: the line names the business before the tax (${await extras.textContent()})`);
  await extras.click();
  await lines3.first().waitFor();
  const shown3 = [await lines3.nth(0).inputValue(), await lines3.nth(1).inputValue(), await lines3.nth(2).inputValue()];
  ok(JSON.stringify(shown3) === JSON.stringify(["McDonald's", "Aldergrove, BC", "Visa"]), `the sheet has the business and the place read off it, and what paid as typed before it was read (${shown3.join(" / ")})`);
  await pa.screenshot({ path: join(out, "read-details-zh-390x664.png") });
  await lines3.nth(2).fill("Mastercard");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  const mcd = pa.locator(".split-row", { hasText: "McDonald's" });
  await mcd.waitFor();
  ok(!(await mcd.locator("strong").first().getAttribute("class"))?.includes("is-quiet"), "its row says the business, there being no note");
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const kept3 = ((await keptBy(pa)).held[0].server.entries as { merchant?: string; place?: string; payment?: string }[]).find((e) => e.merchant === "McDonald's");
  ok(kept3?.place === "Aldergrove, BC" && kept3?.payment === "Mastercard", `the server keeps all three (${JSON.stringify(kept3 && [kept3.merchant, kept3.place, kept3.payment])})`);
  await mcd.click();
  await pa.locator(".split-keys").waitFor();
  await dayButton.click();
  await lines3.first().waitFor();
  await lines3.nth(1).fill("");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const after3 = ((await keptBy(pa)).held[0].server.entries as { merchant?: string; place?: string; payment?: string }[]).find((e) => e.merchant === "McDonald's");
  ok(after3 && after3.place === undefined && after3.payment === "Mastercard", `opened again and its place emptied: the place is taken off, the rest stays (${JSON.stringify(after3 && [after3.merchant, after3.place, after3.payment])})`);

  // several receipts at once, an expense each (Steve, 2026-11-18): chosen together from the button
  // beside 记一笔; each goes, is read and scans while it is; each row says what was read and its
  // amount, to put right or type; one cleared is left out; one button records the rest, each with its photo
  const receiptsButton = pa.locator(".split-receipts-button");
  ok((await receiptsButton.innerText()).includes(t("receiptsButton")), "beside 记一笔, a button for several receipts");
  hold = true;
  const [many] = await Promise.all([pa.waitForEvent("filechooser"), receiptsButton.click()]);
  await many.setFiles([
    { name: "a.pdf", mimeType: "application/pdf", buffer: aPdf(`receipt:20.00 CAD McDonald's place=Aldergrove,_BC paid=Mastercard date=${ago(2)}`) },
    { name: "b.pdf", mimeType: "application/pdf", buffer: aPdf(`receipt:8.50 CAD Tim Hortons date=${ago(1)}`) },
    { name: "c.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:10.00 USD Starbucks") },
    { name: "d.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:15.00 CAD Kiosk") },
    { name: "e.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:none") },
    { name: "f.pdf", mimeType: "application/pdf", buffer: aPdf(`receipt:20.00 CAD McDonald's place=Aldergrove,_BC paid=Mastercard date=${ago(2)}`) },
  ]);
  const batch = pa.locator(".split-batch-row");
  const record4 = pa.locator(".split-batch .split-dock button");
  await batch.nth(5).waitFor();
  await pa.locator(".split-batch-thumb.is-scanning").first().waitFor();
  ok((await batch.count()) === 6 && (await record4.isDisabled()) && (await record4.innerText()) === t("receiptsReading"), "a row for each, scanning while it goes and is read; nothing to record yet, the button says so");
  await pa.screenshot({ path: join(out, "receipts-busy-zh-390x664.png") });
  through = 1;
  await pa.waitForFunction(`document.querySelectorAll(".split-batch-thumb.is-scanning").length === 5`, null, { timeout: 30_000 });
  ok((await record4.isDisabled()) && (await record4.innerText()) === t("receiptsReading"), "one read, the rest still going: nothing can be recorded until all are read");
  hold = false;
  await pa.waitForFunction(`!document.querySelector(".split-batch-thumb.is-scanning")`, null, { timeout: 30_000 });
  const said4 = async (n: number) => (await batch.nth(n).locator(".split-batch-what").innerText()).replace(/\s+/g, " ");
  const amount4 = (n: number) => batch.nth(n).locator("input");
  const rows4 = [await said4(0), await said4(1), await said4(2), await said4(3), await said4(4), await said4(5)];
  const amounts4 = [await amount4(0).inputValue(), await amount4(1).inputValue(), await amount4(2).inputValue(), await amount4(3).inputValue(), await amount4(4).inputValue(), await amount4(5).inputValue()];
  ok(
    rows4[0].includes("McDonald's") && rows4[0].includes(dayLabel(ago(2), today, "zh")) && rows4[0].includes("Aldergrove, BC") && rows4[1].includes("Tim Hortons") && rows4[2].includes("Starbucks") && rows4[3].includes("Kiosk") && rows4[4] === t("receiptsNone") && JSON.stringify(amounts4) === JSON.stringify(["20.00", "8.50", "10.00", "15.00", "", ""]),
    `each row: the business, its day and place, and the amount read; the one not read asks for its amount (${rows4.join(" | ")}; ${amounts4.join(", ")})`,
  );
  ok(rows4[5].includes("McDonald's") && rows4[5].includes("和第 1 张合成一笔") && amounts4[5] === "", `the same receipt twice: one bill, the second taken into the first, its row saying so (${rows4[5]}; ${JSON.stringify(amounts4[5])})`);
  await pa.screenshot({ path: join(out, "receipts-read-zh-390x664.png") });
  await amount4(4).fill("12");
  await amount4(3).fill("");
  ok((await record4.innerText()) === "记上 4 笔" && !(await record4.isDisabled()), `one typed, one cleared: four to record (${await record4.innerText()})`);
  const dropped4: string[] = [];
  pa.on("request", (r) => {
    if (r.method() === "DELETE" && /\/files\/[^/]+$/.test(new URL(r.url()).pathname)) dropped4.push(r.url());
  });
  await record4.click();
  await pa.locator(".split-batch").waitFor({ state: "detached" });
  await pa.waitForTimeout(600);
  ok(dropped4.length === 1, `the photo of the one cleared goes from the server again; the four recorded stay, the McDonald's twice on its one expense (${dropped4.length} taken off)`);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  type Kept4 = { amount: number; note: string; payer: string; merchant?: string; place?: string; payment?: string; date?: string; files?: string[]; split?: { how: string }; paidIn?: { currency: string; amount: number } };
  const all4 = (await keptBy(pa)).held[0].server.entries as Kept4[];
  const mine4 = all4.slice(-4);
  ok(
    mine4.map((e) => `${e.amount} ${e.merchant ?? "-"} ${e.date ?? "-"} ${e.files?.length ?? 0}`).join(" | ") === `2000 McDonald's ${ago(2)} 2 | 850 Tim Hortons ${ago(1)} 1 | ${Math.round(1000 * RATES.CAD)} Starbucks ${today} 1 | 1200 - ${today} 1` &&
      mine4[2].paidIn?.currency === "USD" &&
      mine4[2].paidIn?.amount === 1000 &&
      mine4[0].place === "Aldergrove, BC" &&
      mine4[0].payment === "Mastercard" &&
      mine4.every((e) => e.split?.how === "equal") &&
      !all4.some((e) => e.merchant === "Kiosk"),
    `recorded in the order chosen, each with its photo, what was read and the day (today, for the one typed); the one in US dollars converted at today's rate; the cleared one left out (${mine4.map((e) => `${e.amount} ${e.merchant ?? "-"} ${e.date ?? "-"} ${e.files?.length ?? 0}`).join(" | ")})`,
  );
  await pa.locator(".split-row", { hasText: "Tim Hortons" }).waitFor();
  ok(true, "and they are in the ledger's list");
  await pa.screenshot({ path: join(out, "receipts-done-zh-390x664.png") });

  // the same receipt read in 记一笔 once it is recorded (Steve, 2026-11-19: 提示是不是有重复的 receipt):
  // said in place of the line under the amount, the amount still filled in; typed over, it goes
  await button(pa, "addExpense").click();
  await pa.locator(".split-keys").waitFor();
  await attach(`receipt:20.00 CAD McDonald's place=Aldergrove,_BC paid=Mastercard date=${ago(2)}`);
  const twinLine = pa.locator(".split-add-read.is-twin");
  await twinLine.waitFor({ timeout: 15_000 });
  ok((await twinLine.innerText()) === `像是记过了：${dayLabel(ago(2), today, "zh")} McDonald's $20.00` && (await amount()) === "$20.00", `a receipt read that looks like one recorded: said where the line was, the amount still filled in (${await twinLine.innerText()})`);
  await pa.screenshot({ path: join(out, "read-twin-zh-390x664.png") });
  await pa.keyboard.press("Backspace");
  ok((await twinLine.count()) === 0 && (await amount()) === "$20.0", `the amount changed: it is the person's, and nothing is said (${await amount()})`);
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // several photos chosen at once in 记一笔 (Steve, 2026-11-19: 加入了三个 receipt，只显示了一个): asked
  // first whether they are an expense each (几张小票 in its place) or all this one's
  const two = [
    { name: "s1.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:7.00 CAD Subway") },
    { name: "s2.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:9.00 CAD Wendy's") },
  ];
  const ask = pa.getByRole("dialog");
  await button(pa, "addExpense").click();
  await pa.locator(".split-keys").waitFor();
  await pa.locator(".split-note-row input[type=file]").setInputFiles(two);
  await ask.getByRole("button", { name: "分开记 2 笔", exact: true }).waitFor();
  ok((await ask.locator("h2").first().innerText()) === "2 张照片" && (await pa.locator(".split-photo-button .split-thumb").count()) === 0, "two photos chosen at once for a new expense: asked first, nothing sent yet");
  await pa.screenshot({ path: join(out, "several-ask-zh-390x664.png") });
  await ask.getByRole("button", { name: "分开记 2 笔", exact: true }).click();
  await batch.nth(1).waitFor();
  await pa.waitForFunction(`!document.querySelector(".split-batch-thumb.is-scanning")`, null, { timeout: 30_000 });
  ok((await batch.count()) === 2 && (await said4(0)).includes("Subway") && (await said4(1)).includes("Wendy's") && (await record4.innerText()) === "记上 2 笔", "分开记: 几张小票 in its place, a row each, each read");
  await pa.goBack();
  await pa.locator(".split-batch").waitFor({ state: "detached" });
  await pa.waitForTimeout(300);
  ok((await pa.locator(".split-receipts-button").count()) === 1 && (await pa.locator(".split-keys").count()) === 0, "the phone's back closes it: back on the ledger's list, not on 记一笔");
  await button(pa, "addExpense").click();
  await pa.locator(".split-keys").waitFor();
  await pa.locator(".split-note-row input[type=file]").setInputFiles(two);
  await ask.getByRole("button", { name: t("severalOne"), exact: true }).click();
  await closed(pa);
  await extras.filter({ hasText: "Subway" }).waitFor({ timeout: 15_000 });
  await pa.locator(".split-photo-button:not(.is-sending) .split-photo-count").waitFor({ timeout: 15_000 });
  ok((await amount()) === "$7.00" && (await pa.locator(".split-photo-count").innerText()) === "2", "都放在这一笔: both photos on the one expense; two bills, so the first read for its amount");
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });

  // an itemized receipt and the card slip that adds the tip are one bill (Steve, 2026-11-21: Deer Garden,
  // "supposed to be 1 bill based on the time, amount, name of the place"): in 记一笔 as this one's photos,
  // both read and put together; in 几张小票, the first row takes the second in
  const bill = [
    { name: "r.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:40.45 CAD Deer Garden tax=1.93 date=2026-10-15 time=21:01 place=Vancouver,_BC") },
    { name: "t.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:45.30 CAD DEER GARDEN SIGNATURE tip=4.85 date=2026-10-15 time=21:04 paid=Debit") },
  ];
  await button(pa, "addExpense").click();
  await pa.locator(".split-keys").waitFor();
  await pa.locator(".split-note-row input[type=file]").setInputFiles(bill);
  await ask.getByRole("button", { name: t("severalOne"), exact: true }).click();
  await closed(pa);
  await extras.filter({ hasText: "Deer Garden" }).waitFor({ timeout: 15_000 });
  const billLine = await extras.innerText();
  const billDetails = await detailsLine(pa).innerText();
  ok(
    (await amount()) === "$45.30" && billLine.includes("小费 $4.85") && billLine.includes("税 $1.93") && billDetails.includes("Deer Garden") && billDetails.includes("Debit") && !billDetails.includes("Signature"),
    `都放在这一笔, a receipt and its card slip: both read and put together, the total with the tip, the tax, the shorter name, how it was paid (${await amount()}; ${billLine}; ${billDetails})`,
  );
  await pa.screenshot({ path: join(out, "bill-one-zh-390x664.png") });
  await button(pa, "close").first().click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  const [chooser5] = await Promise.all([pa.waitForEvent("filechooser"), pa.locator(".split-receipts-button").click()]);
  await chooser5.setFiles(bill);
  await batch.nth(1).waitFor();
  await pa.waitForFunction(`!document.querySelector(".split-batch-thumb.is-scanning")`, null, { timeout: 30_000 });
  const billRows = [await said4(0), await said4(1)];
  ok(
    billRows[0].includes("Deer Garden") && billRows[0].includes("小费 $4.85") && (await amount4(0).inputValue()) === "45.30" && billRows[1].includes("和第 1 张合成一笔") && (await amount4(1).inputValue()) === "" && (await record4.innerText()) === t("receiptsSaveOne"),
    `几张小票: the slip taken into its receipt's row, the total with the tip; its own row says so (${billRows.join(" / ")})`,
  );
  await pa.screenshot({ path: join(out, "bill-rows-zh-390x664.png") });
  await record4.click();
  await pa.locator(".split-batch").waitFor({ state: "detached" });
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const deer = ((await keptBy(pa)).held[0].server.entries as (Kept4 & { tip?: number; tax?: number })[]).at(-1);
  ok(
    deer?.amount === 4530 && deer.tip === 485 && deer.tax === 193 && deer.merchant === "Deer Garden" && deer.payment === "Debit" && deer.place === "Vancouver, BC" && deer.date === "2026-10-15" && deer.files?.length === 2,
    `recorded as one bill: $45.30 with its tip and tax, the name, how and where it was paid, both photos (${JSON.stringify(deer && { ...deer, files: deer.files?.length })})`,
  );

  // reading not to be had (no key, the month spent): nothing said, and not asked again on this page
  await a.unroute("**/split/api/ledgers/*/files/*/read");
  await a.route("**/split/api/ledgers/*/files/*/read", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "off" }) }));
  const before = asked.length;
  const hinted: boolean[] = [];
  for (const mark of ["receipt:12.00 CAD A", "receipt:13.00 CAD B"]) {
    await button(pa, "addExpense").click();
    await pa.locator(".split-keys").waitFor();
    await pa.waitForTimeout(300);
    hinted.push((await hint.count()) > 0);
    await attach(mark);
    await pa.locator(".split-photo-button .split-thumb, .split-photo-button img").first().waitFor({ timeout: 15_000 });
    await pa.waitForTimeout(800);
    ok((await line.count()) === 0 && !(await amount())?.match(/[1-9]/), `no reading to be had: nothing said, nothing filled in (${mark.slice(-1)})`);
    await button(pa, "close").first().click();
    await pa.locator(".split-keys").waitFor({ state: "hidden" });
  }
  ok(asked.length === before + 1, `and asked once on this page, not again (${asked.length - before})`);
  ok(hinted[0] && !hinted[1], "and once it isn't to be had, a new expense no longer says a receipt fills it in");
  await a.close();

  // The scan, on a phone with its motion (Steve, 2026-11-18: 看起来有科技感). From the moment a photo
  // that is going to be read goes, until the reading is back, the amount's place is a scanner's
  // window: four corners of the light, a band of it sweeping down, an amount's digits rolling; the
  // photo has the band too. The read amount lands lit and settles. (`--video <folder>` films it.)
  const b = await phone(390, 664, "zh", "no-preference", flag("--video"));
  const pb = await open(b, true);
  await start(pb, "扫描", ["阿乙"]);
  await pb.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made`);
  let held = true;
  // (held until let go, then answered as Google would for this photo: TOTAL 78.60, Tax 9.10)
  await b.route("**/split/api/ledgers/*/files/*/read", async (route) => {
    while (held) await new Promise((r) => setTimeout(r, 100));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ read: { total: "78.60", currency: "CAD", merchant: "Cafe Miku", tip: null, tax: "9.10", date: null } }) });
  });
  // (and the photo itself: going as it would, held on its way, or not getting there)
  let going: "go" | "hold" | "fail" = "go";
  await b.route("**/split/api/ledgers/*/files/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    while (going === "hold") await new Promise((r) => setTimeout(r, 100));
    if (going === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "trouble" }) });
    await route.fallback();
  });
  const scan = pb.locator(".split-add-amount.is-scanning > .split-scan");
  const shot = pb.locator(".split-add-amount > output");
  const receiptLine = pb.locator(".split-add-read");
  await button(pb, "addExpense").click();
  await pb.locator(".split-keys").waitFor();
  const resting = (await pb.locator(".split-add-amount").boundingBox())?.height ?? 0;
  if (flag("--video")) await pb.waitForTimeout(1200);
  going = "hold";
  await pb.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_3107.jpg", mimeType: "image/jpeg", buffer: await receipt(pb, "MIKU", 900, 1200) });
  await pb.locator(".split-photo-button.is-sending").waitFor({ timeout: 15_000 });
  ok((await scan.isVisible()) && (await receiptLine.textContent()) === t("readingReceipt"), "the scan starts as the photo goes, before it has got there");
  if (flag("--video")) await pb.waitForTimeout(900);
  going = "go";
  await pb.locator(".split-photo-button.is-scanning:not(.is-sending) .split-thumb").waitFor({ timeout: 15_000 });
  await pb.waitForTimeout(700);
  await pb.screenshot({ path: join(out, "read-scan-zh-390x664.png") });
  const look = await pb.evaluate(() => {
    const s = document.querySelector(".split-scan")!;
    const rolls = [...document.querySelectorAll(".split-scan-digit > :last-child")].map((d) => getComputedStyle(d));
    return {
      corners: getComputedStyle(s, "::before").backgroundImage.split("linear-gradient").length - 1,
      sweep: getComputedStyle(s, "::after").animationName,
      thumb: getComputedStyle(document.querySelector(".split-photo-button")!, "::after").animationName,
      rolls: rolls.map((r) => r.animationName),
      paces: new Set(rolls.map((r) => `${r.animationDuration} ${r.animationDirection}`)).size,
      shown: getComputedStyle(document.querySelector(".split-add-amount > output")!).opacity,
      unheard: s.getAttribute("aria-hidden"),
    };
  });
  ok(look.corners === 8 && look.sweep === "split-scan-sweep", `while it goes and is read, four corners of the light frame where the amount will be, and a band of it sweeps down (${JSON.stringify(look)})`);
  ok(look.rolls.length === 4 && look.rolls.every((r) => r === "split-scan-roll") && look.paces >= 3, `an amount's digits roll there, no two side by side at one pace (${look.rolls.length} digits, ${look.paces} paces)`);
  ok(look.thumb === "split-scan-sweep", "and the band sweeps over the photo being read");
  ok(look.shown === "0" && look.unheard === "true" && (await pb.locator(".split-add-read").textContent()) === t("readingReceipt"), "the window takes the amount's place, unheard by a screen reader, which is told by the line under it");
  const scanBox = await scan.boundingBox();
  const shotBox = await shot.boundingBox();
  const scanning = (await pb.locator(".split-add-amount").boundingBox())?.height ?? 0;
  ok(!!scanBox && !!shotBox && Math.abs(scanBox.height - shotBox.height) < 1 && Math.abs(scanning - resting) < 1, `the window is the amount's height, and nothing on the screen moves for it (${Math.round(scanBox?.height ?? 0)} / ${Math.round(shotBox?.height ?? 0)}px, ${Math.round(resting)} → ${Math.round(scanning)}px)`);
  if (flag("--video")) await pb.waitForTimeout(2600);
  held = false;
  const lit = pb.locator(".split-add-amount > output.is-just-read");
  await lit.waitFor({ timeout: 15_000 });
  await pb.waitForTimeout(120);
  await pb.screenshot({ path: join(out, "read-lit-zh-390x664.png") });
  // (its tax said under it, where 正在读小票… was)
  ok((await scan.count()) === 0 && (await shot.textContent()) === "$78.60" && (await pb.locator(".split-add-read").count()) === 0 && (await pb.locator(".split-add-extras").count()) === 1, `read: the window goes, and the amount lands lit (${await shot.textContent()})`);
  await lit.waitFor({ state: "detached", timeout: 5_000 });
  ok(true, "and settles into the page's own white");
  if (flag("--video")) await pb.waitForTimeout(1500);
  await button(pb, "close").first().click();
  await pb.locator(".split-keys").waitFor({ state: "hidden" });

  // a key pressed while it is read: the scan stops there (what is typed stands); taken back to
  // nothing while it is still being read, the scan is there again, and the reading goes in
  held = true;
  await button(pb, "addExpense").click();
  await pb.locator(".split-keys").waitFor();
  await pb.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_3108.jpg", mimeType: "image/jpeg", buffer: await receipt(pb, "MIKU", 900, 1200) });
  // (there, and being read: a key pressed while it is still going means the amount is typed, and it isn't read at all)
  await pb.locator(".split-photo-button.is-scanning:not(.is-sending) .split-thumb").waitFor({ timeout: 15_000 });
  await type(pb, "5");
  ok((await scan.count()) === 0 && (await pb.locator(".split-add-read").count()) === 0 && (await shot.textContent()) === "$5", "a key pressed while it is read: the scan stops there, and what is typed stands");
  await pb.locator(".split-key.is-back").click();
  await scan.waitFor({ timeout: 5_000 });
  ok(true, "taken back to nothing while it is still being read: the scan is there again");
  held = false;
  await lit.waitFor({ timeout: 15_000 });
  ok((await shot.textContent()) === "$78.60", "and what was read goes in");
  await button(pb, "close").first().click();
  await pb.locator(".split-keys").waitFor({ state: "hidden" });

  // a key pressed while the photo is still going: the amount is typed, so the photo isn't read, and
  // taking the amount back to nothing later doesn't bring a scan back that nothing will end
  going = "hold";
  await button(pb, "addExpense").click();
  await pb.locator(".split-keys").waitFor();
  await pb.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_3110.jpg", mimeType: "image/jpeg", buffer: await receipt(pb, "MIKU", 900, 1200) });
  await pb.locator(".split-photo-button.is-sending").waitFor({ timeout: 15_000 });
  await type(pb, "4");
  going = "go";
  await pb.locator(".split-photo-button:not(.is-sending) .split-thumb").waitFor({ timeout: 15_000 });
  await pb.locator(".split-key.is-back").click();
  await pb.waitForTimeout(400);
  ok((await scan.count()) === 0 && (await receiptLine.count()) === 0 && (await shot.textContent()) === "$0", "a key pressed while the photo was still going: it isn't read, and no scan is left waiting once the amount is taken back");
  await button(pb, "close").first().click();
  await pb.locator(".split-keys").waitFor({ state: "hidden" });

  // a photo that doesn't get there: the scan stops, and nothing goes on saying it is being read
  going = "fail";
  await button(pb, "addExpense").click();
  await pb.locator(".split-keys").waitFor();
  await pb.locator(".split-note-row input[type=file]").setInputFiles({ name: "IMG_3109.jpg", mimeType: "image/jpeg", buffer: await receipt(pb, "MIKU", 900, 1200) });
  await pb.locator(".split-photo-button.is-sending").waitFor({ state: "detached", timeout: 15_000 });
  await pb.waitForTimeout(300);
  ok((await scan.count()) === 0 && (await receiptLine.count()) === 0 && (await shot.textContent()) === "$0", "a photo that doesn't get there: the scan stops, and nothing says it is being read");
  await b.close();
}

// ---------- view: 查看链接, end to end ----------
/**
 * 查看链接 (Steve, 2026-11-23): made from 结清, the same link each time; opened on another phone, the
 * ledger to look at, coming up to date when the page comes back to the front; opened on a phone in
 * the ledger, its own page; made on a locked ledger too; a new key turns it off, and a new link
 * opens again; a link cut short opens nothing.
 */
async function viewing() {
  if (!local) {
    console.log("view: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  await a.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pa = await open(a, true);
  await start(pa, "看账", ["阿甲"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  await spend(pa, "60");
  await pa.getByRole("tab", { name: t("settle") }).click();
  const made = async () => {
    await button(pa, "viewLink").click();
    const copy = pa.getByRole("dialog").getByRole("button", { name: t("copyLink"), exact: true });
    await copy.waitFor({ timeout: 15_000 });
    await copy.click();
    const link = (await pa.evaluate(() => navigator.clipboard.readText())).split("\n").pop() ?? "";
    await pa.keyboard.press("Escape");
    await closed(pa);
    return link;
  };
  const link = await made();
  const kept = (await keptBy(pa)).held[0];
  const viewKey = new URL(link).hash.slice(3);
  ok(viewKey.length === 43 && viewKey !== kept.key && !link.includes(kept.key), "the link carries a key of its own, not the ledger's");
  ok((await made()) === link, "made again, it is the same link");

  // opened on another phone: the ledger, to look at
  const b = await phone(390, 664, "zh");
  const pb = await b.newPage();
  watch(pb, true);
  await pb.goto(link);
  await pb.locator(".split-viewing").waitFor({ timeout: 15_000 });
  ok((await amounts(pb)).includes("60") && (await pb.getByText(t("viewOnly")).count()) === 1, "on another phone it shows the ledger, and says it can only be looked at");
  ok((await pb.evaluate(`localStorage.getItem(${JSON.stringify(KEPT)})`)) === null, "and that phone keeps nothing of it");
  await pb.getByRole("tab", { name: t("settle") }).click();
  await pb.locator("#split-settle .split-row").first().click();
  await pb.getByRole("dialog").getByText(t("viewOnlyPaid")).waitFor();
  ok((await pb.getByRole("dialog").getByRole("button", { name: t("markPaid") }).count()) === 0, "a transfer on it can't be marked paid: it says someone in the ledger marks it");
  await pb.keyboard.press("Escape");
  await closed(pb);
  await pb.locator(".split-people .split-row").first().click();
  await pb.getByRole("dialog").locator(".split-statement .is-total").waitFor();
  ok(true, "and everyone's statement opens on it too");
  await pb.keyboard.press("Escape");
  await closed(pb);
  await pb.getByRole("tab", { name: t("expenses") }).click();
  const refused = await pb.evaluate(
    ([id, key]) => fetch(`/split/api/ledgers/${id}/changes`, { method: "POST", headers: { "x-split-key": key, "content-type": "application/json" }, body: JSON.stringify({ changes: [] }) }).then((r) => r.status),
    [kept.server.id, viewKey] as const,
  );
  ok(refused === 403, `its key sends nothing to the ledger (the server says ${refused})`);

  // up to date when it comes back to the front
  await pa.getByRole("tab", { name: t("expenses") }).click();
  await spend(pa, "25");
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  await pb.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await pb.locator(".split-row-amount", { hasText: "25" }).waitFor({ timeout: 10_000 });
  ok(true, "an expense recorded on the ledger's own phone shows on the one looking when it comes back to the front");

  // a phone in the ledger opens its own page, and the link comes off the address
  const own = await a.newPage();
  watch(own, true);
  await own.goto(link);
  await button(own, "addExpense").waitFor({ timeout: 15_000 });
  ok((await own.locator(".split-viewing").count()) === 0 && new URL(own.url()).hash === "", "opened on a phone in the ledger: its own page, and the link off the address");
  await own.close();

  // locked, a link can still be made (the same one), and it still opens
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("lockIt")) }).click();
  await pa.getByRole("button", { name: re(t("unlockIt")) }).waitFor();
  await pa.keyboard.press("Escape");
  await closed(pa);
  await pa.getByRole("tab", { name: t("settle") }).click();
  ok((await made()) === link, "a locked ledger has its 查看链接 too, the same");
  await pb.reload();
  await pb.locator(".split-viewing").waitFor({ timeout: 15_000 });
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("unlockIt")) }).click();
  await pa.getByRole("button", { name: re(t("lockIt")) }).waitFor();

  // a new key turns it off; the link made after it is another, and opens
  await pa.getByRole("button", { name: re(t("rekey")) }).click();
  await pa.getByRole("dialog").getByRole("button", { name: t("rekeyYes"), exact: true }).click();
  await pa.getByRole("dialog").getByText(t("rekeyDone")).waitFor({ timeout: 8000 });
  await pa.keyboard.press("Escape");
  await closed(pa);
  await pb.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await pb.getByText(t("viewGone")).waitFor({ timeout: 10_000 });
  ok(true, "the ledger's key changed: the page looking at it says the link no longer opens");
  const again = await made();
  ok(again !== link && /#v=[A-Za-z0-9_-]{43}$/.test(again), "the link made after the new key is another one");
  await pb.goto(again);
  await pb.locator(".split-viewing").waitFor({ timeout: 15_000 });
  ok((await amounts(pb)).includes("25"), "and it opens the ledger");

  // a link cut short, and one to a ledger that isn't there
  await pb.goto(again.slice(0, -10));
  await pb.getByText(t("viewGone")).waitFor({ timeout: 10_000 });
  await pb.goto(again.replace(/\/split\/[^#]{4}/, "/split/zzzz"));
  await pb.getByText(t("viewGone")).waitFor({ timeout: 10_000 });
  ok(true, "a link cut short, or to a ledger that isn't there, says the link doesn't open");
  await b.close();
  await a.close();
}

// ---------- search: 搜索账目 ----------
/**
 * 搜索账目 (2026-11-26): from six expenses on, a field over the list. A note, a business, a sum, who
 * paid: each finds its own, and the page says how many; nothing found says so; cleared, all are back.
 * Shown in English on the narrowest phone too.
 */
async function searching() {
  if (!local) {
    console.log("search: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "搜一搜", ["阿甲"]);
  const field = pa.getByRole("textbox", { name: t("search") });
  const notes = ["早餐", "油费", "晚饭", "Tim Hortons", "门票", "停车"];
  const sums = ["16.50", "60", "42.50", "7.80", "120", "15"];
  for (let i = 0; i < notes.length; i++) {
    if (i === 5) ok((await field.count()) === 0, "with five expenses there is no search: the list is short enough to see");
    await button(pa, "addExpense").click();
    await type(pa, sums[i]);
    await setNote(pa, notes[i]);
    await button(pa, "done").click();
    await pa.locator(".split-keys").waitFor({ state: "hidden" });
  }
  await field.waitFor();
  const rows = pa.locator("#split-list .split-row");
  const found = async (typed: string, want: string[], line: string) => {
    await field.fill(typed);
    await pa.waitForFunction((n) => document.querySelectorAll("#split-list .split-row").length === n, want.length);
    const titles = (await rows.locator("strong").allTextContents()).sort();
    ok(JSON.stringify(titles) === JSON.stringify([...want].sort()) && (await pa.locator(".split-found").innerText()) === line, `"${typed}" finds ${want.length ? want.join(", ") : "nothing"} (${line})`);
  };
  await found("晚", ["晚饭"], say("zh", "searchFoundOne"));
  await pa.screenshot({ path: join(out, "search-found-zh-390x664.png") });
  await found("TIM", ["Tim Hortons"], say("zh", "searchFoundOne"));
  await found("42.5", ["晚饭"], say("zh", "searchFoundOne"));
  await found("$60", ["油费"], say("zh", "searchFoundOne"));
  await found("你", notes, say("zh", "searchFound", { n: 6 }));
  await found("zzz", [], say("zh", "searchNone"));
  await pa.screenshot({ path: join(out, "search-none-zh-390x664.png") });
  await pa.getByRole("button", { name: t("searchClear"), exact: true }).click();
  ok((await field.inputValue()) === "" && (await rows.count()) === 6 && (await pa.locator(".split-found").count()) === 0, "清空 empties the field, and all six are back");
  await field.fill("tim");
  await field.press("Enter");
  ok(await pa.evaluate(() => document.activeElement?.tagName !== "INPUT"), "the keyboard's search key puts the keyboard away");
  // in English, on the narrowest phone
  await pa.setViewportSize({ width: 320, height: 568 });
  await pa.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("lazysusan.settings.v1") ?? "{}");
    localStorage.setItem("lazysusan.settings.v1", JSON.stringify({ ...kept, lang: "en" }));
  });
  await pa.reload();
  const en = pa.getByRole("textbox", { name: say("en", "search") });
  await en.waitFor();
  await en.fill("tim");
  await pa.locator(".split-found").waitFor();
  await pa.screenshot({ path: join(out, "search-found-en-320x568.png") });
  const wide = await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(wide && (await pa.locator(".split-found").innerText()) === say("en", "searchFoundOne"), "in English on a 320 phone: the field fits, and says 1 found");
  await a.close();
}

// ---------- pay: 收款方式 ----------
/**
 * 收款方式 (2026-11-26): added from a transfer to you, changed in the list of people; shown to whoever
 * pays you, with a button to copy it; in the plan copied as text; never on a 查看链接's page.
 */
async function paying() {
  if (!local) {
    console.log("pay: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  await a.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pa = await open(a, true);
  await start(pa, "收款", ["阿甲"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  await spend(pa, "60");
  const synced = () => pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  await pa.getByRole("tab", { name: t("settle") }).click();
  const planRow = (p: Page) => p.locator(".split-rows:not(.split-people) .split-row").first();
  await planRow(pa).click();
  const sheet = pa.getByRole("dialog");
  // a transfer to you, and you haven't said how you take money: a line to say it
  const field = sheet.getByPlaceholder(t("payHint"));
  await field.waitFor();
  ok((await sheet.getByText(t("payAddMine")).count()) === 1, "a transfer to you, with no 收款方式 yet: a line to add yours");
  await pa.screenshot({ path: join(out, "pay-add-zh-390x664.png") });
  await field.fill("  me@example.com ");
  await sheet.getByRole("button", { name: t("paySave"), exact: true }).click();
  await sheet.locator(".split-pay-line strong").waitFor();
  ok((await sheet.locator(".split-pay-line strong").innerText()) === "me@example.com" && (await sheet.locator(".split-pay-label").innerText()) === t("payOfYou"), "saved: it says it, tidied, as yours");
  await sheet.getByRole("button", { name: t("copyPay"), exact: true }).click();
  ok((await pa.evaluate(() => navigator.clipboard.readText())) === "me@example.com", "复制 copies it as it is");
  await pa.screenshot({ path: join(out, "pay-shown-zh-390x664.png") });
  await pa.keyboard.press("Escape");
  await closed(pa);
  // in the list of people: under the name, and changed there
  await pa.getByRole("tab", { name: t("expenses") }).click();
  await pa.locator(".split-crew-faces").click();
  const people = pa.getByRole("dialog");
  await people.locator(".split-person-pay", { hasText: "me@example.com" }).waitFor();
  await people.locator(".split-person", { hasText: "me@example.com" }).click();
  const input = people.getByPlaceholder(t("payHint"));
  ok((await input.inputValue()) === "me@example.com", "opened in the list of people, it is there to change");
  await pa.screenshot({ path: join(out, "pay-people-zh-390x664.png") });
  await input.fill("604 555 0101");
  await people.getByRole("button", { name: t("save"), exact: true }).click();
  await people.locator(".split-person-pay", { hasText: "604 555 0101" }).waitFor();
  ok(true, "changed there: the list says the new one");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await synced();
  // the plan as text, for the group: who takes money how
  await pa.getByRole("tab", { name: t("settle") }).click();
  await button(pa, "sendPicture").click();
  await pa.getByRole("dialog").locator(".split-picture img").waitFor({ timeout: 15_000 });
  await pa.getByRole("dialog").getByRole("button", { name: re(t("copyAsText")) }).click();
  const text = String(await pa.evaluate("navigator.clipboard.readText()"));
  ok(text.split("\n").includes(say("zh", "planPay", { who: "我", pay: "604 555 0101" })), "the plan copied as text says how the one to be paid takes money");
  await pa.keyboard.press("Escape");
  await closed(pa);
  // a friend's phone: the transfer they make, with it to copy
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("invite")) }).click();
  await pa.getByRole("dialog").getByRole("button", { name: re(t("copyInvite")) }).click();
  const invite = String(await pa.evaluate("navigator.clipboard.readText()")).split("\n").pop() ?? "";
  await pa.keyboard.press("Escape");
  await closed(pa);
  const b = await phone(390, 664, "zh");
  await b.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pb = await b.newPage();
  watch(pb, true);
  await pb.goto(invite);
  await pb.locator(".split-who").getByRole("button", { name: re("阿甲") }).click();
  await pb.locator(".split-standing").waitFor();
  await pb.getByRole("tab", { name: t("settle") }).click();
  await planRow(pb).click();
  await pb.getByRole("dialog").locator(".split-pay-line strong").waitFor();
  ok((await pb.getByRole("dialog").locator(".split-pay-line strong").innerText()) === "604 555 0101" && (await pb.getByRole("dialog").locator(".split-pay-label").innerText()) === say("zh", "payOf", { who: "我" }), "on the phone of the one paying: whose it is, and what it says");
  await pb.getByRole("dialog").getByRole("button", { name: t("copyPay"), exact: true }).click();
  ok((await pb.evaluate(() => navigator.clipboard.readText())) === "604 555 0101", "and they copy it");
  await pb.screenshot({ path: join(out, "pay-friend-zh-390x664.png") });
  await pb.keyboard.press("Escape");
  await closed(pb);
  // a 查看链接: nobody's, on the page or in what the server sends it
  await button(pa, "viewLink").click();
  await pa.getByRole("dialog").getByRole("button", { name: t("copyLink"), exact: true }).click();
  const viewLinkText = String(await pa.evaluate("navigator.clipboard.readText()")).split("\n").pop() ?? "";
  await pa.keyboard.press("Escape");
  await closed(pa);
  const c = await phone(390, 664, "zh");
  const pc = await c.newPage();
  watch(pc, true);
  await pc.goto(viewLinkText);
  await pc.locator(".split-viewing").waitFor({ timeout: 15_000 });
  await pc.getByRole("tab", { name: t("settle") }).click();
  await planRow(pc).click();
  await pc.getByRole("dialog").getByRole("button", { name: re(t("copyAmount")) }).waitFor();
  const onPage = await pc.getByRole("dialog").locator(".split-pay").count();
  const url = new URL(viewLinkText);
  const sent = (await pc.evaluate(
    ([id, key]) => fetch(`/split/api/ledgers/${id}`, { headers: { "x-split-key": key } }).then((r) => r.text()),
    [url.pathname.split("/").pop() ?? "", url.hash.slice(3)] as const,
  )) as string;
  ok(onPage === 0 && !sent.includes("604 555 0101") && !sent.includes('"pay"'), "a 查看链接: nobody's 收款方式 on the transfer, nor in what the server sends it");
  await c.close();
  await b.close();
  await a.close();
}

// ---------- kinds: 分类 ----------
/**
 * 分类 (2026-11-26): each expense's kind at the start of its row (what its words say, picked in 详情,
 * or read off its receipt); a pick let go with a second tap; the record says so; 按分类 in 总结.
 */
async function kinding() {
  if (!local) {
    console.log("kinds: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "分类", ["阿甲"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  const synced = () => pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const icon = async (has: string) => (await pa.locator("#split-list .split-row", { hasText: has }).locator(".split-kind-mark svg").getAttribute("class")) ?? "";
  const sheet = pa.getByRole("dialog");
  const pill = (k: Word) => sheet.getByRole("button", { name: t(k), exact: true });
  const said = () => sheet.locator(".split-kinds .split-note").innerText();
  // a note that says what it was: counted as that, with its picture
  await button(pa, "addExpense").click();
  await type(pa, "60");
  await setNote(pa, "晚饭");
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await icon("晚饭")).includes("lucide-utensils-crossed"), "晚饭: counted as 餐饮, its picture at the start of the row");
  // in 详情: what it would count as, then one picked over it, said on the line under 分摊
  await button(pa, "addExpense").click();
  await type(pa, "45");
  await detailsLine(pa).click();
  await noteInSheet(pa).fill("停车");
  ok((await said()) === say("zh", "categoryGuess", { kind: t("catTransport") }) && (await sheet.locator(".split-kinds [aria-pressed=true]").count()) === 0, "none picked: it says what its note makes it (交通)");
  const heights = await sheet.locator(".split-kinds .ui-pill-toggle").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  ok(heights.length === 7 && heights.every((h) => h >= 48), `seven to pick from, each a crowded target's height (${heights.map(Math.round).join(", ")})`);
  await pill("catFun").click();
  ok((await pill("catFun").getAttribute("aria-pressed")) === "true" && (await said()) === t("categoryUnpick"), "玩乐 picked: it is lit, and the line says a second tap lets it go");
  await pa.screenshot({ path: join(out, "kinds-pick-zh-390x664.png") });
  await pa.keyboard.press("Escape");
  await closed(pa);
  ok((await detailsLine(pa).innerText()).includes(t("catFun")), "the line under 分摊 says the kind picked");
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await icon("停车")).includes("lucide-ticket"), "saved: the row has the picked kind's picture, not its words'");
  // opened again: picked there; a second tap lets it go, and the record says so
  await pa.locator("#split-list .split-row", { hasText: "停车" }).click();
  await detailsLine(pa).click();
  ok((await pill("catFun").getAttribute("aria-pressed")) === "true", "opened again, 玩乐 is still the one picked");
  await pill("catFun").click();
  ok((await sheet.locator(".split-kinds [aria-pressed=true]").count()) === 0 && (await said()) === say("zh", "categoryGuess", { kind: t("catTransport") }), "tapped again: none picked, and it counts as its note says once more");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await icon("停车")).includes("lucide-car"), "saved: the row is 交通's again");
  await synced();
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("history")) }).click();
  await sheet.getByText(t("historyCategoryGone")).waitFor({ timeout: 10_000 });
  ok((await sheet.getByText(say("zh", "historyCategory", { kind: t("catFun") })).count()) === 0, "改动记录 says the kind was taken off");
  await pa.keyboard.press("Escape");
  await closed(pa);
  // read off a receipt: the kind it says, picked for it
  await button(pa, "addExpense").click();
  await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:120.00 CAD Hilton Whistler kind=lodging") });
  await pa.locator(".split-add-extras", { hasText: "Hilton Whistler" }).waitFor({ timeout: 15_000 });
  ok((await detailsLine(pa).innerText()).includes(t("catLodging")), "a receipt read as a hotel: the line under 分摊 says 住宿");
  await detailsLine(pa).click();
  ok((await pill("catLodging").getAttribute("aria-pressed")) === "true", "and in 详情 住宿 is the one picked");
  await pa.keyboard.press("Escape");
  await closed(pa);
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await icon("Hilton")).includes("lucide-bed-double"), "saved: a bed at the start of its row");
  await synced();
  // 总结: what each kind came to, the most first
  await pa.getByRole("tab", { name: t("settle") }).click();
  const lines = pa.locator(".split-kinds-spent > li");
  await lines.first().waitFor();
  const rows = await lines.evaluateAll((els) => els.map((li) => ({ name: li.querySelector(".split-kinds-spent-name")?.firstChild?.textContent ?? "", sum: li.querySelector(".split-kinds-spent-sum")?.firstChild?.textContent ?? "", share: li.querySelector(".split-kinds-spent-sum small")?.textContent ?? "", bar: Number(li.querySelector(".split-kinds-spent-bar rect + rect")?.getAttribute("width")) })));
  const wanted = [
    { name: t("catLodging"), sum: "$120.00", share: "53%", bar: 53 },
    { name: t("catFood"), sum: "$60.00", share: "27%", bar: 27 },
    { name: t("catTransport"), sum: "$45.00", share: "20%", bar: 20 },
  ];
  ok(rows.length === 3 && rows.every((r, i) => r.name === wanted[i].name && r.sum === wanted[i].sum && r.share === wanted[i].share && Math.round(r.bar) === wanted[i].bar), `按分类: 住宿 $120.00 53%, 餐饮 $60.00 27%, 交通 $45.00 20%, each bar as long as its share (${JSON.stringify(rows)})`);
  await lines.first().scrollIntoViewIfNeeded();
  await pa.screenshot({ path: join(out, "kinds-summary-zh-390x664.png") });
  // in English, on the narrowest phone: the seven fit, and so does 按分类
  await pa.setViewportSize({ width: 320, height: 568 });
  await pa.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("lazysusan.settings.v1") ?? "{}");
    localStorage.setItem("lazysusan.settings.v1", JSON.stringify({ ...kept, lang: "en" }));
  });
  await pa.reload();
  await pa.getByRole("tab", { name: say("en", "settle") }).click();
  await lines.first().scrollIntoViewIfNeeded();
  await pa.screenshot({ path: join(out, "kinds-summary-en-320x568.png") });
  const fitsWide = () => pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const cut = await lines.evaluateAll((els) => els.filter((li) => li.scrollWidth > li.clientWidth + 1).length);
  ok((await fitsWide()) && cut === 0, "in English on a 320 phone, 按分类 fits");
  await pa.getByRole("tab", { name: say("en", "expenses") }).click();
  await pa.locator("#split-list .split-row", { hasText: "晚饭" }).click();
  await detailsLine(pa).click();
  await sheet.locator(".split-kinds").scrollIntoViewIfNeeded();
  await pa.screenshot({ path: join(out, "kinds-pick-en-320x568.png") });
  const out320 = await sheet.locator(".split-kinds .ui-pill-toggle").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth || e.scrollWidth > e.clientWidth + 1).length);
  ok((await fitsWide()) && out320 === 0 && (await said()) === say("en", "categoryGuess", { kind: say("en", "catFood") }), "and the seven to pick from fit, saying what its note makes it in English");
  await a.close();
}

// ---------- refund: 退款 ----------
/**
 * 退款 (2026-11-26): turned on in 详情 (no tip or tax then); the add screen says so; its row says who
 * got it, with a minus; 共花 and 总结 less it; the statement says what came back; turned off again.
 */
async function refunding() {
  if (!local) {
    console.log("refund: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "退款", ["阿甲"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  const synced = () => pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const sheet = pa.getByRole("dialog");
  const toggle = sheet.getByRole("button", { name: t("refundToggle"), exact: true });
  const title = () => pa.locator(".split-bar-title").innerText();
  await button(pa, "addExpense").click();
  await type(pa, "300");
  await setNote(pa, "酒店");
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  // turned on in 详情: the tip and tax go, and the screen says it is a refund
  await button(pa, "addExpense").click();
  await type(pa, "90");
  await detailsLine(pa).click();
  await noteInSheet(pa).fill("退了一晚");
  ok((await toggle.getAttribute("aria-pressed")) === "false" && (await sheet.locator(".split-extras").isVisible()), "详情: not a refund to start with, and the tip and tax are there");
  await toggle.click();
  const tall = (await toggle.boundingBox())?.height ?? 0;
  ok((await toggle.getAttribute("aria-pressed")) === "true" && !(await sheet.locator(".split-extras").isVisible()) && tall >= 48, `turned on: lit, a crowded target's height (${Math.round(tall)}px), and no tip or tax for a refund`);
  await pa.screenshot({ path: join(out, "refund-on-zh-390x664.png") });
  await pa.keyboard.press("Escape");
  await closed(pa);
  ok((await title()) === t("addRefund") && (await pa.locator(".split-field", { hasText: t("payerRefund") }).count()) === 1 && (await detailsLine(pa).innerText()).includes(`${t("refund")} · 退了一晚`), "the screen says 记一笔退款, 谁收到的, and 退款 on the 详情 line");
  await pa.screenshot({ path: join(out, "refund-add-zh-390x664.png") });
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  // its row: who got it, with a minus; 共花 less it
  const row = pa.locator("#split-list .split-row", { hasText: "退了一晚" });
  ok((await row.locator(".split-row-amount").innerText()).includes("\u2212$90.00") && (await row.innerText()).includes(t("receivedByYou")), "its row: 你收到, and \u2212$90.00");
  ok((await pa.getByText(say("zh", "spent", { amount: "$210.00" })).count()) === 1, "共花 $210.00: what was spent, less what came back");
  await pa.screenshot({ path: join(out, "refund-list-zh-390x664.png") });
  await synced();
  // 总结 and the statement
  await pa.getByRole("tab", { name: t("settle") }).click();
  const summary = pa.locator("dl.split-summary").last();
  await summary.waitFor();
  const said = await summary.innerText();
  ok(said.includes(t("summaryRefunds")) && said.includes("$90.00") && said.includes("$210.00"), "总结: 一共花了 $210.00, and 退回来的 $90.00");
  await pa.locator(".split-people .split-row").first().click();
  const statement = await sheet.locator(".split-statement").innerText();
  ok(statement.includes(`${t("refundGot")} $90.00`) && statement.includes(t("refundBack")) && statement.includes("$45.00"), "my statement: the refund I got ($90.00), and my part of it back ($45.00)");
  await pa.screenshot({ path: join(out, "refund-statement-zh-390x664.png") });
  await pa.keyboard.press("Escape");
  await closed(pa);
  // opened again: a refund; turned off, an expense again, and the record says so
  await pa.getByRole("tab", { name: t("expenses") }).click();
  await row.click();
  ok((await title()) === t("editRefund"), "opened again: 改这一笔退款");
  await detailsLine(pa).click();
  await toggle.click();
  await pa.keyboard.press("Escape");
  await closed(pa);
  ok((await title()) === t("editExpense"), "turned off: 改这一笔");
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await row.locator(".split-row-amount").innerText()).trim() === "$90.00" && (await pa.getByText(say("zh", "spent", { amount: "$390.00" })).count()) === 1, "saved: $90.00 spent, and 共花 $390.00");
  await synced();
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("history")) }).click();
  await sheet.getByText(t("historyRefundOff")).waitFor({ timeout: 10_000 });
  ok((await sheet.getByText(say("zh", "historyRefund", { what: "退了一晚 $90.00" })).count()) === 1, "改动记录: 记了一笔退款, then 改成花销");
  await pa.keyboard.press("Escape");
  await closed(pa);
  // in English, on the narrowest phone: the toggle and what a refund is fit
  await pa.setViewportSize({ width: 320, height: 568 });
  await pa.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("lazysusan.settings.v1") ?? "{}");
    localStorage.setItem("lazysusan.settings.v1", JSON.stringify({ ...kept, lang: "en" }));
  });
  await pa.reload();
  await row.click();
  await detailsLine(pa).click();
  const en = sheet.getByRole("button", { name: say("en", "refundToggle"), exact: true });
  await en.click();
  await sheet.locator(".split-refund").scrollIntoViewIfNeeded();
  await pa.screenshot({ path: join(out, "refund-on-en-320x568.png") });
  const fits = await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll("dialog[open] .split-refund *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth));
  ok(fits && (await en.getAttribute("aria-pressed")) === "true", "in English on a 320 phone: the toggle and what a refund is fit");
  await a.close();
}

// ---------- payers: 几个人一起付 ----------
/**
 * 几个人一起付 (2026-11-27): the payer sheet's 几个人, what each paid typed; the payer's line says who,
 * or what doesn't add up (and 记好了 waits); the row says who paid together; one person again.
 */
async function paying2() {
  if (!local) {
    console.log("payers: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "一起付", ["阿甲", "阿乙"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  const synced = () => pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].waiting.length === 0`);
  const sheet = pa.getByRole("dialog");
  const payerLine = pa.locator(".split-field", { hasText: t("payer") }).first();
  const paid = (who: string) => sheet.getByRole("textbox", { name: say("zh", "paidFor", { who }) });
  const status = () => sheet.locator(".split-note[role=status]").innerText();
  await button(pa, "addExpense").click();
  await type(pa, "186");
  await payerLine.click();
  await sheet.getByRole("radio", { name: t("paySeveral"), exact: true }).click();
  ok((await paid("我").inputValue()) === "186.00" && (await status()) === t("paidFew"), "几个人: whoever paid starts with all of it, and it says two or more have to pay");
  await paid("我").fill("100");
  await paid("阿甲").fill("80");
  ok((await status()) === say("zh", "paidLeft", { amount: "$6.00" }), "$100 and $80 of $186: still $6.00 to pay");
  await paid("阿甲").fill("90");
  ok((await status()) === say("zh", "over", { amount: "$4.00" }), "$100 and $90: $4.00 too much");
  await paid("阿甲").fill("86");
  ok((await status()) === t("addsUp"), "$100 and $86: it adds up");
  const tall = await sheet.locator(".split-person-field input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  ok(tall.every((h) => h >= 44), `each amount a target big enough to press (${tall.map(Math.round).join(", ")})`);
  await pa.screenshot({ path: join(out, "payers-sheet-zh-390x664.png") });
  await sheet.getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(pa);
  ok((await payerLine.innerText()).includes("你、阿甲"), "the payer's line says who: 你、阿甲");
  await setNote(pa, "晚饭");
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  const row = pa.locator("#split-list .split-row", { hasText: "晚饭" });
  ok((await row.innerText()).includes(say("zh", "paidByMany", { who: "你、阿甲" })), "its row: 你、阿甲一起付");
  ok((await pa.locator(".split-standing").innerText()).includes("$38.00"), "and I'm owed what I paid less my $62: $38.00");
  await pa.screenshot({ path: join(out, "payers-list-zh-390x664.png") });
  await synced();
  // opened again: what doesn't add up is said on the payer's line, and 保存 waits
  await row.click();
  await payerLine.click();
  ok((await paid("阿甲").inputValue()) === "86.00", "opened again: what each paid is there");
  await paid("阿甲").fill("80");
  await sheet.getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(pa);
  ok((await payerLine.innerText()).includes(say("zh", "paidLeft", { amount: "$6.00" })) && (await button(pa, "saveChanges").isDisabled()), "not adding up: the payer's line says $6.00 still to pay, and 保存 can't be pressed");
  await pa.screenshot({ path: join(out, "payers-off-zh-390x664.png") });
  // one person again: 阿乙
  await payerLine.click();
  await sheet.getByRole("radio", { name: t("payOne"), exact: true }).click();
  await sheet.getByRole("radio", { name: re("阿乙") }).click();
  await closed(pa);
  ok((await payerLine.innerText()).includes("阿乙") && !(await button(pa, "saveChanges").isDisabled()), "一个人 again: 阿乙, and it can be saved");
  await button(pa, "saveChanges").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await row.innerText()).includes(say("zh", "paidBy", { who: "阿乙" })), "its row: 阿乙付");
  await synced();
  await button(pa, "more").click();
  await pa.getByRole("button", { name: re(t("history")) }).click();
  await sheet.getByText(say("zh", "historyPayer", { who: "阿乙" })).waitFor({ timeout: 10_000 });
  ok(true, "改动记录 says it is 阿乙's again");
  await pa.keyboard.press("Escape");
  await closed(pa);
  // in English, on the narrowest phone
  await pa.setViewportSize({ width: 320, height: 568 });
  await pa.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("lazysusan.settings.v1") ?? "{}");
    localStorage.setItem("lazysusan.settings.v1", JSON.stringify({ ...kept, lang: "en" }));
  });
  await pa.reload();
  await row.click();
  await pa.locator(".split-field", { hasText: say("en", "payer") }).first().click();
  await sheet.getByRole("radio", { name: say("en", "paySeveral"), exact: true }).click();
  await pa.screenshot({ path: join(out, "payers-sheet-en-320x568.png") });
  const fits = await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll("dialog[open] .split-person, dialog[open] .split-people ~ *, dialog[open] [role=radiogroup] [role=radio]")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
  ok(fits, "in English on a 320 phone: the two ways and each one's amount fit");
  await a.close();
}

// ---------- items: 小票逐项分 ----------
/**
 * 小票逐项分 (2026-11-27): in 按金额, with a receipt photo, its lines read; each had by whoever is left
 * on after tapping off; the parts (tax and tip in proportion) fill 按金额, and it adds up.
 */
async function itemizing() {
  if (!local) {
    console.log("items: skipped (it starts a ledger, so it needs the server on this machine)");
    return;
  }
  const a = await phone(390, 664, "zh");
  const pa = await open(a, true);
  await start(pa, "逐项", ["阿甲", "阿乙"]);
  await pa.waitForFunction(`JSON.parse(localStorage.getItem(${JSON.stringify(KEPT)})).held[0].made === true`);
  const sheet = pa.getByRole("dialog");
  await button(pa, "addExpense").click();
  await pa.locator(".split-note-row input[type=file]").setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: aPdf("receipt:78.60 CAD Cafe items=Poutine:24.00|Burger:18.50|Beer:27.00") });
  await pa.locator(".split-add-extras", { hasText: "Cafe" }).waitFor({ timeout: 15_000 });
  await pa.locator(".split-field", { hasText: t("sharedBy") }).first().click();
  await sheet.getByRole("radio", { name: t("amounts"), exact: true }).click();
  await sheet.getByRole("button", { name: t("itemsButton") }).click();
  const items = sheet.locator(".split-item");
  await items.nth(2).waitFor({ timeout: 15_000 });
  ok((await items.count()) === 3 && (await items.nth(1).innerText()).includes("Burger") && (await items.nth(1).innerText()).includes("$18.50") && (await sheet.locator(".split-item [aria-pressed=true]").count()) === 9, "three lines read, each had by all three to start with");
  const pill = (k: number, who: string) => items.nth(k).getByRole("button", { name: who, exact: true });
  const tall = await sheet.locator(".split-item .ui-pill-toggle").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  ok(tall.every((h) => h >= 48), `each name a crowded target's height (${[...new Set(tall.map(Math.round))].join(", ")})`);
  await pill(1, t("you")).click();
  await pill(1, "阿乙").click();
  await pill(2, "阿甲").click();
  const parts = await sheet.locator(".split-items-parts").innerText();
  const rest = await sheet.getByText(say("zh", "itemsRest", { amount: "$9.10" })).count();
  ok(parts === say("zh", "itemsParts", { list: "你 $24.32 · 阿甲 $29.97 · 阿乙 $24.31" }) && rest === 1, `the burger 阿甲's, the beer 你 and 阿乙's: each one's part, and the $9.10 of tax shared the same way (${parts})`);
  await pa.screenshot({ path: join(out, "items-zh-390x664.png") });
  await sheet.getByRole("button", { name: t("itemsApply"), exact: true }).click();
  const filled = await sheet.locator(".split-person-field input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  ok(JSON.stringify(filled) === JSON.stringify(["24.32", "29.97", "24.31"]) && (await sheet.locator(".split-note.is-good").count()) === 1, `用这个: 按金额 filled in, and it adds up (${filled.join(", ")})`);
  await sheet.getByRole("button", { name: t("ok"), exact: true }).click();
  await closed(pa);
  await button(pa, "done").click();
  await pa.locator(".split-keys").waitFor({ state: "hidden" });
  ok((await pa.locator(".split-standing").innerText()).includes("$54.28"), "saved: I paid $78.60 and had $24.32 of it, so I'm owed $54.28");
  // in English, on the narrowest phone
  await pa.setViewportSize({ width: 320, height: 568 });
  await pa.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("lazysusan.settings.v1") ?? "{}");
    localStorage.setItem("lazysusan.settings.v1", JSON.stringify({ ...kept, lang: "en" }));
  });
  await pa.reload();
  await pa.locator("#split-list .split-row").first().click();
  await pa.locator(".split-field", { hasText: say("en", "sharedBy") }).first().click();
  await sheet.getByRole("button", { name: say("en", "itemsButton") }).click();
  await items.nth(2).waitFor({ timeout: 15_000 });
  await pa.screenshot({ path: join(out, "items-en-320x568.png") });
  const fits = await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll("dialog[open] .split-item *, dialog[open] .split-pair *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
  ok(fits, "in English on a 320 phone: the lines, the names and the two buttons fit");
  await a.close();
}

// (ONLY=zh-320x568,en-390x664 walks just those two: quicker when one screen is being worked on)
const only = process.env.ONLY?.split(",");
if (what === "all" || what === "walk") for (const lang of ["zh", "en"] as const) for (const [w, h] of [[390, 844], [390, 664], [375, 553], [320, 568]]) if (!only || only.includes(`${lang}-${w}x${h}`)) await walk(lang, w, h);
if (what === "all" || what === "fits") await fits();
if (what === "all" || what === "behave") await behave();
// (the photos alone, as behave has them: quicker when they are being worked on)
if (what === "photos" && local) await photos();
if (what === "all" || what === "gate") await gate();
if ((what === "all" || what === "friends") && local) await friends();
if ((what === "all" || what === "read") && local) await reading();
if (what === "all" || what === "view") await viewing();
if (what === "all" || what === "search") await searching();
if (what === "all" || what === "pay") await paying();
if (what === "all" || what === "kinds") await kinding();
if (what === "all" || what === "refund") await refunding();
if (what === "all" || what === "payers") await paying2();
if (what === "all" || what === "items") await itemizing();
ok(errors.length === 0, errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors anywhere");
await browser.close();
console.log(failed ? `\n${failed} FAILED (pictures in ${out})` : `\nall good (pictures in ${out})`);
process.exit(failed ? 1 : 0);
