/**
 * Tries the cache in the browser's own storage (src/web/idbcache.ts) in a real browser: the store
 * keeps its records there sealed, a page that is closed and opened again finds them, a second tab
 * is told the cache is taken, and nothing in the site's storage can be read (T-24). Run by
 * `npm run test:page`, with the Chrome already on the machine. Every value is invented.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";
import type { Api } from "../tests/browser/cache.entry";

const bundle = await build({ entryPoints: ["tests/browser/cache.entry.ts"], bundle: true, format: "iife", target: "es2022", write: false, logLevel: "warning" });
const script = bundle.outputFiles[0]!.text;
// a page on localhost: storage and the platform's cryptography need a real origin, which a file has not
const server = createServer((request, response) => {
  if (request.url === "/app.js") response.writeHead(200, { "content-type": "text/javascript" }).end(script);
  else response.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><meta charset="utf-8"><title>cache</title><script src="/app.js"></script>');
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

/** Calls one of the page's functions (tests/browser/cache.entry.ts) with plain values. */
const call = <K extends keyof Api>(page: Page, name: K, ...args: Parameters<Api[K]>): Promise<Awaited<ReturnType<Api[K]>>> =>
  page.evaluate(`ml.${name}(...${JSON.stringify(args)})`) as Promise<Awaited<ReturnType<Api[K]>>>;

const vault = "AAAAAAAAAAAAAAAAAAAABw";
const key = Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256);
const markers = ["MARKER-CEDAR-2291", "标记-杨梅-7714"];
const idOf = (n: number) => `AAAAAAAAAAAAAAAAAAA${String(n).padStart(2, "A")}`.slice(0, 21) + "A";
const words = [...markers, "INVENTED", "chequing", "amount", "posted", "t/acct", "book", idOf(10), idOf(11)];

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const errors: string[] = [];
  const watch = (page: Page) => {
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
  };
  const first = await context.newPage();
  watch(first);
  await first.goto(url);
  assert.equal(await call(first, "hold"), "held");
  assert.deepEqual(await call(first, "open", vault, key), { records: 0, chunks: 0, pending: 0, damaged: 0, doubled: 0 });
  assert.deepEqual(await call(first, "add", "account", "book", { id: idOf(10), name: markers[0]!, kind: "chequing" }), { ok: true });
  for (let i = 0; i < 300; i++) {
    const id = `AAAAAAAAAAAAAAAAAA${(1000 + i).toString(36).padStart(3, "0")}A`.replace(/[^A-Za-z0-9_-]/g, "A");
    assert.deepEqual(await call(first, "add", "txn", "t/acct", { id, posted: "2026-10-03", amount: -100 - i, description: `INVENTED SHOP ${markers[1]} ${i}` }), { ok: true });
  }
  // nothing is in storage until it is flushed, and then only sealed
  assert.equal((await call(first, "stored", words)).entries, 0);
  await call(first, "flush");
  const kept = await call(first, "stored", words);
  assert.deepEqual(kept.databases, ["moneylens-test"]);
  assert.equal(kept.entries, 4, "the book, two chunks of transactions, and the one line that says which vault");
  assert.deepEqual(kept.shapes, ["chunks: id,local,version", "meta: cursor,vault"]);
  assert.deepEqual(kept.found, [], "something of the records can be read in the browser's storage");
  assert.deepEqual([kept.local, kept.session, kept.cookies], [0, 0, ""]);

  // a second tab: the cache is taken, and it is told so
  const second = await context.newPage();
  watch(second);
  await second.goto(url);
  assert.equal(await call(second, "hold"), "taken");
  // (without the lock nothing would stop it: storage is shared, which is why the lock is there)
  assert.equal(await call(second, "peek"), 3);
  // the first tab closes without a word, as a tab does; the hold goes with it
  await first.close();
  // (asked from here until it is so: the browser's own waiting takes a promise for a yes, and would ask once)
  for (let tries = 0; !(await second.evaluate("ml.hold().then((held) => held === 'held' || (ml.release(), false))")); tries++) {
    assert.ok(tries < 100, "the second tab never got the cache");
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.deepEqual(await call(second, "open", vault, key), { records: 301, chunks: 3, pending: 3, damaged: 0, doubled: 0 });
  assert.equal((await call(second, "list", "txn")).length, 300);
  assert.equal((await call(second, "list", "account"))[0]!.name, markers[0]);
  // sent to a server (one in the page), and saved again: still nothing readable, now with the server's version numbers
  assert.deepEqual(await call(second, "sync"), { ok: true, why: "", sent: 3, received: 0 });
  const after = await call(second, "stored", words);
  assert.deepEqual(after.shapes, ["chunks: base,id,version", "meta: cursor,vault"]);
  assert.deepEqual(after.found, []);
  assert.equal((await call(second, "status")).pending, 0);
  // the cache holds one vault: a write for another is refused, and nothing changes
  assert.equal(await call(second, "saveAs", "AAAAAAAAAAAAAAAAAAAACA"), "cache: it holds another vault");
  assert.equal((await call(second, "stored", words)).entries, 4);
  // A save that goes wrong part-way writes nothing: not the new place in the list, not the chunk that could have been
  // written, and the chunk it was to drop is still there.
  const before = await call(second, "loaded");
  assert.ok(before && before.ids.length === 3);
  assert.match(await call(second, "saveBroken", vault, before.ids[0]!), /^failed: /);
  assert.deepEqual(await call(second, "loaded"), before);
  assert.equal((await call(second, "stored", words)).entries, 4);
  // and the cache still works afterwards
  assert.deepEqual(await call(second, "add", "txn", "t/acct", { id: idOf(11), posted: "2026-10-04", amount: -1, description: "INVENTED AFTER" }), { ok: true });
  assert.deepEqual(await call(second, "sync"), { ok: true, why: "", sent: 1, received: 0 });
  assert.deepEqual((await call(second, "stored", words)).found, []);
  // letting go hands it to the next page
  await call(second, "release");
  const third = await context.newPage();
  watch(third);
  await third.goto(url);
  assert.equal(await call(third, "hold"), "held");
  assert.deepEqual(await call(third, "open", vault, key), { records: 302, chunks: 3, pending: 0, damaged: 0, doubled: 0 });
  // A layout left by a later version of the app: this version does not open it, does not change it, and says that it has
  // no storage it can use (the app then runs without a cache), which is not "another tab has it".
  await call(third, "release");
  const kept2 = await call(third, "stored", words);
  assert.equal(await call(third, "future"), 2);
  assert.equal(await call(third, "hold"), "unavailable");
  const untouched = await call(third, "stored", words);
  assert.deepEqual([untouched.entries, untouched.found], [kept2.entries, []]);
  assert.ok(untouched.shapes.includes("chunks: base,id,version"));
  // the lock was let go again, so a page that can read the layout is not shut out
  assert.equal(await third.evaluate("navigator.locks.query().then((q) => q.held.length)"), 0);
  assert.deepEqual(errors, []);
  console.log("cache in the browser: ok");
} finally {
  await browser.close();
  server.close();
}
