/**
 * The app in a real browser, against the server on Cloudflare's own runtime on this machine: the
 * whole way in. A browser that is signed in at the main site (the stand-in, tests/accounts) signs
 * in here, makes a vault with a passphrase, is shown the recovery code, locks, is turned away with
 * a wrong passphrase, opens with the right one, opens with the recovery code after the page was
 * loaded afresh, is locked after fifteen quiet minutes and when the page is left, and signs out.
 * It looks at the devices that are signed in and at what has happened, sees a second device and
 * its wrong try at the passphrase, and signs that device out. It asks for the vault to be erased
 * in seven days and calls that off, erases it at once, and makes a new one.
 * On the way it is checked that the page asks nothing of anyone but this origin (T-8), that
 * nothing it was told is left in the browser's storage (T-24), that it says what it says in both
 * languages, and that every screen passes the accessibility checks the main site runs (UX-5).
 * Run by `npm run test:app`, with the Chrome already on the machine. Every value is invented.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright-core";
import { partsOf } from "../src/app/devices";
import { labelOf } from "../src/server/request";
import { MAIN, ORIGIN, peek, start } from "../tests/platform/run";

const PORT = 8802;
const ACCOUNT = "utestaaaa1";
const PASSPHRASE = "seven tidal marmots in a canoe";
const WRONG = "eight tidal marmots in a canoe";
/** Where pictures of each screen go, for whoever wants to look (never into the repository): `SHOTS=/tmp/shots npm run test:app`. */
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

execFileSync("node", ["scripts/build-app.mjs"], { stdio: "ignore" });
const server = await start(PORT, { GATE: "list", ALLOWED_ACCOUNTS: ACCOUNT }, undefined, true);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  // both names are this machine: the app's own origin, and the main site's (the stand-in answers for it)
  // (and it asks this machine itself, through no proxy: nothing here is meant to leave it)
  args: [`--host-resolver-rules=MAP money.changle.test 127.0.0.1:${PORT}, MAP main.changle.test 127.0.0.1:${PORT}`, "--ignore-certificate-errors", "--no-proxy-server"],
});

/** Everything this site has in the browser's storage, as text to search, and what kinds of thing are there. */
const STORED = `(async () => {
  const texts = [];
  const keys = [];
  const see = (x, depth = 0) => {
    if (depth > 8 || x === null || x === undefined) return;
    if (typeof x === "string") texts.push(x);
    else if (typeof x === "number" || typeof x === "boolean") texts.push(String(x));
    else if (x instanceof CryptoKey) keys.push(x.type + (x.extractable ? " extractable" : ""));
    else if (x instanceof ArrayBuffer || ArrayBuffer.isView(x)) {
      const bytes = x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
      texts.push(new TextDecoder("utf-8").decode(bytes), Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
    } else if (Array.isArray(x)) x.forEach((y) => see(y, depth + 1));
    else if (typeof x === "object") for (const [k, v] of Object.entries(x)) (texts.push(k), see(v, depth + 1));
  };
  const databases = (await indexedDB.databases()).map((db) => db.name);
  let entries = 0;
  for (const name of databases) {
    const open = indexedDB.open(name);
    const db = await new Promise((done, failed) => ((open.onsuccess = () => done(open.result)), (open.onerror = () => failed(open.error))));
    for (const store of db.objectStoreNames) {
      const tx = db.transaction(store, "readonly");
      const all = (request) => new Promise((done, failed) => ((request.onsuccess = () => done(request.result)), (request.onerror = () => failed(request.error))));
      const [ks, vs] = await Promise.all([all(tx.objectStore(store).getAllKeys()), all(tx.objectStore(store).getAll())]);
      entries += vs.length;
      see([ks, vs]);
    }
    db.close();
  }
  const local = Object.fromEntries(Object.entries(localStorage));
  const session = Object.fromEntries(Object.entries(sessionStorage));
  see([local, session, document.cookie]);
  return { databases, entries, keys, local, session, cookies: document.cookie, text: texts.join("\\n") };
})()`;
type Stored = { databases: string[]; entries: number; keys: string[]; local: Record<string, string>; session: Record<string, string>; cookies: string; text: string };
/**
 * Puts in this device's copy of the vault the line that says whose copy it is, as a device that has used its vault
 * keeps (src/web/idbcache.ts): a new vault has nothing else to keep yet, and without it there is nothing to empty.
 */
const keepCopy = (vault: string): string => `new Promise((done, failed) => {
  const open = indexedDB.open("moneylens");
  open.onerror = () => failed(open.error);
  open.onsuccess = () => {
    const tx = open.result.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ vault: ${JSON.stringify(vault)}, cursor: 0 }, "vault");
    tx.oncomplete = () => (open.result.close(), done(true));
    tx.onerror = () => failed(tx.error);
  };
})`;
/** And one sealed blob beside it, as the copy of a vault with records has (invented bytes, that nothing could open). */
const keepChunk = `new Promise((done, failed) => {
  const open = indexedDB.open("moneylens");
  open.onerror = () => failed(open.error);
  open.onsuccess = () => {
    const tx = open.result.transaction("chunks", "readwrite");
    tx.objectStore("chunks").put({ id: "cinventedinvent", version: 1, base: new Uint8Array(64).map((_, i) => i) });
    tx.oncomplete = () => (open.result.close(), done(true));
    tx.onerror = () => failed(tx.error);
  };
})`;

try {
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  const errors: string[] = [];
  const asked: string[] = [];
  const watch = (page: Page): void => {
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => asked.push(`${request.method()} ${request.url()}`));
  };
  /** How many times the page asked the server for `action` so far. */
  const times = (action: string): number => asked.filter((line) => line === `POST ${ORIGIN}/api/${action}`).length;
  /** What the server says of this browser's session, asked from the page as the page asks. */
  const standing = (page: Page): Promise<{ status: number; vault?: string | null; unlocked?: boolean; erasing?: unknown }> =>
    page.evaluate(`fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(async (r) => ({ status: r.status, ...(await r.json()) }))`) as Promise<{ status: number; vault?: string | null; unlocked?: boolean }>;
  /**
   * Waits until the page says so, asking from here again and again. (The browser's own waiting asks from inside the
   * page by making a script out of text, which this page's policy forbids; and it takes a promise for a yes.)
   */
  const until = async (page: Page, expression: string, what: string): Promise<void> => {
    for (let tries = 0; tries < 200; tries++) {
      if (await page.evaluate(expression)) return;
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.fail(`never: ${what}`);
  };
  /** What a page asks the server to find out that this session no longer holds the vault open. */
  const LOCKED = `fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).then((said) => said.unlocked === false)`;
  let shots = 0;
  /** A screen as it stands: the checks the main site runs on its own screens (WCAG 2.1 A and AA), and a picture if pictures were asked for. */
  const screen = async (page: Page, name: string): Promise<void> => {
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    assert.deepEqual(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      [],
      `${name}: accessibility`,
    );
    // nothing is wider than the phone it is on
    assert.ok(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), `${name}: the page scrolls sideways`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++shots).padStart(2, "0")}-${name}.png`, fullPage: true });
  };
  const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });

  const page = await context.newPage();
  watch(page);

  // ---- nobody is signed in: the page says what this is, and offers the way in
  await page.goto(`${ORIGIN}/`);
  await title(page, "把账单变成一本看得懂的账").waitFor();
  assert.equal(await page.evaluate("document.documentElement.lang"), "zh-CN");
  await page.getByText("存下来的账是加密的，钥匙只在你的设备上，网站的经营者读不了你存的交易。").waitFor();
  await screen(page, "signed-out");
  // in English too, and the page remembers which
  await page.getByRole("button", { name: "English" }).click();
  await title(page, "Bank statements, turned into a ledger you can read").waitFor();
  await page.getByText("What is stored is encrypted with a key that stays on your devices; the operator cannot read your stored transactions.").waitFor();
  assert.equal(await page.evaluate("document.documentElement.lang"), "en");
  await screen(page, "signed-out-en");
  await page.reload();
  await title(page, "Bank statements, turned into a ledger you can read").waitFor();
  await page.getByRole("button", { name: "中文" }).click();
  await title(page, "把账单变成一本看得懂的账").waitFor();

  // ---- the server cannot be reached: said so, with a way to try again
  await page.route("**/api/vault", (route) => route.abort());
  await page.reload();
  await title(page, "没连上").waitFor();
  await screen(page, "offline");
  await page.unroute("**/api/vault");
  await page.getByRole("button", { name: "再试一次" }).click();
  await title(page, "把账单变成一本看得懂的账").waitFor();

  // ---- told to slow down (too many requests from this address in a minute): said so, and not as the server's fault
  const slowDown = { status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, why: "slow-down" }) };
  await page.route("**/api/vault", (route) => route.fulfill(slowDown));
  await page.reload();
  await title(page, "请求太多了").waitFor();
  await page.getByText("这一会儿请求太多了，过一分钟再试。").waitFor();
  assert.equal(await page.getByText("服务器没答上来").count(), 0);
  await screen(page, "busy");
  await page.unroute("**/api/vault");
  await page.getByRole("button", { name: "再试一次" }).click();
  await title(page, "把账单变成一本看得懂的账").waitFor();

  // ---- a sign-in starts at a press on this page. The address of /enter typed in, or followed from anywhere else, shows the page and begins nothing.
  assert.equal((await peek(`${server.base}/test/who`, JSON.stringify({ id: ACCOUNT }))).status, 200);
  await page.goto(`${ORIGIN}/enter`);
  await title(page, "把账单变成一本看得懂的账").waitFor();
  assert.equal(page.url(), `${ORIGIN}/`);
  assert.equal(asked.filter((line) => line.startsWith(`GET ${MAIN}`)).length, 0, "a sign-in was begun with nothing pressed");
  assert.equal((await standing(page)).status, 401);

  // ---- signing in: to the main site with a nonce, back with a code, and the code is traded and gone from the address
  await page.getByRole("link", { name: "用 changle.ca 账号登录" }).click();
  await title(page, "先定一个口令").waitFor();
  assert.equal(page.url(), `${ORIGIN}/`, "the code is still in the address");
  assert.deepEqual(asked.filter((line) => line.startsWith(`GET ${MAIN}`)).length, 1);
  assert.match(asked.find((line) => line.startsWith(`GET ${MAIN}`))!, /^GET https:\/\/main\.changle\.test\/tools\/finance\?handoff=[A-Za-z0-9_-]{43}$/);
  assert.equal(times("session"), 1);
  // (a screen starts at its title, for the keyboard and the screen reader; no keyboard comes up before the words were read)
  assert.equal(await page.evaluate("document.activeElement?.tagName"), "H1");
  await screen(page, "new-vault");
  // (who is signed in can be seen from here too, before there is a vault: one device, this one, and no word of a vault there is not)
  await page.getByRole("button", { name: "设备和记录" }).click();
  await title(page, "设备和记录").waitFor();
  await page.locator("li.device").first().waitFor();
  assert.equal(await page.locator("li.device").count(), 1);
  assert.doesNotMatch(await page.locator("li.device").innerText(), /保险库/);
  assert.match(await page.locator("li.device").innerText(), /这台设备/);
  assert.equal(await page.getByRole("heading", { name: "口令或恢复码输错的记录" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "让其他设备全部退出" }).count(), 0);
  await screen(page, "devices-no-vault");
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "先定一个口令").waitFor();

  // ---- a passphrase: what is too weak is said so, by its kind, and so is a second one that differs
  const first = page.getByLabel("口令", { exact: true });
  const second = page.getByLabel("再输一遍", { exact: true });
  const next = page.getByRole("button", { name: "下一步" });
  assert.ok(await next.isDisabled());
  for (const [weak, says] of [
    ["marmots", "太短了。至少 12 个字符（中文至少 8 个字）。"],
    ["passwordpassword", "太有规律了：重复的字、键盘上连着的键、一串数字，都是别人最先试的。"],
    ["Maplewood2026!!", "只有一两个词加上数字和符号，不够。再加几个词。"],
  ] as const) {
    await first.fill(weak);
    await second.fill(weak);
    await next.click();
    await page.getByRole("alert").filter({ hasText: says }).waitFor();
    assert.equal(await first.getAttribute("aria-invalid"), "true");
  }
  await screen(page, "new-vault-weak");
  await first.fill(PASSPHRASE);
  await second.fill(WRONG);
  await next.click();
  await page.getByRole("alert").filter({ hasText: "两次输的不一样。" }).waitFor();
  assert.deepEqual([await first.getAttribute("aria-invalid"), await second.getAttribute("aria-invalid")], [null, "true"]);
  // hidden as it is typed, until it is asked to be shown
  assert.equal(await first.getAttribute("type"), "password");
  await page.getByRole("button", { name: "显示" }).first().click();
  assert.deepEqual([await first.getAttribute("type"), await first.inputValue()], ["text", PASSPHRASE]);
  await page.getByRole("button", { name: "隐藏" }).first().click();
  assert.equal(await first.getAttribute("type"), "password");

  // ---- a vault that is made and not kept is not left lying: fifteen quiet minutes on the recovery code's screen, and its key and its code are dropped.
  // (On a second page of the same session, while this one still waits at the passphrase: the clock that is moved is the whole browser's.)
  const waited = await context.newPage();
  watch(waited);
  await waited.clock.install();
  await waited.goto(`${ORIGIN}/`);
  await title(waited, "先定一个口令").waitFor();
  await waited.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await waited.getByLabel("再输一遍", { exact: true }).fill(PASSPHRASE);
  await waited.getByRole("button", { name: "下一步" }).click();
  await title(waited, "把恢复码抄下来").waitFor();
  const dropped = (await waited.locator(".code span").allInnerTexts()).join("-");
  assert.match(dropped, /^([0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/);
  // (a press a minute before the time is up starts the count again, as with an open vault)
  await waited.clock.fastForward("14:00");
  await waited.keyboard.press("Shift");
  await waited.clock.fastForward("14:00");
  assert.ok(await title(waited, "把恢复码抄下来").isVisible(), "the code was dropped fifteen minutes after it was shown, though a key was pressed since");
  await waited.clock.fastForward("01:01");
  await title(waited, "先定一个口令").waitFor();
  await waited.getByText("超过 15 分钟没有动静，这个页面把刚才那把钥匙和恢复码丢掉了。重新定一次口令。").waitFor();
  assert.equal(await waited.getByLabel("口令", { exact: true }).inputValue(), "");
  assert.equal(await waited.locator(".code").count(), 0);
  assert.ok(!(await waited.content()).includes(dropped), "the dropped code is still in the page");
  assert.equal(times("vault/start"), 0);
  assert.deepEqual((await standing(waited)).vault, null);
  await screen(waited, "new-vault-timed-out");
  await waited.close();
  // (the first page is in front again: the clipboard is written only by the page that is looked at)
  await page.bringToFront();
  await second.fill(PASSPHRASE);
  await next.click();

  // ---- the recovery code: shown before anything is kept on the server, and the vault is made only once it was said to be written down
  await title(page, "把恢复码抄下来").waitFor();
  // (The browser's "forward" from here is the step that was the list of devices a while ago. The list is not laid over this screen, nor over the
  // next one once the vault is made: the page goes back off that step by itself.)
  const stood = await page.evaluate("navigation.currentEntry.index");
  // (Listened to for five seconds at most: a step that is not there is never come to, and this check would wait for it for ever.)
  const moves = await page.evaluate(`new Promise((done) => {
    const seen = [];
    const over = () => (removeEventListener("popstate", heard), done(seen));
    const heard = (event) => {
      seen.push(event.state?.moneylens ?? null);
      if (seen.length === 2) over();
    };
    addEventListener("popstate", heard);
    setTimeout(over, 5000);
    history.forward();
  })`);
  assert.deepEqual([moves, await page.evaluate("history.state"), await page.evaluate("navigation.currentEntry.index")], [["devices", null], null, stood]);
  assert.ok(await title(page, "把恢复码抄下来").isVisible());
  const code = (await page.locator(".code span").allInnerTexts()).join("-");
  assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/);
  assert.equal(times("vault/start"), 0, "the vault was kept before the code was shown");
  assert.deepEqual((await standing(page)).vault, null);
  const create = page.getByRole("button", { name: "建好保险库" });
  assert.ok(await create.isDisabled());
  await page.getByRole("button", { name: "复制" }).click();
  await page.getByText("复制好了").waitFor();
  assert.equal(await page.evaluate("navigator.clipboard.readText()"), code);
  await screen(page, "recovery-code");
  await page.getByLabel("我已经把恢复码抄下来，放在安全的地方了").check();
  // told to slow down, nothing is kept and the screen says so; the code stays, and the next press keeps the vault
  await page.route("**/api/vault/start", (route) => route.fulfill(slowDown));
  await create.click();
  await page.getByRole("alert").filter({ hasText: "这一会儿请求太多了，保险库还没建好。过一分钟再点一次。恢复码不变。" }).waitFor();
  assert.equal((await page.locator(".code span").allInnerTexts()).join("-"), code);
  await page.unroute("**/api/vault/start");
  assert.deepEqual((await standing(page)).vault, null);
  await create.click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText("已经和服务器对过。").waitFor();
  // (asked twice: the first never reached the server)
  assert.equal(times("vault/start"), 2);
  const made = await standing(page);
  assert.deepEqual([made.status, typeof made.vault, made.unlocked], [200, "string", true]);
  await screen(page, "open");

  // ---- what the browser keeps: the cache's own sealed lines and nothing else. Not the passphrase, not the code, no key, no wrapper.
  const secrets = [PASSPHRASE, code, code.replace(/-/g, ""), "wrapped", "passphrase", "recovery"];
  const unreadable = async (when: string): Promise<Stored> => {
    const stored = (await page.evaluate(STORED)) as Stored;
    for (const secret of secrets) assert.ok(!stored.text.includes(secret), `${when}: the browser's storage holds "${secret === code ? "the recovery code" : secret}"`);
    assert.deepEqual([stored.keys, stored.session, stored.cookies], [[], {}, ""], when);
    assert.deepEqual(Object.keys(stored.local), ["moneylens.lang"], when);
    return stored;
  };
  await unreadable("open");

  // ---- locking: the key is gone here, and the server is told
  await page.getByRole("button", { name: "锁上" }).click();
  await title(page, "打开你的账").waitFor();
  await until(page, LOCKED, "the server is told that the vault was locked");
  // (the one thing to do here is to type the passphrase: the field is ready for it)
  assert.equal(await page.evaluate("document.activeElement?.id"), "secret");
  await screen(page, "locked");
  await unreadable("locked");

  // ---- a wrong passphrase is said to be wrong, and the right one opens
  const secret = page.getByLabel("口令", { exact: true });
  const open = page.getByRole("button", { name: "打开", exact: true });
  await secret.fill(WRONG);
  await open.click();
  await page.getByRole("alert").filter({ hasText: "口令不对。" }).waitFor();
  assert.equal(await secret.getAttribute("aria-invalid"), "true");
  await screen(page, "locked-wrong");
  await secret.fill(PASSPHRASE);
  await secret.press("Enter");
  await title(page, "保险库打开了").waitFor();
  assert.equal((await standing(page)).unlocked, true);

  // ---- the devices that are signed in, and what has happened: one more screen, laid over the one a signed-in person is on
  /** A browser's name as the page says it in Chinese, from what the browser says of itself. */
  const named = (userAgent: string): string => {
    const parts = partsOf(labelOf(userAgent));
    assert.ok(parts?.browser && parts.system, `this browser calls itself something the server has no two words for: ${userAgent}`);
    return `${parts.system} 上的 ${parts.browser}`;
  };
  const mine = named((await page.evaluate("navigator.userAgent")) as string);
  // A second device signs in to the same account, and guesses at the passphrase once.
  const phones = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  });
  const phone = await phones.newPage();
  watch(phone);
  await phone.goto(`${ORIGIN}/`);
  await phone.getByRole("link", { name: "用 changle.ca 账号登录" }).click();
  await title(phone, "打开你的账").waitFor();
  await phone.getByLabel("口令", { exact: true }).fill(WRONG);
  await phone.getByRole("button", { name: "打开", exact: true }).click();
  await phone.getByRole("alert").filter({ hasText: "口令不对。" }).waitFor();
  // (it looks at the list too, from its locked screen: itself, and the first device)
  const phoneStood = await phone.evaluate("navigation.currentEntry.index");
  await phone.getByRole("button", { name: "设备和记录" }).click();
  await phone.locator("li.device").nth(1).waitFor();
  assert.ok((await phone.locator("li.device").filter({ hasText: "这台设备" }).innerText()).includes("iPhone 上的 Safari"));

  const panel = (heading: string) => page.locator("section.panel").filter({ has: page.getByRole("heading", { level: 2, name: heading, exact: true }) });
  const devices = page.locator("li.device");
  const here = devices.filter({ hasText: "这台设备" });
  const there = devices.filter({ hasText: "iPhone 上的 Safari" });
  const misses = panel("口令或恢复码输错的记录").locator("li");
  const unlocksBefore = times("vault/unlock");
  await page.getByRole("button", { name: "设备和记录" }).click();
  await title(page, "设备和记录").waitFor();
  // (the screen starts at its title, as every screen does; the phone's page was the last one looked at, so this one takes a moment longer to say so)
  await until(page, `document.activeElement?.tagName === "H1"`, "the list of devices starts at its title");
  // (a step of the browser's history, at the same address)
  assert.deepEqual([page.url(), await page.evaluate("history.state")], [`${ORIGIN}/`, { moneylens: "devices" }]);
  await devices.nth(1).waitFor();
  assert.deepEqual([await devices.count(), await here.count(), await there.count()], [2, 1, 1]);
  // this device holds the vault open, and is not signed out from this list; the other holds nothing open, and can be
  const hereSays = await here.innerText();
  assert.ok(hereSays.includes(mine) && hereSays.includes("保险库开着"), hereSays);
  assert.equal(await here.getByRole("button").count(), 0);
  // (the other has tried and missed: it is said to have opened nothing, and "locked" is said of no device, for that is only a device's own word)
  assert.ok((await there.innerText()).includes("这次登录后没打开过保险库"));
  assert.equal(await page.getByText("锁着").count(), 0);
  assert.equal(await page.getByText("打开过保险库的设备拿到过钥匙").count(), 0);
  await there.getByRole("button", { name: "让它退出" }).waitFor();
  // wrong tries at the passphrase stand apart, above everything else: two in the last day, the newest first, each with the device it came from
  assert.deepEqual(await page.locator("section.panel h2").allInnerTexts(), ["口令或恢复码输错的记录", "登录着的设备", "最近的记录"]);
  await panel("口令或恢复码输错的记录").getByText("过去 24 小时里输错了 2 次。").waitFor();
  assert.deepEqual(
    (await misses.allInnerTexts()).map((text) => [text.includes("口令或恢复码输错"), text.includes("iPhone 上的 Safari"), text.includes("这台设备")]),
    [
      [true, true, false],
      [true, false, true],
    ],
  );
  // everything else, newest first
  assert.deepEqual(await panel("最近的记录").locator("li .list-main").allInnerTexts(), ["登录", "打开了保险库", "建了保险库", "登录"]);
  // (every time is said as a time, for whoever does not read it off the screen)
  assert.ok(await page.locator("time").evaluateAll((all) => all.length === 10 && all.every((one) => !Number.isNaN(Date.parse(one.getAttribute("datetime") ?? "")))));
  await screen(page, "devices");
  // in English too
  await page.getByRole("button", { name: "English" }).click();
  await title(page, "Devices and activity").waitFor();
  await page.getByText("Wrong tries in the last 24 hours: 2.").waitFor();
  await devices.filter({ hasText: "Safari on iPhone" }).getByRole("button", { name: "Sign it out" }).waitFor();
  assert.ok((await devices.filter({ hasText: "This device" }).innerText()).includes("Vault open"));
  assert.ok((await devices.filter({ hasText: "Safari on iPhone" }).innerText()).includes("Has not opened the vault since this sign-in"));
  await screen(page, "devices-en");
  await page.getByRole("button", { name: "中文" }).click();
  await title(page, "设备和记录").waitFor();

  // The other device is signed out from here. When the server cannot be told, the page says that it was not done, and the device is still listed.
  await page.route("**/api/sessions/end", (route) => route.abort());
  await there.getByRole("button", { name: "让它退出" }).click();
  await page.getByRole("alert").filter({ hasText: "没连上服务器，这一步没做成。检查一下网络，再试一次。" }).waitFor();
  assert.equal(await devices.count(), 2);
  assert.equal((await standing(phone)).status, 200);
  await screen(page, "devices-not-done");
  await page.unroute("**/api/sessions/end");
  // told: it is gone from the list, and the page says so
  await there.getByRole("button", { name: "让它退出" }).click();
  await page.getByText("那台设备已经退出。").waitFor();
  assert.equal(await devices.count(), 1);
  assert.equal(await page.getByRole("button", { name: "让其他设备全部退出" }).count(), 0);
  // its wrong try is still shown, as that of a device that has since signed out
  assert.ok((await misses.first().innerText()).includes("一台已经退出的设备"));
  await screen(page, "devices-one-signed-out");
  // and that device can do nothing more: at its next press on its own list (it tries to sign the first device out) it is told that it is signed out, and the first device is not
  await phone.locator("li.device").filter({ hasText: mine }).getByRole("button", { name: "让它退出" }).click();
  await title(phone, "把账单变成一本看得懂的账").waitFor();
  // (and the page went back off the step its list was: nothing is left to press "back" through before the page is left)
  await until(phone, `history.state === null && navigation.currentEntry.index === ${phoneStood}`, "the phone went back off the step that was its list");
  assert.deepEqual([(await standing(phone)).status, (await standing(page)).status], [401, 200]);

  // "Back", the page's own or the browser's, is the screen behind it as it was: the vault is still open, and was not asked for again.
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "保险库打开了").waitFor();
  assert.deepEqual([await page.evaluate("history.state"), (await standing(page)).unlocked, times("vault/unlock")], [null, true, unlocksBefore]);
  await page.evaluate("history.forward()");
  await title(page, "设备和记录").waitFor();
  await page.evaluate("history.back()");
  await title(page, "保险库打开了").waitFor();

  // The phone signs in again, and this time it knows the passphrase. The list says that it holds the vault open, and what that means.
  await phone.getByRole("link", { name: "用 changle.ca 账号登录" }).click();
  await title(phone, "打开你的账").waitFor();
  await phone.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await phone.getByRole("button", { name: "打开", exact: true }).click();
  await title(phone, "保险库打开了").waitFor();
  await page.getByRole("button", { name: "设备和记录" }).click();
  await devices.nth(1).waitFor();
  assert.ok((await there.innerText()).includes("保险库开着"));
  await page.getByText("打开过保险库的设备拿到过钥匙，它后来怎么说都一样。其中要是有你不认识的，说明口令或恢复码已经被别人知道了。").waitFor();
  // It says it has locked. The list no longer counts it as holding the vault open, and goes on saying that it opened it: that it had the key
  // is what the server knows, whatever the device says since.
  await phone.getByRole("button", { name: "锁上" }).click();
  await title(phone, "打开你的账").waitFor();
  await until(phone, LOCKED, "the server is told that the phone locked");
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "保险库打开了").waitFor();
  await page.getByRole("button", { name: "设备和记录" }).click();
  await devices.nth(1).waitFor();
  assert.ok((await there.innerText()).includes("打开过保险库，后来说是锁上了"), await there.innerText());
  assert.equal(await page.getByText("打开过保险库的设备拿到过钥匙").count(), 1);
  await screen(page, "devices-another-opened");
  // All the others at once, with one press.
  await page.getByRole("button", { name: "让其他设备全部退出" }).click();
  await page.getByText("已经让其他设备退出，一共 1 台。").waitFor();
  assert.equal(await devices.count(), 1);
  // that it opened the vault is still said, now of a device that has signed out since (the review of the devices' screen, finding 3)
  const openedPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { level: 2, name: "别的设备打开过保险库", exact: true }) });
  assert.equal(await page.getByText("打开过保险库的设备拿到过钥匙").count(), 1);
  assert.match(await openedPanel.locator("li").first().innerText(), /打开了保险库[\s\S]*一台已经退出的设备/);
  assert.equal((await standing(phone)).status, 401);
  await phones.close();
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "保险库打开了").waitFor();

  // The list cannot be read: said so, with a way to try again, and never half a list.
  await page.route("**/api/events", (route) => route.abort());
  await page.getByRole("button", { name: "设备和记录" }).click();
  await page.getByText("没连上服务器，设备和记录没读到。检查一下网络，再试一次。").waitFor();
  assert.equal(await devices.count(), 0);
  await screen(page, "devices-unread");
  await page.unroute("**/api/events");
  await page.getByRole("button", { name: "再试一次" }).click();
  await here.waitFor();

  // Loaded afresh on that step, the page shows the list again. The vault behind it is locked, as after any fresh load: this device is no longer counted as
  // holding it open, and is said to have opened it.
  await page.reload();
  await title(page, "设备和记录").waitFor();
  await here.waitFor();
  assert.ok((await here.innerText()).includes("打开过保险库，后来说是锁上了"), await here.innerText());
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "打开你的账").waitFor();
  assert.equal(await page.evaluate("history.state"), null);
  // (from the locked screen too, and the browser's own "back" closes it)
  await page.getByRole("button", { name: "设备和记录" }).click();
  await title(page, "设备和记录").waitFor();
  await page.evaluate("history.back()");
  await title(page, "打开你的账").waitFor();
  // (open again, as the next check expects to find it)
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await title(page, "保险库打开了").waitFor();

  // ---- a page loaded afresh has no key: the vault is there, locked, and the recovery code opens it too
  await page.reload();
  await title(page, "打开你的账").waitFor();
  // (there is a way out from here too, without opening anything)
  assert.ok(await page.getByRole("button", { name: "退出登录" }).isVisible());
  await page.getByRole("button", { name: "忘了口令？用恢复码" }).click();
  const typed = page.getByLabel("恢复码", { exact: true });
  await page.getByText("大小写、空格和横线都不要紧。").waitFor();
  // what is not a code is said so here, and the server is not asked: a symbol too few, a symbol miscopied
  const unlocks = times("vault/unlock");
  await typed.fill(code.slice(0, -1));
  await open.click();
  await page.getByRole("alert").filter({ hasText: "恢复码有 34 位，这里是 33 位。" }).waitFor();
  await typed.fill(code.replace(/.$/, (last) => (last === "2" ? "3" : "2")));
  await open.click();
  await page.getByRole("alert").filter({ hasText: "有一位抄错了。" }).waitFor();
  await screen(page, "locked-code-typo");
  assert.equal(times("vault/unlock"), unlocks, "the server was asked about something that is not a code");
  // typed as people type: small letters, spaces for dashes; the whole of it is in sight, and Enter is "go"
  await typed.fill(code.toLowerCase().replace(/-/g, " "));
  assert.ok(await typed.evaluate((field) => field.scrollHeight <= field.clientHeight && field.scrollWidth <= field.clientWidth), "part of the typed code is out of sight");
  await typed.press("Enter");
  await title(page, "保险库打开了").waitFor();
  await page.getByText("已经和服务器对过。").waitFor();
  await unreadable("opened with the code");

  // ---- left for another page, the vault locks: here, and on the server, which is told as the page goes
  await page.goto(`${ORIGIN}/licences.txt`);
  assert.match(await page.locator("body").innerText(), /SIL Open Font License/);
  await page.goBack();
  await title(page, "打开你的账").waitFor();
  assert.equal((await standing(page)).unlocked, false, "the server still counts a page that was left as unlocked");

  // ---- fifteen quiet minutes lock it; a press before that starts the count again
  const timed = await context.newPage();
  watch(timed);
  await timed.clock.install();
  await timed.goto(`${ORIGIN}/`);
  await title(timed, "打开你的账").waitFor();
  await timed.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await timed.getByRole("button", { name: "打开", exact: true }).click();
  await title(timed, "保险库打开了").waitFor();
  await timed.clock.fastForward("14:50");
  await title(timed, "保险库打开了").waitFor();
  await timed.keyboard.press("Shift");
  await timed.clock.fastForward("14:50");
  assert.ok(await title(timed, "保险库打开了").isVisible(), "it locked fifteen minutes after it was opened, though a key was pressed since");
  await timed.clock.fastForward("00:11");
  await title(timed, "打开你的账").waitFor();
  await timed.getByText("15 分钟没有动静，已经锁上了。").waitFor();
  await screen(timed, "locked-idle");
  await until(timed, LOCKED, "the server is told that the vault locked itself");
  // (with the list of devices laid over an open vault, the fifteen minutes run on; and once it has locked, the list does not go on saying that this device holds it open)
  await timed.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await timed.getByRole("button", { name: "打开", exact: true }).click();
  await title(timed, "保险库打开了").waitFor();
  await timed.getByRole("button", { name: "设备和记录" }).click();
  const timedHere = timed.locator("li.device").filter({ hasText: "这台设备" });
  await timedHere.filter({ hasText: "保险库开着" }).waitFor();
  // (the word that it locked is held up on its way: a list that did not wait for it would be told that the vault is still open)
  await timed.route("**/api/vault/lock", async (route) => {
    await new Promise((done) => setTimeout(done, 500));
    await route.continue();
  });
  await timed.clock.fastForward("15:01");
  await timedHere.filter({ hasText: "打开过保险库，后来说是锁上了" }).waitFor();
  await timed.getByRole("button", { name: "返回" }).click();
  await title(timed, "打开你的账").waitFor();
  await timed.getByText("15 分钟没有动静，已经锁上了。").waitFor();
  await timed.close();

  // (a laptop has the vault open throughout: it is to be told of an erasing asked for, can call it off with a press,
  // and is to find out that the vault is gone at its next word with the server)
  const laptops = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const laptop = await laptops.newPage();
  watch(laptop);
  await laptop.goto(`${ORIGIN}/`);
  await laptop.getByRole("link", { name: "用 changle.ca 账号登录" }).click();
  await title(laptop, "打开你的账").waitFor();
  await laptop.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await laptop.getByRole("button", { name: "打开", exact: true }).click();
  await title(laptop, "保险库打开了").waitFor();
  await laptop.getByText("已经和服务器对过。").waitFor();

  // ---- a vault gone while the screen asks for it (erased elsewhere, or by its seven days): there is no way in, and the
  // page asks again where things stand and says so (the answers made here; then the page is loaded afresh)
  await title(page, "打开你的账").waitFor();
  const { status: _status, ...real } = await standing(page);
  void _status;
  const goneAnswer = JSON.stringify({ ...real, vault: null, unlocked: false, ways: [], erasing: null });
  await page.route("**/api/vault/way", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, why: "no-way" }) }));
  await page.route("**/api/vault", (route) => route.fulfill({ status: 200, contentType: "application/json", body: goneAnswer }));
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await title(page, "先定一个口令").waitFor();
  await page.getByText("这个保险库已经清空了：在别的设备上，或者要求的 7 天到了。现在可以建一个新的。").waitFor();
  await page.unroute("**/api/vault/way");
  await page.unroute("**/api/vault");
  await page.reload();

  // ---- starting over, from the screen that asks for the passphrase: the vault is to be erased in seven days
  await title(page, "打开你的账").waitFor();
  await page.getByRole("button", { name: "口令和恢复码都忘了？" }).click();
  await title(page, "清空重来").waitFor();
  assert.equal(await page.evaluate("history.state?.moneylens"), "reset");
  await page.getByText("口令和恢复码都没了的话，谁也找不回这个保险库里的东西，网站的经营者也不行。只能清空它，建一个新的，把账单重新导入。").waitFor();
  // (and what puts the seven days off: someone kept out)
  await page.getByText(/7 天都会重新算。$/).waitFor();
  await screen(page, "reset");
  await page.getByRole("button", { name: "7 天后清空这个保险库" }).click();
  await page.getByText(/^这个保险库会在 .+ 清空。是这台设备在 .+ 要求的。$/).waitFor();
  assert.equal(await page.getByRole("button", { name: "7 天后清空这个保险库" }).count(), 0);
  const erasingAsked = (await page.evaluate(`fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json())`)) as { erasing: { asked: number; due: number; here: boolean } | null };
  assert.ok(erasingAsked.erasing && erasingAsked.erasing.here && erasingAsked.erasing.due - erasingAsked.erasing.asked === 7 * 24 * 3_600_000, JSON.stringify(erasingAsked.erasing));
  await screen(page, "reset-asked");
  // back on the screen that asks for the passphrase, and on the list of devices, it is said: when, from where, and how to call it off
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "打开你的账").waitFor();
  await page.getByText(/^这个保险库会在 .+ 清空。/).waitFor();
  await page.getByText("用口令或恢复码打开保险库，清空就取消了。").waitFor();
  await screen(page, "locked-erasing");
  // turned away for too many wrong tries (an answer made here: nothing is counted on the server), it is said that the
  // erasing waits meanwhile, and what to do
  let turnedAway = 0;
  const readsBefore = times("vault");
  await page.route("**/api/vault/unlock", (route) => (turnedAway++, route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, why: "too-many", again: 3_600_000 }) })));
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.getByText(/^试错的次数满了的这段时间，谁来都打不开保险库/).waitFor();
  await page.unroute("**/api/vault/unlock");
  assert.equal(turnedAway, 1);
  // (and the notice asked the server again where the erasing stands: a try can put it off)
  for (let i = 0; i < 50 && times("vault") === readsBefore; i++) await page.waitForTimeout(100);
  assert.ok(times("vault") > readsBefore, "the notice was not asked again after a try");
  await screen(page, "locked-erasing-turned-away");
  await page.getByRole("button", { name: "设备和记录" }).click();
  await title(page, "设备和记录").waitFor();
  const erasingPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { level: 2, name: "保险库要被清空了", exact: true }) });
  assert.match(await erasingPanel.innerText(), /是这台设备在 .+ 要求的。/);
  assert.match(await erasingPanel.innerText(), /7 天都会重新算。/);
  assert.deepEqual((await page.locator("section.panel h2").allInnerTexts())[0], "保险库要被清空了");
  await page.locator("li .list-main").filter({ hasText: "要求 7 天后清空保险库" }).first().waitFor();
  await screen(page, "devices-erasing");
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "打开你的账").waitFor();

  // the laptop, which had the vault open before it was asked, is told at its next screen, and calls it off with one press
  await laptop.getByRole("button", { name: "设备和记录" }).click();
  await title(laptop, "设备和记录").waitFor();
  await laptop.getByRole("button", { name: "返回" }).click();
  await title(laptop, "保险库打开了").waitFor();
  await laptop.getByText(/^这个保险库会在 .+ 清空。是另一次登录在 .+ 要求的。$/).waitFor();
  await screen(laptop, "open-erasing");
  await laptop.getByRole("button", { name: "不清空了" }).click();
  await laptop.getByText("好，不清空了。").waitFor();
  assert.equal(await laptop.getByText(/^这个保险库会在 .+ 清空。/).count(), 0);
  assert.equal((await standing(laptop)).erasing, null);

  // asked for again, and then the vault opened with the passphrase: that calls it off, and the open vault says so
  await page.getByRole("button", { name: "口令和恢复码都忘了？" }).click();
  await page.getByRole("button", { name: "7 天后清空这个保险库" }).click();
  await page.getByText(/^这个保险库会在 .+ 清空。是这台设备在 .+ 要求的。$/).waitFor();
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "打开你的账").waitFor();
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText("有人要求过清空这个保险库。你打开了它，清空就取消了。还想清空的话，用下面的「清空保险库」。").waitFor();
  assert.equal(await page.getByText(/^这个保险库会在 .+ 清空。/).count(), 0);
  assert.equal((await standing(page)).erasing, null);
  await screen(page, "open-called-off");
  // asked for once more (here straight from the page), the open vault is told at its next screen; and should the vault
  // be gone when "don't erase it" is pressed (an answer made here), the page asks again where things stand
  const openId = (await standing(page)).vault as string;
  assert.equal(await page.evaluate(`fetch("/api/vault/erase-later", { method: "POST", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify({ vault: openId }))} }).then((r) => r.status)`), 200);
  await page.getByRole("button", { name: "设备和记录" }).click();
  await title(page, "设备和记录").waitFor();
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText(/^这个保险库会在 .+ 清空。是这台设备在 .+ 要求的。$/).waitFor();
  await page.route("**/api/vault/erase-cancel", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, why: "no-vault" }) }));
  await page.getByRole("button", { name: "不清空了" }).click();
  await title(page, "打开你的账").waitFor();
  await page.unroute("**/api/vault/erase-cancel");
  // (it was not gone: opened again, which calls the erasing off)
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText("有人要求过清空这个保险库。你打开了它，清空就取消了。还想清空的话，用下面的「清空保险库」。").waitFor();
  assert.equal((await standing(page)).erasing, null);
  // each device keeps a copy of the vault (here the line saying whose it is): erased, the vault takes it with it, on
  // the device that erased it and on the other
  const vaultNow = (await standing(page)).vault;
  assert.equal(typeof vaultNow, "string");
  for (const device of [page, laptop]) {
    await device.evaluate(keepCopy(vaultNow as string));
    assert.equal(((await device.evaluate(STORED)) as Stored).entries, 1);
  }

  // ---- erased at once, with the vault open: only once the word is typed
  await page.getByRole("button", { name: "清空保险库" }).click();
  await title(page, "清空保险库").waitFor();
  assert.equal(await page.evaluate("history.state?.moneylens"), "erase");
  const eraseNow = page.getByRole("button", { name: "现在清空" });
  const word = page.getByLabel("输入「清空」确认", { exact: true });
  assert.ok(await eraseNow.isDisabled());
  await word.fill("清");
  assert.ok(await eraseNow.isDisabled());
  await word.fill(" 清空 ");
  assert.ok(await eraseNow.isEnabled());
  await screen(page, "erase");
  // back is back to the vault, open as it was: nothing was erased
  await page.getByRole("button", { name: "返回" }).click();
  await title(page, "保险库打开了").waitFor();
  assert.equal((await standing(page)).unlocked, true);
  assert.equal(((await page.evaluate(STORED)) as Stored).entries, 1, "this device kept its copy while the vault was open");
  // (with a sealed blob in it, as a vault with records has: both stores are to be emptied, not only the line)
  await page.evaluate(keepChunk);
  assert.equal(((await page.evaluate(STORED)) as Stored).entries, 2);
  await page.getByRole("button", { name: "清空保险库" }).click();
  await page.getByLabel("输入「清空」确认", { exact: true }).fill("清空");
  await page.getByRole("button", { name: "现在清空" }).click();
  // the screen for a new vault, which says what happened; the step that was the erasing is gone back off
  await title(page, "先定一个口令").waitFor();
  await page.getByText("保险库清空了。现在可以建一个新的。").waitFor();
  await until(page, "history.state === null", "the page went back off the step that was the erasing");
  assert.deepEqual((await standing(page)).vault, null);
  // and this device's copy of the vault is emptied: nothing of it is left in the browser
  await until(page, `${STORED}.then((stored) => stored.entries === 0)`, "this device's copy of the erased vault was emptied");
  await screen(page, "new-after-erase");
  // the list says so, and that another device once opened the vault that is gone
  await page.getByRole("button", { name: "设备和记录" }).click();
  await page.locator("li .list-main").filter({ hasText: "清空了保险库" }).first().waitFor();
  await page.getByRole("heading", { level: 2, name: "别的设备打开过保险库", exact: true }).waitFor();
  await screen(page, "devices-after-erase");
  await page.getByRole("button", { name: "返回" }).click();
  // the laptop still shows its open vault; at its next word with the server (here, coming back to the vault from its
  // list) it is told it holds nothing open, asks where things stand, and is shown that there is no vault
  await title(laptop, "保险库打开了").waitFor();
  await laptop.getByRole("button", { name: "设备和记录" }).click();
  await title(laptop, "设备和记录").waitFor();
  await laptop.getByRole("button", { name: "返回" }).click();
  await title(laptop, "先定一个口令").waitFor();
  await laptop.getByText("这个保险库已经清空了：在别的设备上，或者要求的 7 天到了。现在可以建一个新的。").waitFor();
  await until(laptop, `${STORED}.then((stored) => stored.entries === 0)`, "the laptop's copy of the erased vault was emptied");
  await laptops.close();
  // a new vault, with the same passphrase as before, for what follows
  await page.getByLabel("口令", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("再输一遍", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "下一步" }).click();
  await title(page, "把恢复码抄下来").waitFor();
  await page.getByLabel("我已经把恢复码抄下来，放在安全的地方了").check();
  await page.getByRole("button", { name: "建好保险库" }).click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText("已经和服务器对过。").waitFor();
  await page.getByRole("button", { name: "锁上" }).click();
  await title(page, "打开你的账").waitFor();

  // ---- English, all the way in
  await page.getByRole("button", { name: "English" }).click();
  await title(page, "Open your records").waitFor();
  await page.getByLabel("Passphrase", { exact: true }).fill(WRONG);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "That's not the passphrase." }).waitFor();
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await title(page, "Your vault is open").waitFor();
  await page.getByText("In step with the server.").waitFor();
  await screen(page, "open-en");

  // ---- signing out. When the server cannot be told, the page does not say it is done: the session is still there.
  await page.route("**/api/session/end", (route) => route.abort());
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("alert").filter({ hasText: "Couldn't reach the server, so you are still signed in. Try again." }).waitFor();
  await title(page, "Your vault is open").waitFor();
  assert.equal((await standing(page)).status, 200);
  await screen(page, "sign-out-failed-en");
  await page.unroute("**/api/session/end");
  // told, the session is over, here and on the server
  await page.getByRole("button", { name: "Sign out" }).click();
  await title(page, "Bank statements, turned into a ledger you can read").waitFor();
  await page.getByText("You're signed out.").waitFor();
  assert.equal((await standing(page)).status, 401);
  await page.reload();
  await title(page, "Bank statements, turned into a ledger you can read").waitFor();

  // ---- an account that was not invited is told so, and gets no session
  assert.equal((await peek(`${server.base}/test/who`, JSON.stringify({ id: "utestcccc3" }))).status, 200);
  await page.getByRole("link", { name: "Sign in with your changle.ca account" }).click();
  await page.getByText("This account hasn't been invited yet.").waitFor();
  assert.equal(page.url(), `${ORIGIN}/`);
  assert.equal((await standing(page)).status, 401);
  await screen(page, "not-invited-en");

  // ---- nothing was asked of anyone but this origin, and of the main site for the one hop of each sign-in (T-8)
  const elsewhere = asked.filter((line) => !line.includes(` ${ORIGIN}/`) && !/^GET https:\/\/main\.changle\.test\/tools\/finance\?handoff=[A-Za-z0-9_-]{43}$/.test(line));
  assert.deepEqual(elsewhere, [], "the page asked somewhere else");
  // and nothing went wrong on the page but the answers it was meant to get: signed out (401), a wrong passphrase (422), not invited (403), told to slow down (429), a vault no longer open (423), a vault gone (404, the answers made here), and the requests cut off on purpose
  const expected = [/status of 401 \(/, /status of 422 \(/, /status of 403 \(/, /status of 429 \(/, /status of 423 \(/, /status of 404 \(/, /net::ERR_FAILED/];
  assert.deepEqual(errors.filter((line) => !expected.some((known) => known.test(line))), []);
  for (const known of expected) assert.ok(errors.some((line) => known.test(line)), `nothing matched ${known}`);
  console.log(`the app in the browser: ok (${shots || "no"} pictures)`);
} finally {
  await browser.close();
  await server.stop();
  rmSync(server.kept, { recursive: true, force: true });
}
