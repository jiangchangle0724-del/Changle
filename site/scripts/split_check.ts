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
import { say, W, type Word } from "../src/split/words";

type Lang = "zh" | "en";
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const what = args.find((a) => ["walk", "fits", "behave", "photos", "gate", "friends"].includes(a)) ?? "all";
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
const phone = async (width: number, height: number, lang: Lang, motion: "reduce" | "no-preference" = "reduce") => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === "zh" ? "zh-CN" : "en-CA", reducedMotion: motion, serviceWorkers: "block" });
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
/** A ledger just started comes up with its invitation open: closed, for what comes next. */
const pastInvite = async (page: Page) => {
  await page.locator("dialog[open] .split-invite-all").waitFor();
  await page.keyboard.press("Escape");
  await closed(page);
};
const key = (page: Page, d: string) => page.locator(".split-key", { hasText: new RegExp(`^${d === "." ? "\\." : d}$`) }).click();
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
    if (note) await page.locator("label.split-field input").fill(note);
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
  const noteField = page.locator("label.split-field input");
  await noteField.fill(`${await noteField.inputValue()}和酒`);
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
  for (let i = 0; i < 10; i++) await page.locator(".split-key").last().click();
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
          linesEnd: Math.round(box("label.split-field").bottom),
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
    await page.getByRole("dialog").locator(".split-person-edit input").fill(to);
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
      for (let i = 0; i < digits; i++) await page.locator(".split-key").last().click();
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
      for (let i = 0; i < 4; i++) await pb.locator(".split-key").last().click();
      await type(pb, "5000");
      await button(pb, "saveChanges").click();
      await pa.locator(".split-row-amount", { hasText: "JP¥5,000" }).waitFor({ timeout: 8000 });
      eqJson(await first(), { amount: 4561, paidIn: { currency: "JPY", amount: 5000, rate: "0.0091224" } }, "changed to 5,000 yen on the other phone: both amounts change on the server, at the same rate");

      await pa.locator("button.split-row").first().click();
      await pick(pa, "加元");
      for (let i = 0; i < 4; i++) await pa.locator(".split-key").last().click();
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
      while (((await amountShown(pa)) ?? "").replace(/[^0-9.]/g, "") !== "0") await pa.locator(".split-key").last().click();
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
      ok((await pa.locator(".split-stale").count()) === 0 && (await pa.locator(".split-row", { hasText: t("paid") }).count()) === 1, "a new picture: up to date; a transfer marked as paid since doesn't put it out of date");

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
    while (((await amountShown(page)) ?? "").replace(/[^0-9.]/g, "") !== "0") await page.locator(".split-key").last().click();
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

// (ONLY=zh-320x568,en-390x664 walks just those two: quicker when one screen is being worked on)
const only = process.env.ONLY?.split(",");
if (what === "all" || what === "walk") for (const lang of ["zh", "en"] as const) for (const [w, h] of [[390, 844], [390, 664], [375, 553], [320, 568]]) if (!only || only.includes(`${lang}-${w}x${h}`)) await walk(lang, w, h);
if (what === "all" || what === "fits") await fits();
if (what === "all" || what === "behave") await behave();
// (the photos alone, as behave has them: quicker when they are being worked on)
if (what === "photos" && local) await photos();
if (what === "all" || what === "gate") await gate();
if ((what === "all" || what === "friends") && local) await friends();
ok(errors.length === 0, errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors anywhere");
await browser.close();
console.log(failed ? `\n${failed} FAILED (pictures in ${out})` : `\nall good (pictures in ${out})`);
process.exit(failed ? 1 : 0);
