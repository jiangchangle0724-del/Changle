// The server itself, run on this machine (`wrangler dev`, Cloudflare's own runtime): the addresses,
// the key, the Durable Object's SQLite, and the live connection. `npm run test:server`.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import type { Sent } from "../../../site/src/split/changes";
import { KEY_HEADER, LIVE_PROTOCOL, type Push, type Pushed, type Since, type Snapshot } from "../src/room/protocol";

const PORT = 8796;
const HOST = `127.0.0.1:${PORT}`;
const API = `http://${HOST}/split/api`;
let server: ChildProcess;

before(async () => {
  server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--var", "ALLOW_TEST_SETTINGS:1"], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
  });
  const until = Date.now() + 90_000;
  for (;;) {
    try {
      if ((await fetch(`${API}/nothing`)).status === 404) return;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error("wrangler dev did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
});
after(async () => {
  // wrangler and the runtime it started are one group: ask, then insist
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-server.pid!, signal);
    } catch {
      return; // already gone
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
});

const newId = () => `t${randomUUID().replaceAll("-", "").slice(0, 21)}`;
const newKey = () => `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
async function call<T>(method: string, path: string, key: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(key ? { [KEY_HEADER]: key } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}
const three = [
  { id: "s", name: "Steve" },
  { id: "w", name: "小王" },
  { id: "m", name: "阿美" },
];
let n = 0;
const expense = (id: string, amount = 3000): Sent => ({
  id: `c${++n}-${randomUUID()}`,
  at: Date.now(),
  change: { do: "expense", expense: { kind: "expense", id, at: Date.now(), payer: "s", amount, note: "晚饭", split: { how: "equal", among: ["s", "w", "m"] }, rot: 0 } },
});
async function make() {
  const id = newId();
  const key = newKey();
  const made = await call<Snapshot>("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three });
  return { id, key, made };
}

test("making a ledger, and who may open it", async () => {
  const { id, key, made } = await make();
  assert.equal(made.status, 201);
  assert.deepEqual(made.data, { seq: 0, ledger: { id, name: "周末", currency: "CAD", members: three, entries: [] } });
  assert.equal((await call("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three })).status, 200, "asked for again: the same ledger");
  assert.deepEqual(await call("POST", "/ledgers", newKey(), { id, name: "x", currency: "CAD", members: three }), { status: 409, data: { error: "exists" } });
  assert.equal((await call("GET", `/ledgers/${id}`, key)).status, 200);
  assert.deepEqual(await call("GET", `/ledgers/${id}`, newKey()), { status: 403, data: { error: "key" } });
  assert.deepEqual(await call("GET", `/ledgers/${id}`, null), { status: 403, data: { error: "key" } });
  assert.deepEqual(await call("GET", `/ledgers/${id}?key=${key}`, null), { status: 403, data: { error: "key" } }, "the key is never read from the address");
  assert.deepEqual(await call("GET", `/ledgers/${newId()}`, key), { status: 404, data: { error: "gone" } });
  assert.deepEqual(await call("POST", "/ledgers", null, { id: newId(), name: "x", currency: "CAD", members: three }), { status: 403, data: { error: "key" } });
  assert.deepEqual(await call("POST", "/ledgers", key, { id: newId(), name: "x", currency: "XXX", members: three }), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", "/ledgers", key, "{not json"), { status: 400, data: { error: "bad" } });
});

test("sending changes: in order, once, kept, and in the record", async () => {
  const { id, key } = await make();
  const [e1, e2, e3] = [expense("e1"), expense("e2", 100), expense("e3")];
  const first = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [e1, e2] });
  assert.deepEqual([first.status, first.data.took, first.data.seq, first.data.ledger.entries.map((e) => e.id)], [200, ["new", "new"], 2, ["e1", "e2"]]);
  const again = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [e1, e2, e3] });
  assert.deepEqual([again.data.took, again.data.seq], [["seen", "seen", "new"], 3]);
  const read = await call<Snapshot>("GET", `/ledgers/${id}`, key);
  assert.deepEqual([read.data.seq, read.data.ledger.entries.length], [3, 3], "what was sent is what is read back");
  const record = await call<Since>("GET", `/ledgers/${id}?since=1`, key);
  assert.deepEqual([record.status, record.data.seq, record.data.changes.map((l) => [l.seq, l.sent.id])], [200, 3, [[2, e2.id], [3, e3.id]]]);
  assert.deepEqual(await call("GET", `/ledgers/${id}?since=x`, key), { status: 400, data: { error: "bad" } });

  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, newKey(), { changes: [expense("e9")] }), { status: 403, data: { error: "key" } });
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, { changes: [expense("e9"), { id: "junk" }] }), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, { changes: "e9" }), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, `{"changes":[],"pad":"${"x".repeat(400_000)}"}`), { status: 400, data: { error: "bad" } }, "a request too long to be changes isn't read");
  assert.equal((await call<Snapshot>("GET", `/ledgers/${id}`, key)).data.seq, 3, "and none of those changed anything");
});

test("a phone that is listening hears what another phone records", async () => {
  const { id, key } = await make();
  const heard: Push[] = [];
  let pongs = 0;
  const ws = new WebSocket(`ws://${HOST}/split/api/ledgers/${id}/live`, [LIVE_PROTOCOL, key]);
  const next = (count: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`heard ${heard.length} of ${count}`)), 10_000);
      const check = () => {
        if (heard.length < count) return;
        clearTimeout(timer);
        resolve();
      };
      ws.addEventListener("message", check);
      check();
    });
  ws.addEventListener("message", (e) => {
    if (e.data === "pong") pongs++;
    else heard.push(JSON.parse(String(e.data)) as Push);
  });
  await next(1);
  assert.deepEqual([ws.protocol, heard[0].t, heard[0].seq, heard[0].ledger.id], [LIVE_PROTOCOL, "ledger", 0, id], "on connecting: the ledger as it stands");

  const e1 = expense("e1");
  await call("POST", `/ledgers/${id}/changes`, key, { changes: [e1] });
  await next(2);
  assert.deepEqual([heard[1].seq, heard[1].ledger.entries.map((e) => e.id)], [1, ["e1"]], "another phone records: this one is sent the ledger");
  await call("POST", `/ledgers/${id}/changes`, key, { changes: [e1] });
  ws.send("ping");
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual([heard.length, pongs], [2, 1], "a change sent again tells nobody anything; a keep-alive is answered");
  ws.close();

  const opened = (key: string | null, id2 = id) =>
    new Promise<boolean>((resolve) => {
      const s = key ? new WebSocket(`ws://${HOST}/split/api/ledgers/${id2}/live`, [LIVE_PROTOCOL, key]) : new WebSocket(`ws://${HOST}/split/api/ledgers/${id2}/live`);
      s.addEventListener("open", () => (s.close(), resolve(true)));
      s.addEventListener("error", () => resolve(false));
      s.addEventListener("close", () => resolve(false));
    });
  assert.deepEqual([await opened(newKey()), await opened(null), await opened(key, newId())], [false, false, false], "no live connection with the wrong key, with none, or to a ledger that isn't there");
});

test("addresses that aren't there", async () => {
  const { id, key } = await make();
  for (const [method, path] of [["GET", ""], ["GET", "/ledgers"], ["GET", "/ledgers/abc"], ["PUT", `/ledgers/${id}`], ["GET", `/ledgers/${id}/changes`], ["POST", `/ledgers/${id}/nope`], ["GET", `/ledgers/${id}/live/more`], ["GET", "/other"]]) {
    assert.deepEqual(await call(method, path, key, method === "GET" ? undefined : {}), { status: 404, data: { error: "notfound" } }, `${method} ${path}`);
  }
  assert.equal((await fetch(`${API}/ledgers/${id}/live`, { headers: { [KEY_HEADER]: key } })).status, 426, "the live address is a WebSocket's");
});
