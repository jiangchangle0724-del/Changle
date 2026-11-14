/*
 * 两清 on the phone, the parts that touch the browser, with the browser made up: the phone's
 * storage, the clock, the network and the page coming to the front are all this file's own, so
 * every case here is decided, not waited for. Run with `npx tsx tests/split-phone.test.ts`
 *  1. What is kept (src/split/store.ts): written at once, read back, kept apart for two tabs.
 *  2. The server as a phone reaches it (src/split/net.ts): only an answer that is the server's counts.
 *  3. The live connection: what it hears, how it ends, and how a dead one is found out.
 *  4. The three together (src/split/syncing.ts): a ledger opened, recorded in, watched, left;
 *     one joined from an invitation; the list asking after each of its ledgers.
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
type Asked = { method: string; path: string; key: string | null; body: unknown };
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
  onclose: (() => void) | null = null;
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
  drops() {
    this.onclose?.();
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
    const a: Asked = { method: init.method ?? "GET", path: url, key: init.headers?.["x-split-key"] ?? null, body: init.body ? JSON.parse(init.body) : undefined };
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
  eq([await syncing.joinLedger("ledger-8", "z".repeat(43)), asked.length, store.heldOf("ledger-8")?.key === KEY], ["in", 1, true], "opened again (even by another link): the phone has it already, and nothing is asked or changed");
  const real = answer;
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
  syncing.forget("ledger-8");

  // a ledger taken off the phone, and 两清 left
  syncing.forget("ledger-6");
  eq([store.heldOf("ledger-6"), kept()?.held.map((h) => h.server.id)], [null, ["ledger-5", "ledger-4"]], "a ledger deleted is off the phone, key and all");
  leave();
  pass(0);
  asked.length = 0;
  heard.online.forEach((fn) => fn());
  await settle();
  eq([asked.length, heard.online.size, heard.visibilitychange.size, timers.some((t) => !t.off)], [0, 0, 0, false], "两清 left: nothing is sent, nothing is listened for, nothing is left running");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
