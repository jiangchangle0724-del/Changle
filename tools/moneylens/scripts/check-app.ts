/**
 * The app in a real browser, against the server on Cloudflare's own runtime on this machine: the
 * whole way in. A browser that is signed in at the main site (the stand-in, tests/accounts) signs
 * in here, makes a vault with a passphrase, is shown the recovery code, locks, is turned away with
 * a wrong passphrase, opens with the right one, opens with the recovery code after the page was
 * loaded afresh, is locked after fifteen quiet minutes and when the page is left, and signs out.
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
  const standing = (page: Page): Promise<{ status: number; vault?: string | null; unlocked?: boolean }> =>
    page.evaluate(`fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(async (r) => ({ status: r.status, ...(await r.json()) }))`) as Promise<{ status: number; vault?: string | null; unlocked?: boolean }>;
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

  // ---- signing in: to the main site with a nonce, back with a code, and the code is traded and gone from the address
  assert.equal((await peek(`${server.base}/test/who`, JSON.stringify({ id: ACCOUNT }))).status, 200);
  await page.getByRole("link", { name: "用 changle.ca 账号登录" }).click();
  await title(page, "先定一个口令").waitFor();
  assert.equal(page.url(), `${ORIGIN}/`, "the code is still in the address");
  assert.deepEqual(asked.filter((line) => line.startsWith(`GET ${MAIN}`)).length, 1);
  assert.match(asked.find((line) => line.startsWith(`GET ${MAIN}`))!, /^GET https:\/\/main\.changle\.test\/tools\/finance\?handoff=[A-Za-z0-9_-]{43}$/);
  assert.equal(times("session"), 1);
  // (a screen starts at its title, for the keyboard and the screen reader; no keyboard comes up before the words were read)
  assert.equal(await page.evaluate("document.activeElement?.tagName"), "H1");
  await screen(page, "new-vault");

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
  await second.fill(PASSPHRASE);
  await next.click();

  // ---- the recovery code: shown before anything is kept on the server, and the vault is made only once it was said to be written down
  await title(page, "把恢复码抄下来").waitFor();
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
  await create.click();
  await title(page, "保险库打开了").waitFor();
  await page.getByText("已经和服务器对过。").waitFor();
  assert.equal(times("vault/start"), 1);
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
  await page.waitForFunction(`fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).then((said) => said.unlocked === false)`);
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
  await timed.waitForFunction(`fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).then((said) => said.unlocked === false)`);
  await timed.close();

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
  // and nothing went wrong on the page but the answers it was meant to get: signed out (401), a wrong passphrase (422), not invited (403), and the two requests cut off on purpose
  const expected = [/status of 401 \(/, /status of 422 \(/, /status of 403 \(/, /net::ERR_FAILED/];
  assert.deepEqual(errors.filter((line) => !expected.some((known) => known.test(line))), []);
  for (const known of expected) assert.ok(errors.some((line) => known.test(line)), `nothing matched ${known}`);
  console.log(`the app in the browser: ok (${shots || "no"} pictures)`);
} finally {
  await browser.close();
  await server.stop();
  rmSync(server.kept, { recursive: true, force: true });
}
