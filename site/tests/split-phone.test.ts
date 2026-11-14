/*
 * 两清 on the phone, the parts that touch the browser, with the browser made up: the phone's
 * storage, the clock, the network and the page coming to the front are all this file's own, so
 * every case here is decided, not waited for. Run with `npx tsx tests/split-phone.test.ts`
 *  1. What is kept (src/split/store.ts): written at once, read back, kept apart for two tabs.
 *  2. The server as a phone reaches it (src/split/net.ts): only an answer that is the server's counts.
 *  3. The live connection: what it hears, how it ends, and how a dead one is found out.
 *  4. The three together (src/split/syncing.ts): a ledger opened, recorded in, watched, left;
 *     one joined from an invitation; the list asking after each of its ledgers.
 *  5. Signed in: the phone's ledgers and the account's "my ledgers" made one; taking a ledger off
 *     the account, and its owner deleting it for everyone.
 *
 * (What is sent when, and what the phone makes of the answers, is tests/split-sync.test.ts.)
 */
import type { Sent } from "../src/split/changes";
import type { Ledger } from "../src/split/core";
import { startLedger } from "../src/split/ops";
import { hold, join, shown, type Held, type Snapshot } from "../src/split/sync";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const canon = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const eq = (got: unknown, want: unknown, msg: string) => ok(canon(got) === canon(want), `${msg}${canon(got) === canon(want) ? "" : ` → ${canon(got)}, wanted ${canon(want)}`}`);
/** Let everything that is on its way arrive. (The real clock: the made-up one below is only what the page sees.) */
const realTimeout = globalThis.setTimeout;
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => realTimeout(r, 0));
};

// ---------- a browser, made up ----------
class Storage {
  map = new Map<string, string>();
  /** a private window: nothing can be written */
  refuses = false;
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.refuses) throw new Error("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
type Timer = { id: number; run: () => void; ms: number; every: boolean; off: boolean };
const timers: Timer[] = [];
let timerId = 0;
const timer = (every: boolean) => (run: () => void, ms = 0) => {
  timers.push({ id: ++timerId, run, ms, every, off: false });
  return timerId;
};
const cancel = (id: number) => {
  const t = timers.find((x) => x.id === id);
  if (t) t.off = true;
};
/** Time passes: everything set for this long or less happens, once. */
const pass = (ms: number) => {
  for (const t of [...timers]) {
    if (t.off || t.ms > ms) continue;
    if (!t.every) t.off = true;
    t.run();
  }
};
const waiting = (ms: number) => timers.filter((t) => !t.off && t.ms === ms).length;
const heard: Record<string, Set<() => void>> = { online: new Set(), visibilitychange: new Set(), storage: new Set() };
const listenTo = (type: string, fn: () => void) => void heard[type]?.add(fn);
const unlisten = (type: string, fn: () => void) => void heard[type]?.delete(fn);
const page = { visibilityState: "visible", addEventListener: listenTo, removeEventListener: unlisten };
const storage = new Storage();

/** One request the page made, and how the test answers it. */
type Asked = { method: string; path: string; key: string | null; body: unknown; owner?: string; next?: string; auth?: string };
type Answer = { status: number; json?: unknown; text?: string } | "nothing" | "hangs";
const asked: Asked[] = [];
let answer: (a: Asked) => Answer = () => "nothing";

class Socket {
  static all: Socket[] = [];
  static refuses = false;
  static OPEN = 1;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    if (Socket.refuses) throw new Error("no sockets here");
    Socket.all.push(this);
  }
  send(text: string) {
    if (this.closed) throw new Error("closed");
    this.sent.push(text);
  }
  close() {
    this.closed = true;
  }
  /** what the other end does */
  opens() {
    this.onopen?.();
  }
  says(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drops(code = 1006) {
    this.onclose?.({ code });
  }
}
const lastSocket = () => Socket.all[Socket.all.length - 1];

Object.assign(globalThis, {
  window: { setTimeout: timer(false), clearTimeout: cancel, setInterval: timer(true), clearInterval: cancel, addEventListener: listenTo, removeEventListener: unlisten },
  document: page,
  location: { protocol: "https:", host: "changle.test" },
  localStorage: storage,
  WebSocket: Socket,
  fetch: async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}) => {
    const a: Asked = { method: init.method ?? "GET", path: url, key: init.headers?.["x-split-key"] ?? null, body: init.body ? JSON.parse(init.body) : undefined, owner: init.headers?.["x-split-owner"], next: init.headers?.["x-split-next"], auth: init.headers?.authorization };
    asked.push(a);
    const how = answer(a);
    if (how === "nothing") throw new TypeError("Failed to fetch");
    if (how === "hangs") return new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    return new Response(how.json !== undefined ? JSON.stringify(how.json) : (how.text ?? ""), { status: how.status, headers: { "content-type": how.json !== undefined ? "application/json" : "text/html" } });
  },
});

const people = [
  { id: "s", name: "Steve" },
  { id: "w", name: "小王" },
];
const fresh = (id: string): Ledger => startLedger(id, "周末", "CAD", people);
const KEY = "k".repeat(43);
const spend = (id: string): Sent => ({ id: `c-${id}`, at: 1, change: { do: "expense", expense: { kind: "expense", id, at: 1, payer: "s", amount: 3000, note: "", split: { how: "equal", among: ["s", "w"] }, rot: 0 } } });
const kept = () => JSON.parse(storage.getItem("changle.split.v2") ?? "null") as { held: Held[]; me: Record<string, string> } | null;

// ---------- 1. what is kept ----------
{
  storage.setItem("changle.split.v1", JSON.stringify({ ledgers: [fresh("old")], me: {} }));
  // (two tabs: the same file loaded twice, each with its own idea of what is kept)
  const tab1 = await import("../src/split/store");
  const again = "../src/split/store.ts?tab=2";
  const tab2 = (await import(again)) as typeof tab1;
  ok(tab1 !== tab2, "(the two tabs are two of the page)");
  eq([tab1.everyHeld(), tab2.everyHeld(), storage.getItem("changle.split.v1"), tab1.isKept()], [[], [], null, true], "the first sample's ledgers are not carried over, and the old record is off the phone");

  tab1.keepHeld(hold(fresh("ledger-1"), KEY), "s");
  eq([kept()?.held.map((h) => h.server.id), kept()?.me, kept()?.held[0]?.key === KEY, tab1.heldOf("ledger-1")?.made], [["ledger-1"], { "ledger-1": "s" }, true, false], "a ledger opened is kept at once, with its key and who you are in it");
  tab1.write("ledger-1", (h) => ({ ...h, waiting: [...h.waiting, spend("e1")] }));
  eq([kept()?.held[0]?.waiting.length, shown(tab1.heldOf("ledger-1") as Held).entries.length], [1, 1], "and so is what is recorded in it");
  tab1.keepHeld(hold(fresh("ledger-1"), "z".repeat(43)), "w");
  eq([kept()?.held.length, kept()?.held[0]?.key === KEY, kept()?.held[0]?.waiting.length, kept()?.me], [1, true, 1, { "ledger-1": "s" }], "a ledger the phone holds already is not taken a second time: it stays as it is, key, what is waiting and all");
  const before = storage.getItem("changle.split.v2");
  tab1.write("ledger-1", (h) => h);
  tab1.write("nobody's", (h) => ({ ...h, made: true }));
  ok(storage.getItem("changle.split.v2") === before, "a change that changes nothing, or is for a ledger this phone doesn't hold, writes nothing");

  // the other tab hasn't been told yet (a browser tells it a moment later): what it writes still starts from what is kept now
  eq(tab2.everyHeld(), [], "(the other tab, which looked before any of that, still thinks there are no ledgers)");
  tab2.keepHeld(hold(fresh("ledger-2"), KEY), "w");
  eq([kept()?.held.map((h) => h.server.id), kept()?.held[1]?.waiting.length, kept()?.me], [["ledger-2", "ledger-1"], 1, { "ledger-1": "s", "ledger-2": "w" }], "another tab opening a ledger doesn't write over the first one, or what was recorded in it");
  tab1.write("ledger-1", (h) => ({ ...h, waiting: [...h.waiting, spend("e2")] }));
  tab2.write("ledger-1", (h) => ({ ...h, made: true, seq: 0 }));
  eq([kept()?.held[1]?.waiting.map((s) => s.id), kept()?.held[1]?.made, kept()?.held.length], [["c-e1", "c-e2"], true, 2], "one tab records while the other hears from the server: both are kept");
  tab2.setMe("ledger-1", "w");
  tab1.dropHeld("ledger-2");
  eq([kept()?.held.map((h) => h.server.id), kept()?.me, tab1.heldOf("ledger-2"), tab1.heldOf("ledger-1")?.waiting.length], [["ledger-1"], { "ledger-1": "w" }, null, 2], "who you are, and a ledger taken off the phone: each tab's change stands beside the other's");

  storage.refuses = true;
  tab1.write("ledger-1", (h) => ({ ...h, waiting: [...h.waiting, spend("e3")] }));
  eq([tab1.isKept(), tab1.heldOf("ledger-1")?.waiting.length, kept()?.held[0]?.waiting.length], [false, 3, 2], "a browser that won't store anything: the page goes on with what it has, and knows it isn't kept");
  storage.refuses = false;
  tab1.write("ledger-1", (h) => ({ ...h, waiting: h.waiting.slice(0, 1) }));
  eq([tab1.isKept(), kept()?.held[0]?.waiting.length], [true, 1], "and when it stores again, it is kept again");
  tab1.dropHeld("ledger-1");
  tab1.keepHeld(join({ seq: 2, ledger: fresh("ledger-3") }, KEY));
  eq([kept()?.held.map((h) => [h.server.id, h.made, h.seq]), kept()?.me], [[["ledger-3", true, 2]], {}], "a ledger come by from an invitation is kept without knowing yet who its owner is");
  tab1.dropHeld("ledger-3");
}

// ---------- 2. the server as a phone reaches it ----------
const { net } = await import("../src/split/net");
{
  const ledger = fresh("ledger-9");
  const snapshot: Snapshot = { seq: 0, ledger };
  const body = { id: ledger.id, name: ledger.name, currency: ledger.currency, members: ledger.members };
  const says = async (how: Answer) => {
    answer = () => how;
    return net.make(KEY, body);
  };
  asked.length = 0;
  eq(await says({ status: 201, json: snapshot }), { status: 201, data: snapshot }, "a ledger made: the server's answer, as it is");
  eq(asked, [{ method: "POST", path: "/split/api/ledgers", key: KEY, body }], "asked for at the server's address, with the key in a header and nowhere in the address");
  eq(await says({ status: 200, json: { ...snapshot, seq: 4 } }), { status: 200, data: { ...snapshot, seq: 4 } }, "made already: the same");
  for (const [status, error] of [[403, "key"], [404, "gone"], [409, "exists"], [429, "limit"], [400, "bad"], [409, "full"]] as const) eq(await says({ status, json: { error } }), { status }, `the server refusing (${error}) is the server's answer: ${status}`);
  eq(await says({ status: 404, json: { error: "notfound" } }), { status: 400 }, "an address the server doesn't have is this page's mistake, not a ledger that is gone");

  const none = { status: 0 };
  eq(await says("nothing"), none, "no signal is no answer");
  eq(await says({ status: 200, text: "<html>Sign in to the hotel Wi-Fi</html>" }), none, "a page from something in between, saying all is well, is no answer");
  eq(await says({ status: 403, text: "<html>Blocked</html>" }), none, "nor is one saying no: a phone is never told its key is wrong by something that isn't the server");
  eq(await says({ status: 403, json: { error: "blocked by policy" } }), none, "nor a refusal in words the server doesn't use");
  eq(await says({ status: 404, json: { message: "Not Found" } }), none, "nor one that doesn't say why");
  eq(await says({ status: 200, json: { seq: 0 } }), none, "nor an answer without the ledger in it");
  eq(await says({ status: 200, json: { seq: "0", ledger } }), none, "or without its number");
  eq(await says({ status: 500, json: { error: "key" } }), none, "and the server's own bad day is no answer, whatever it says");
  eq(await says({ status: 503, text: "" }), none, "nor is it being away");

  // the server never answering at all
  answer = () => "hangs";
  const slow = net.make(KEY, body);
  await settle();
  ok(waiting(15_000) === 1, "a request is given 15 seconds");
  pass(15_000);
  eq(await slow, none, "after which it is no answer, and no longer waited for");
  answer = () => ({ status: 201, json: snapshot });
  await net.make(KEY, body);
  ok(waiting(15_000) === 0, "one that was answered isn't still being timed");

  asked.length = 0;
  answer = () => ({ status: 200, json: { ...snapshot, seq: 7 } });
  eq(await net.read("ledger-9", KEY), { status: 200, data: { ...snapshot, seq: 7 } }, "a ledger read: where it stands");
  eq(asked, [{ method: "GET", path: "/split/api/ledgers/ledger-9", key: KEY, body: undefined }], "at its own address, the key in a header");
  answer = () => ({ status: 403, json: { error: "key" } });
  eq(await net.read("ledger-9", "w".repeat(43)), { status: 403 }, "with a key that doesn't open it: the server says so");
  answer = () => ({ status: 200, text: "<!doctype html><title>开席</title>" });
  eq(await net.read("ledger-9", KEY), none, "and the site's own page in the server's place (a preview with no server) is no answer");

  asked.length = 0;
  const two = [spend("e1"), spend("e2")];
  const pushed = { seq: 2, ledger, took: ["new", "nothing"] };
  answer = () => ({ status: 200, json: pushed });
  eq(await net.push("ledger-9", KEY, two), { status: 200, data: pushed }, "changes sent: where the ledger stands, and what became of each");
  eq(asked, [{ method: "POST", path: "/split/api/ledgers/ledger-9/changes", key: KEY, body: { changes: two } }], "to the ledger's own address, the key in a header again");
  answer = () => ({ status: 200, json: { ...pushed, took: ["new"] } });
  eq(await net.push("ledger-9", KEY, two), none, "an answer that accounts for fewer changes than were sent is no answer: they are sent again");
  answer = () => ({ status: 200, json: { ...pushed, took: ["new", "maybe"] } });
  eq(await net.push("ledger-9", KEY, two), none, "nor is one in a word the server doesn't use");
  answer = () => ({ status: 423, json: { error: "locked" } });
  eq(await net.push("ledger-9", KEY, two), { status: 423 }, "a locked ledger turning changes away is the server's answer: 423");
  answer = () => ({ status: 423, text: "Locked" });
  eq(await net.push("ledger-9", KEY, two), none, "the same number from something that isn't the server is no answer");

  // the owner's: its key goes with the request that makes the ledger, and alone on its two
  const OWNER = "o".repeat(43);
  const NEXT = "n".repeat(43);
  asked.length = 0;
  answer = () => ({ status: 201, json: snapshot });
  await net.make(KEY, body, OWNER);
  eq(asked, [{ method: "POST", path: "/split/api/ledgers", key: KEY, body, owner: OWNER }], "a ledger made by its owner: the owner's key in a header of its own beside the key");
  asked.length = 0;
  const locked = { seq: 3, ledger: { ...ledger, locked: 99 } };
  answer = () => ({ status: 200, json: locked });
  eq(await net.lock("ledger-9", OWNER, true), { status: 200, data: locked }, "the owner locks the ledger: it comes back locked, and since when");
  eq(asked, [{ method: "POST", path: "/split/api/ledgers/ledger-9/lock", key: null, body: { locked: true }, owner: OWNER }], "asked with the owner's key alone, in a header");
  asked.length = 0;
  answer = () => ({ status: 200, json: snapshot });
  eq(await net.rekey("ledger-9", OWNER, NEXT), { status: 200, data: snapshot }, "the owner changes the key");
  eq(asked, [{ method: "POST", path: "/split/api/ledgers/ledger-9/key", key: null, body: undefined, owner: OWNER, next: NEXT }], "the owner's key and the new one each in a header: neither in the address, and nothing in the body");
  answer = () => ({ status: 403, json: { error: "owner" } });
  eq([await net.rekey("ledger-9", KEY, NEXT), await net.lock("ledger-9", KEY, true)], [{ status: 403 }, { status: 403 }], "a key that isn't the owner's is refused by the server, in its own word");
  answer = () => ({ status: 403, text: "<html>Blocked</html>" });
  eq(await net.lock("ledger-9", OWNER, true), none, "and something in between saying no is no answer here either");
}

// ---------- 3. the live connection ----------
{
  const ledger = fresh("ledger-9");
  const got: Snapshot[] = [];
  const ends: number[] = [];
  const listen = () => net.listen("ledger-9", KEY, (s) => got.push(s), (status) => ends.push(status));
  const reset = () => {
    got.length = ends.length = asked.length = 0;
    timers.forEach((t) => (t.off = true));
  };

  reset();
  let stop = listen();
  let ws = lastSocket();
  eq([ws.url, ws.protocols], ["wss://changle.test/split/api/ledgers/ledger-9/live", ["split.v1", KEY]], "it dials the ledger's live address, with the key as a protocol name and nowhere in the address");
  ws.opens();
  ws.says({ t: "ledger", seq: 3, ledger });
  ws.says("pong");
  ws.says("{not json");
  ws.says({ t: "something else", seq: 9, ledger });
  ws.says({ t: "ledger", seq: "4", ledger });
  ws.says({ t: "ledger", seq: 5, ledger: { id: "x" } });
  eq([got, ends], [[{ seq: 3, ledger }], []], "it hears the ledger when the server sends it, and nothing else as a ledger");
  ws.drops();
  ws.says({ t: "ledger", seq: 6, ledger });
  ws.drops();
  eq([got.length, ends, ws.closed], [1, [0], true], "the connection ending is said once, and nothing is heard after");

  // a connection that never opened: the browser doesn't say why, so the ledger is asked for once
  for (const [how, status, why] of [
    [{ status: 403, json: { error: "key" } }, 403, "the key no longer opens it"],
    [{ status: 404, json: { error: "gone" } }, 404, "the ledger is gone"],
    [{ status: 200, json: { seq: 3, ledger } }, 0, "nothing is wrong with the key: it just couldn't connect"],
    ["nothing", 0, "there is no signal"],
    [{ status: 403, text: "<html>Blocked</html>" }, 0, "something in between said no: not the server's word, so not a wrong key"],
  ] as [Answer, number, string][]) {
    reset();
    answer = () => how;
    listen();
    lastSocket().drops();
    await settle();
    eq([ends, asked.map((a) => [a.method, a.path, a.key])], [[status], [["GET", "/split/api/ledgers/ledger-9", KEY]]], `refused before it opened, and asked why: ${why} → ${status}`);
  }

  // let go by the server because the owner changed the key: asked the same way, so it is known at once
  reset();
  answer = () => ({ status: 403, json: { error: "key" } });
  listen();
  ws = lastSocket();
  ws.opens();
  ws.drops(4403);
  await settle();
  eq([ends, asked.map((a) => [a.method, a.path, a.key])], [[403], [["GET", "/split/api/ledgers/ledger-9", KEY]]], "let go with the server's own number for a changed key: the ledger is asked for once, and the key is known not to open it");
  reset();
  answer = () => ({ status: 200, json: { seq: 3, ledger } });
  listen();
  ws = lastSocket();
  ws.opens();
  ws.drops(4403);
  await settle();
  eq(ends, [0], "(and if the key does open it after all, it was only a dropped line)");

  // let go because its owner deleted the ledger: asked the same way, so it is known at once
  reset();
  answer = () => ({ status: 404, json: { error: "gone" } });
  listen();
  ws = lastSocket();
  ws.opens();
  ws.drops(4404);
  await settle();
  eq([ends, asked.map((a) => [a.method, a.path])], [[404], [["GET", "/split/api/ledgers/ledger-9"]]], "let go with the server's own number for a deleted ledger: asked once, and it is known to be gone");

  // stopped by the page
  reset();
  stop = listen();
  ws = lastSocket();
  ws.opens();
  stop();
  ws.says({ t: "ledger", seq: 7, ledger });
  ws.drops();
  pass(60_000);
  eq([got, ends, ws.closed, timers.some((t) => !t.off), heard.visibilitychange.size], [[], [], true, false, 0], "stopped: the line is closed, nothing more is heard or said, and nothing is left running");
  reset();
  stop = listen();
  stop();
  lastSocket().drops();
  await settle();
  eq([ends, asked.length], [[], 0], "stopped before it opened: it doesn't even ask why");

  // a line that died while the phone slept: asked, and found out
  reset();
  listen();
  ws = lastSocket();
  ws.opens();
  pass(25_000);
  eq([ws.sent, ends], [["ping"], []], "every 25 seconds the line is asked if it is there");
  ws.says("pong");
  pass(25_000);
  eq([ws.sent, ends], [["ping", "ping"], []], "it answered: asked again the next time");
  pass(25_000);
  eq([ws.sent.length, ends, ws.closed], [2, [0], true], "it didn't: the line is dead, and that is said");

  reset();
  listen();
  ws = lastSocket();
  ws.opens();
  page.visibilityState = "hidden";
  heard.visibilitychange.forEach((fn) => fn());
  eq(ws.sent, [], "the page going to the back asks nothing");
  page.visibilityState = "visible";
  heard.visibilitychange.forEach((fn) => fn());
  eq([ws.sent, waiting(4000)], [["ping"], 1], "the page coming to the front asks the line at once, and gives it 4 seconds");
  ws.says("pong");
  pass(4000);
  eq(ends, [], "it answered: still listening");
  heard.visibilitychange.forEach((fn) => fn());
  pass(4000);
  eq([ends, ws.closed], [[0], true], "the next time it doesn't: found out in 4 seconds, not at the next half minute");

  // a browser that can't dial at all
  reset();
  Socket.refuses = true;
  listen();
  await settle();
  eq(ends, [0], "a browser that can't open a connection: no connection, said once");
  Socket.refuses = false;
  reset();
}

// ---------- 4. the three together ----------
{
  const store = await import("../src/split/store");
  const syncing = await import("../src/split/syncing");
  // a server, as far as these few steps need one
  const made = new Map<string, { seq: number; ledger: Ledger }>();
  answer = (a) => {
    if (a.method === "POST" && a.path === "/split/api/ledgers") {
      const b = a.body as { id: string; name: string; currency: string; members: { id: string; name: string }[] };
      const there = made.get(b.id);
      if (there) return { status: 200, json: there };
      made.set(b.id, { seq: 0, ledger: startLedger(b.id, b.name, b.currency, b.members) });
      return { status: 201, json: made.get(b.id) };
    }
    const id = a.path.split("/")[4];
    const at = made.get(id);
    if (!at) return { status: 404, json: { error: "gone" } };
    if (a.method === "GET") return { status: 200, json: at };
    if (a.path.endsWith("/key")) return { status: 200, json: at };
    if (a.path.endsWith("/lock")) {
      const { locked: _since, ...open } = at.ledger;
      at.ledger = (a.body as { locked: boolean }).locked ? { ...open, locked: 5 } : open;
      at.seq += 1;
      return { status: 200, json: at };
    }
    const changes = (a.body as { changes: Sent[] }).changes;
    for (const c of changes) if (c.change.do === "expense") at.ledger = { ...at.ledger, entries: [...at.ledger.entries, c.change.expense] };
    at.seq += changes.length;
    return { status: 200, json: { ...at, took: changes.map(() => "new") } };
  };
  const posts = () => asked.filter((a) => a.method === "POST").map((a) => a.path.replace("/split/api/ledgers", "") || "(make)");
  asked.length = 0;
  Socket.all.length = 0;
  timers.forEach((t) => (t.off = true));

  // something recorded last time that never went up
  store.keepHeld({ ...hold(fresh("ledger-4"), KEY), waiting: [spend("e1")] }, "s");
  store.keepHeld(join({ seq: 0, ledger: fresh("ledger-5") }, KEY), "s");
  made.set("ledger-5", { seq: 0, ledger: fresh("ledger-5") });
  let leave = syncing.startSyncing();
  await settle();
  eq([posts(), store.heldOf("ledger-4")?.made, store.heldOf("ledger-4")?.waiting.length, Socket.all.length], [["(make)", "/ledger-4/changes"], true, 0, 0], "两清 opened: the ledger that had something to send is made and sent, with no connection held open, and the one with nothing to send is left alone");

  // going from the list to a ledger: one screen down, the next up, in the same breath
  asked.length = 0;
  const ledger = fresh("ledger-6");
  syncing.openLedger(ledger, "s");
  leave();
  const unwatch = syncing.watch("ledger-6");
  leave = syncing.startSyncing();
  pass(0);
  await settle();
  eq([posts(), store.heldOf("ledger-6")?.made, Socket.all.length, lastSocket()?.url.endsWith("/ledgers/ledger-6/live")], [["(make)"], true, 1, true], "a ledger started and its page opened: made once, though the screen changed while the request was on its way, and listened to");
  lastSocket().opens();
  ok(syncing.record("ledger-6", spend("e1").change), "an expense recorded on its page");
  ok(shown(store.heldOf("ledger-6") as Held).entries.length === 1, "is on the screen at once");
  await settle();
  eq([posts(), store.heldOf("ledger-6")?.waiting.length, made.get("ledger-6")?.ledger.entries.length], [["(make)", "/ledger-6/changes"], 0, 1], "and on the server a moment later");
  ok(syncing.record("ledger-6", spend("e1").change) && !syncing.record("ledger-6", { do: "rename", member: "nobody", name: "x" }) && posts().length === 2, "recorded again it is already so (nothing is sent); what the ledger doesn't allow is refused");
  ok(!syncing.record("not on this phone", spend("e2").change), "and there is no recording in a ledger this phone doesn't hold");

  // the page is left for the list
  unwatch();
  eq(lastSocket().closed, false, "(leaving the ledger's page: for a moment the connection is still up, in case the page is only being drawn again)");
  pass(0);
  eq(lastSocket().closed, true, "a moment later it is closed: only a ledger on the screen is listened to");

  // no signal, then the phone finds one
  const server = answer;
  answer = () => "nothing";
  asked.length = 0;
  ok(syncing.record("ledger-6", spend("e7").change), "with no signal, and its page closed, the ledger still records");
  await settle();
  eq([posts(), store.heldOf("ledger-6")?.waiting.length, waiting(1000)], [["/ledger-6/changes"], 1, 1], "it is tried, kept on the phone, and to be tried again in a second");
  answer = server;
  heard.online.forEach((fn) => fn());
  await settle();
  eq([posts(), store.heldOf("ledger-6")?.waiting.length, made.get("ledger-6")?.ledger.entries.length, waiting(1000)], [["/ledger-6/changes", "/ledger-6/changes"], 0, 2, 0], "the phone finds a signal: it goes up at once, without waiting out the second");
  page.visibilityState = "hidden";
  heard.visibilitychange.forEach((fn) => fn());
  page.visibilityState = "visible";
  asked.length = 0;
  heard.visibilitychange.forEach((fn) => fn());
  await settle();
  eq(asked.length, 0, "the page coming back to the front with nothing waiting asks the server nothing");

  // an invitation: a ledger's id, and the key that opens it
  made.set("ledger-8", { seq: 5, ledger: { ...fresh("ledger-8"), name: "别人的账本" } });
  asked.length = 0;
  eq(await syncing.joinLedger("ledger-8", KEY), "in", "an invitation opened: the phone is in");
  eq([asked.map((a) => [a.method, a.path, a.key]), store.heldOf("ledger-8")?.made, store.heldOf("ledger-8")?.seq, store.heldOf("ledger-8")?.server.name, store.heldOf("ledger-8")?.key === KEY, kept()?.me["ledger-8"]],
    [[["GET", "/split/api/ledgers/ledger-8", KEY]], true, 5, "别人的账本", true, undefined],
    "the ledger was read once with the invitation's key, and is held with it from here on; who its owner is isn't known yet");
  eq([await syncing.joinLedger("ledger-8", KEY), asked.length], ["in", 1], "the same invitation opened again: the phone has the ledger already, and nothing is asked");
  const real = answer;
  // (from here the server knows which key opens ledger-8)
  let opens = KEY;
  answer = (a) => (a.path.includes("ledger-8") && a.key !== opens ? { status: 403, json: { error: "key" } } : real(a));
  eq([await syncing.joinLedger("ledger-8", "z".repeat(43)), asked.length, store.heldOf("ledger-8")?.key === KEY], ["in", 2, true], "a link with another key that doesn't open the ledger (an old invitation, a mangled one): tried once, and the phone keeps the key it has");

  // its owner changes the key: what this phone has opens nothing, until a new invitation is opened on it
  const NEW = "n".repeat(43);
  opens = NEW;
  ok(syncing.record("ledger-8", spend("j1").change), "(something recorded on a phone whose key was changed under it)");
  await settle();
  eq([syncing.syncOf("ledger-8").trouble, store.heldOf("ledger-8")?.waiting.length], ["key", 1], "the owner changed the key: this phone's opens nothing, it says so, and keeps what it recorded");
  asked.length = 0;
  eq(await syncing.joinLedger("ledger-8", NEW), "in", "the new invitation, opened on a phone that has the ledger");
  await settle();
  eq([store.heldOf("ledger-8")?.key === NEW, syncing.syncOf("ledger-8").trouble, store.heldOf("ledger-8")?.waiting.length, made.get("ledger-8")?.ledger.entries.length, asked.every((a) => a.key === NEW), kept()?.held.find((h) => h.server.id === "ledger-8")?.key === NEW],
    [true, null, 0, 1, true, true],
    "the phone takes the new key and keeps it, is out of trouble, and what it had kept goes up with the new key");
  answer = real;
  for (const [how, want] of [
    [{ status: 403, json: { error: "key" } }, "key"],
    [{ status: 404, json: { error: "gone" } }, "gone"],
    ["nothing", "away"],
    [{ status: 200, text: "<html>" }, "away"],
    [{ status: 400, json: { error: "bad" } }, "away"],
  ] as [Answer, string][]) {
    answer = () => how;
    eq([await syncing.joinLedger("ledger-x", KEY), store.heldOf("ledger-x")], [want, null], `an invitation that doesn't get in (${want}) leaves nothing on the phone`);
  }
  answer = () => ({ status: 200, json: { seq: 3, ledger: fresh("ledger-y") } });
  eq([await syncing.joinLedger("ledger-x", KEY), store.heldOf("ledger-x"), store.heldOf("ledger-y")], ["away", null, null], "an answer about some other ledger is no answer: neither is kept");
  answer = real;

  // the list of ledgers on the screen
  asked.length = 0;
  const leaveList = syncing.browse();
  await settle();
  eq(asked.map((a) => `${a.method} ${a.path.replace("/split/api/ledgers", "")}`).sort(), ["GET /ledger-4", "GET /ledger-5", "GET /ledger-6", "GET /ledger-8"], "the list of ledgers on the screen: each is asked after, once");
  eq(store.heldOf("ledger-6")?.server.entries.length, 2, "(and what the server has is what the phone shows)");
  asked.length = 0;
  page.visibilityState = "hidden";
  heard.visibilitychange.forEach((fn) => fn());
  page.visibilityState = "visible";
  heard.visibilitychange.forEach((fn) => fn());
  await settle();
  eq(asked.length, 4, "and again when the page comes back to the front");
  leaveList();
  asked.length = 0;
  heard.visibilitychange.forEach((fn) => fn());
  await settle();
  eq(asked.length, 0, "the list left: no more asking");

  // the phone that starts a ledger is its owner
  asked.length = 0;
  syncing.openLedger(fresh("ledger-o"), "s");
  await settle();
  const mine = store.heldOf("ledger-o")!;
  ok(typeof mine.owner === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{41}[A-Za-z0-9]$/.test(mine.owner) && mine.owner !== mine.key, "a ledger started here: the phone makes an owner's key for it, another one than the key that opens it");
  eq(asked.filter((a) => a.method === "POST").map((a) => [a.path, a.key === mine.key, a.owner === mine.owner]), [["/split/api/ledgers", true, true]], "and sends it once, with the request that makes the ledger");
  ok(kept()?.held.find((h) => h.server.id === "ledger-o")?.owner === mine.owner && store.heldOf("ledger-8")?.owner === undefined, "it is kept with the ledger; a ledger this phone came into by an invitation has none");

  asked.length = 0;
  eq([await syncing.lockLedger("ledger-8", true), asked.length], [false, 0], "a ledger that isn't this phone's to lock: nothing is asked");
  eq(await syncing.lockLedger("ledger-o", true), true, "the owner locks its ledger");
  eq([asked.map((a) => [a.method, a.path, a.key, a.owner === mine.owner, a.body]), store.heldOf("ledger-o")?.server.locked, kept()?.held.find((h) => h.server.id === "ledger-o")?.server.locked],
    [[["POST", "/split/api/ledgers/ledger-o/lock", null, true, { locked: true }]], 5, 5],
    "asked once, with the owner's key; the phone holds the ledger locked, and keeps it so");
  ok(!syncing.record("ledger-o", spend("o1").change) && store.heldOf("ledger-o")?.waiting.length === 0, "locked: nothing is recorded on it");
  eq([await syncing.lockLedger("ledger-o", false), store.heldOf("ledger-o")?.server.locked], [true, undefined], "opened again");
  ok(syncing.record("ledger-o", spend("o1").change), "and it records as before");
  await settle();
  const real2 = answer;
  answer = () => "nothing";
  eq([await syncing.lockLedger("ledger-o", true), store.heldOf("ledger-o")?.server.locked], [false, undefined], "with no signal it isn't locked, and the screen is told so");
  answer = real2;

  asked.length = 0;
  syncing.rekeyLedger("ledger-o");
  const during = store.heldOf("ledger-o")!;
  ok(!!during.next && during.next !== during.key && during.next !== during.owner && kept()?.held.find((h) => h.server.id === "ledger-o")?.next === during.next, "the owner changes the key: a new one is made, and kept before anything is sent");
  await settle();
  const after = store.heldOf("ledger-o")!;
  eq([after.key === during.next, after.next, after.owner === mine.owner, asked.filter((a) => a.method === "POST").map((a) => [a.path, a.key, a.owner === mine.owner, a.next === during.next])],
    [true, undefined, true, [["/split/api/ledgers/ledger-o/key", null, true, true]]],
    "the server has it: it is the ledger's key on this phone now, asked for once with the owner's key");
  syncing.rekeyLedger("ledger-8");
  ok(store.heldOf("ledger-8")?.next === undefined, "a ledger that isn't this phone's keeps its key");
  await syncing.removeLedger("ledger-o");
  await syncing.removeLedger("ledger-8");

  // a ledger taken off the phone, and 两清 left
  ok(await syncing.removeLedger("ledger-6"), "signed out, taking a ledger off the phone needs no signal");
  eq([store.heldOf("ledger-6"), kept()?.held.map((h) => h.server.id)], [null, ["ledger-5", "ledger-4"]], "a ledger deleted is off the phone, key and all");
  leave();
  pass(0);
  asked.length = 0;
  heard.online.forEach((fn) => fn());
  await settle();
  eq([asked.length, heard.online.size, heard.visibilitychange.size, timers.some((t) => !t.off)], [0, 0, 0, false], "两清 left: nothing is sent, nothing is listened for, nothing is left running");
}

// ---------- 5. signed in: the account's ledgers ----------
{
  const store = await import("../src/split/store");
  const syncing = await import("../src/split/syncing");
  const net = await import("../src/split/net");
  for (const h of store.everyHeld()) await syncing.removeLedger(h.server.id);
  asked.length = 0;
  Socket.all.length = 0;
  timers.forEach((t) => (t.off = true));

  // A server with ledgers and accounts, as far as these steps need one. A ledger: its key, its
  // owner's key. An account: its ledgers, the last kept first.
  type Kept = { seq: number; ledger: Ledger; key: string; owner?: string };
  type Mine = { id: string; key: string; owner?: string; me?: string; at: number };
  const ledgers = new Map<string, Kept>();
  const accounts = new Map<string, Mine[]>();
  const SESSION = { u1: "session-of-u1-000000000000", u2: "session-of-u2-000000000000" };
  const whose = (a: Asked) => Object.entries(SESSION).find(([, s]) => a.auth === `Bearer ${s}`)?.[0];
  const listOf = (who: string) => accounts.get(who) ?? accounts.set(who, []).get(who)!;
  let at = 0;
  const keepIn = (who: string, m: Omit<Mine, "at">) => {
    const list = listOf(who);
    const was = list.find((x) => x.id === m.id);
    const next: Mine = { id: m.id, key: m.key, ...((m.owner ?? was?.owner) ? { owner: m.owner ?? was?.owner } : {}), ...(m.me !== undefined ? (m.me ? { me: m.me } : {}) : was?.me ? { me: was.me } : {}), at: was?.at ?? ++at };
    accounts.set(who, was ? list.map((x) => (x.id === m.id ? next : x)) : [next, ...list]);
    return next;
  };
  answer = (a) => {
    const parts = a.path.replace("/split/api/", "").split("/");
    const who = whose(a);
    // (a sign-in that ran out is nobody's, wherever it is sent)
    if (a.auth && !who) return { status: 401, json: { error: "signin" } };
    if (parts[0] === "me") {
      if (!who) return { status: 401, json: { error: "signin" } };
      if (parts.length === 2) return { status: 200, json: { ledgers: listOf(who) } };
      const id = parts[2];
      if (a.method === "DELETE") {
        accounts.set(who, listOf(who).filter((m) => m.id !== id));
        return { status: 200, json: { ok: true } };
      }
      const l = ledgers.get(id);
      if (!l) return { status: 404, json: { error: "gone" } };
      if (a.key !== l.key) return { status: 403, json: { error: "key" } };
      if (a.owner !== undefined && a.owner !== l.owner) return { status: 403, json: { error: "owner" } };
      const me = (a.body as { me?: string | null } | undefined)?.me;
      return { status: 200, json: { mine: keepIn(who, { id, key: a.key, owner: a.owner, me: me === null ? "" : me }) } };
    }
    if (parts.length === 1 && a.method === "POST") {
      const b = a.body as { id: string; name: string; currency: string; members: { id: string; name: string }[] };
      if (!ledgers.has(b.id)) ledgers.set(b.id, { seq: 0, ledger: startLedger(b.id, b.name, b.currency, b.members), key: a.key!, owner: a.owner });
      if (who) keepIn(who, { id: b.id, key: a.key!, owner: a.owner });
      const l = ledgers.get(b.id)!;
      return { status: 201, json: { seq: l.seq, ledger: l.ledger } };
    }
    const l = ledgers.get(parts[1]);
    if (a.method === "DELETE") {
      if (!l) return { status: 404, json: { error: "gone" } };
      if (a.owner !== l.owner) return { status: 403, json: { error: "owner" } };
      ledgers.delete(parts[1]);
      if (who) accounts.set(who, listOf(who).filter((m) => m.id !== parts[1]));
      return { status: 200, json: { ok: true } };
    }
    if (!l) return { status: 404, json: { error: "gone" } };
    if (a.key !== l.key) return { status: 403, json: { error: "key" } };
    if (a.method === "GET") return { status: 200, json: { seq: l.seq, ledger: l.ledger } };
    const changes = (a.body as { changes: Sent[] }).changes;
    l.seq += changes.length;
    return { status: 200, json: { seq: l.seq, ledger: l.ledger, took: changes.map(() => "new") } };
  };
  const onServer = (id: string, key: string, owner?: string) => ledgers.set(id, { seq: 0, ledger: fresh(id), key, ...(owner ? { owner } : {}) });
  const K = (c: string) => c.repeat(43);
  const signIn = (who: "u1" | "u2" | null) => {
    if (who) storage.setItem(net.SESSION_KEY, SESSION[who]);
    else storage.removeItem(net.SESSION_KEY);
    syncing.setAccount(who);
  };
  const leave = syncing.startSyncing();

  // signed out: a ledger joined from an invitation is kept on the phone only, and nothing is asked of an account
  onServer("joined-1", K("a"));
  eq(await syncing.joinLedger("joined-1", K("a")), "in", "signed out, a ledger joined");
  store.setMe("joined-1", "w");
  await syncing.syncMine();
  eq([store.heldOf("joined-1")?.acct, asked.some((a) => a.path.includes("/me/"))], [undefined, false], "it is the phone's alone, and no account is asked about");
  ok(syncing.listed(store.heldOf("joined-1")!, null), "and it is in the list");

  // the account has ledgers this phone has never seen: two that are there, one its owner deleted
  onServer("theirs-1", K("b"), K("B"));
  keepIn("u1", { id: "theirs-1", key: K("b"), owner: K("B"), me: "s" });
  keepIn("u1", { id: "deleted-1", key: K("c") });
  onServer("newest-1", K("n"));
  keepIn("u1", { id: "newest-1", key: K("n") });
  asked.length = 0;
  signIn("u1");
  await settle();
  await settle();
  const order = store.everyHeld().map((h) => h.server.id);
  ok(order.indexOf("newest-1") < order.indexOf("theirs-1"), `signing in is enough to bring them, in the account's order, the last kept first (${order.join(", ")})`);
  const theirs = store.heldOf("theirs-1");
  eq([theirs?.key === K("b"), theirs?.owner === K("B"), theirs?.acct, theirs?.made, store.meOf("theirs-1")], [true, true, "u1", true, "s"], "signed in: a ledger of the account's comes to the phone, with the owner's key and who they are, as the account's");
  ok(asked.filter((a) => a.path.includes("/me/")).every((a) => a.auth === `Bearer ${SESSION.u1}`), "every question about the account carries the site's sign-in");
  eq([store.heldOf("deleted-1"), listOf("u1").some((m) => m.id === "deleted-1")], [null, false], "one deleted by its owner isn't held, and comes off the account's list");
  const joined = listOf("u1").find((m) => m.id === "joined-1");
  eq([joined?.key === K("a"), joined?.me, store.heldOf("joined-1")?.acct], [true, "w", "u1"], "the ledger joined while signed out goes to the account, with who they are, and is the account's from then on");
  eq(kept()?.held.find((h) => h.server.id === "joined-1")?.acct, "u1", "(and kept so on the phone)");
  asked.length = 0;
  await syncing.syncMine();
  eq(asked.map((a) => `${a.method} ${a.path}`), ["GET /split/api/me/ledgers"], "the next time, the two are already one: the list is asked for, and nothing else");

  // a ledger started here, signed in
  asked.length = 0;
  syncing.openLedger(fresh("mine-1"), "s");
  await settle();
  const started = store.heldOf("mine-1")!;
  eq(asked.filter((a) => a.method === "POST").map((a) => [a.path, a.auth === `Bearer ${SESSION.u1}`, a.owner === started.owner]), [["/split/api/ledgers", true, true]], "signed in, the request that makes a ledger carries the sign-in");
  eq([store.heldOf("mine-1")?.acct, listOf("u1").find((m) => m.id === "mine-1")?.owner === started.owner, listOf("u1").find((m) => m.id === "mine-1")?.me], ["u1", true, "s"], "the server put it in the account as it made it, and the phone, hearing so, holds it as the account's at once, and tells the account who they are");

  // the account knows a newer key (its owner changed it on another phone): this phone's no longer opens the ledger
  ledgers.get("theirs-1")!.key = K("d");
  keepIn("u1", { id: "theirs-1", key: K("d") });
  asked.length = 0;
  await syncing.syncMine();
  eq([store.heldOf("theirs-1")?.key === K("d"), store.heldOf("theirs-1")?.owner === K("B")], [true, true], "the phone tries its own key, it no longer opens the ledger, and it takes the account's");
  // this phone changed the key, and the account hasn't heard (the request didn't reach it)
  ledgers.get("theirs-1")!.key = K("e");
  store.write("theirs-1", (h) => ({ ...h, key: K("e") }));
  await syncing.syncMine();
  eq(listOf("u1").find((m) => m.id === "theirs-1")?.key === K("e"), true, "the phone's key opens it and the account's doesn't: the account is told");

  // who they are, said on this phone
  syncing.iAm("theirs-1", "w");
  await settle();
  eq(listOf("u1").find((m) => m.id === "theirs-1")?.me, "w", "who they are goes to the account");

  // taken off on another of the account's phones
  accounts.set("u1", listOf("u1").filter((m) => m.id !== "mine-1"));
  store.write("joined-1", (h) => ({ ...h, waiting: [spend("j1")] }));
  accounts.set("u1", listOf("u1").filter((m) => m.id !== "joined-1"));
  answer = ((real) => (a: Asked) => (a.path.endsWith("/changes") ? "nothing" : real(a)))(answer);
  await syncing.syncMine();
  eq([store.heldOf("mine-1"), !!store.heldOf("joined-1")], [null, true], "the account no longer has them: off this phone too, but not while something on it is still to go up");

  // signed in, a ledger joined goes to the account at once
  onServer("joined-2", K("j"));
  eq(await syncing.joinLedger("joined-2", K("j")), "in", "signed in, a ledger joined");
  await settle();
  eq([store.heldOf("joined-2")?.acct, listOf("u1").find((m) => m.id === "joined-2")?.key === K("j")], ["u1", true], "it goes to the account's ledgers at once, and is the account's on the phone");

  // the owner's key and who they are: the account has them, a phone that joined by the invitation doesn't
  onServer("owned-1", K("k"), K("K"));
  keepIn("u1", { id: "owned-1", key: K("k"), owner: K("K"), me: "s" });
  store.keepHeld(join({ seq: 0, ledger: fresh("owned-1") }, K("k")));
  await syncing.syncMine();
  eq([store.heldOf("owned-1")?.owner === K("K"), store.meOf("owned-1"), store.heldOf("owned-1")?.acct], [true, "s", "u1"], "a phone that joined a ledger its account started takes the owner's key and who they are from the account");

  // opened with no signal: it goes to the account as it is made, not before
  const meanwhile = answer;
  answer = (a) => (a.method === "POST" && a.path === "/split/api/ledgers" ? "nothing" : meanwhile(a));
  syncing.openLedger(fresh("offline-1"), "s");
  asked.length = 0;
  await syncing.syncMine();
  eq([asked.filter((a) => a.path.includes("offline-1")).map((a) => a.method), store.heldOf("offline-1")?.made], [[], false], "a ledger not yet made on the server: nothing is asked about it in the account");
  answer = meanwhile;

  // another account's ledger on this phone
  onServer("other-1", K("f"));
  store.keepHeld({ ...join({ seq: 0, ledger: fresh("other-1") }, K("f")), acct: "u2" });
  asked.length = 0;
  await syncing.syncMine();
  eq([asked.some((a) => a.path.includes("other-1")), store.heldOf("other-1")?.acct, syncing.listed(store.heldOf("other-1")!, "u1"), syncing.listed(store.heldOf("other-1")!, null)], [false, "u2", false, false], "another account's stays on the phone untouched, and out of the list, signed in or out");

  // taken off my ledgers, here
  asked.length = 0;
  const real = answer;
  answer = () => "nothing";
  eq([await syncing.removeLedger("theirs-1"), !!store.heldOf("theirs-1")], [false, true], "with no signal it can't be taken off the account: nothing changes, and the screen is told");
  answer = real;
  eq([await syncing.removeLedger("theirs-1"), store.heldOf("theirs-1"), listOf("u1").some((m) => m.id === "theirs-1"), ledgers.has("theirs-1")], [true, null, false, true], "with one, it comes off the account and the phone; the ledger stays on the server for the others");

  // deleted by its owner
  syncing.openLedger(fresh("mine-2"), "s");
  await settle();
  const owner2 = store.heldOf("mine-2")!.owner!;
  answer = () => "nothing";
  eq([await syncing.eraseLedger("mine-2"), !!store.heldOf("mine-2")], [false, true], "with no signal, not deleted");
  answer = real;
  asked.length = 0;
  eq([await syncing.eraseLedger("mine-2"), store.heldOf("mine-2"), ledgers.has("mine-2"), listOf("u1").some((m) => m.id === "mine-2")], [true, null, false, false], "its owner deletes it: gone from the server, the account and the phone");
  eq(asked.map((a) => [a.method, a.path, a.owner === owner2, a.key, a.auth === `Bearer ${SESSION.u1}`]), [["DELETE", "/split/api/ledgers/mine-2", true, null, true]], "asked once, with the owner's key and the sign-in, and not the key that opens it");
  onServer("theirs-2", K("g"), K("G"));
  store.keepHeld({ ...join({ seq: 0, ledger: fresh("theirs-2") }, K("g")), owner: K("H") });
  eq([await syncing.eraseLedger("theirs-2"), store.heldOf("theirs-2")?.owner, ledgers.has("theirs-2")], [false, undefined, true], "a phone that took itself for the owner, and isn't: not deleted, and it doesn't take itself for one from then on");
  eq(await syncing.eraseLedger("joined-1"), false, "a ledger this phone isn't the owner of: nothing to ask");
  asked.length = 0;
  eq([await syncing.eraseLedger("offline-1"), asked.length, !!store.heldOf("offline-1")], [false, 0, true], "one the server hasn't made yet: nothing there to delete, and nothing is asked (the sheet doesn't offer it)");
  onServer("owned-2", K("m"), K("M"));
  store.keepHeld({ ...join({ seq: 0, ledger: fresh("owned-2") }, K("m")), owner: K("M") });
  ledgers.delete("owned-2");
  eq([await syncing.eraseLedger("owned-2"), store.heldOf("owned-2")], [true, null], "one already deleted (on another of the owner's phones): it is gone, and off this phone too");

  // the sign-in ran out before a ledger could go up; signed in again, it goes up by itself
  storage.setItem(net.SESSION_KEY, "expired-session-00000000000");
  syncing.openLedger(fresh("lapsed-1"), "s");
  await settle();
  eq([syncing.syncOf("lapsed-1").trouble, store.heldOf("lapsed-1")?.made], ["signin", false], "a sign-in that ran out: the ledger can't go up, and the page is told why");
  syncing.setAccount(null);
  signIn("u1");
  await settle();
  await settle();
  eq([syncing.syncOf("lapsed-1").trouble, store.heldOf("lapsed-1")?.made, store.heldOf("lapsed-1")?.acct], [null, true, "u1"], "signed in again: it goes up by itself, into the account's ledgers");

  // signed out again
  asked.length = 0;
  signIn(null);
  syncing.openLedger(fresh("anon-1"), "s");
  await settle();
  await syncing.syncMine();
  eq([asked.filter((a) => a.method === "POST").map((a) => [a.path, a.auth]), asked.some((a) => a.path.includes("/me/"))], [[["/split/api/ledgers", undefined]], false], "signed out: a ledger is made with no sign-in, and no account is asked about");
  ok(!syncing.listed(store.heldOf("joined-1")!, null) && syncing.listed(store.heldOf("anon-1")!, null), "the account's ledgers leave the list with the sign-in; the phone's own stay");

  // signed in again: the one started signed out goes to the account, owner's key and all, so the account's other phones are its owner too
  const anonOwner = store.heldOf("anon-1")!.owner!;
  signIn("u1");
  await settle();
  await settle();
  const anon = listOf("u1").find((m) => m.id === "anon-1");
  eq([anon?.owner === anonOwner, anon?.me, store.heldOf("anon-1")?.acct], [true, "s", "u1"], "signed in again, a ledger started signed out goes to the account, with its owner's key and who they are");

  // signed out while the account's ledgers were still coming: what came is the account's, out of sight, with its owner's key
  onServer("race-1", K("p"), K("P"));
  onServer("race-2", K("q"));
  keepIn("u1", { id: "race-1", key: K("p"), owner: K("P"), me: "s" });
  keepIn("u1", { id: "race-2", key: K("q") });
  const beforeRace = answer;
  answer = (a) => {
    // (the second one is asked for as the person signs out)
    if (a.method === "GET" && a.path === "/split/api/ledgers/race-2") {
      storage.removeItem(net.SESSION_KEY);
      syncing.setAccount(null);
    }
    return beforeRace(a);
  };
  await syncing.syncMine();
  answer = beforeRace;
  const raced = store.heldOf("race-1");
  eq([raced?.acct, raced?.owner === K("P"), store.meOf("race-1"), syncing.listed(raced!, null), store.heldOf("race-2")], ["u1", true, "s", false, null], "signed out while they were coming: the one that came is the account's (out of sight), with its owner's key and who they are; the rest wait for the next sign-in");
  leave();
  pass(0);
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
