// The server itself, run on this machine (`wrangler dev`, Cloudflare's own runtime): the addresses,
// the key, the Durable Object's SQLite, the live connection, a changle.ca account's ledgers (with a
// stand-in for the rooms server that says whose a sign-in is: tests/rooms), and receipt photos in
// the bucket (which wrangler keeps on disk here; an account's room is TEST_QUOTA bytes, to fill).
// `npm run test:server`.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import type { Sent } from "../../../site/src/split/changes";
import { FILE_MAX, KEY_HEADER, LIVE_PROTOCOL, NEXT_HEADER, OWNER_HEADER, VIEW_HEADER, type Files, type InviteSent, type MineBody, type MyFiles, type MyInvites, type MyLedgers, type Push, type Pushed, type ReadReply, type Since, type Snapshot, type Stored } from "../src/room/protocol";
import { SESSION, STRANGER } from "./accounts";

const PORT = 8794;
const HOST = `127.0.0.1:${PORT}`;
const API = `http://${HOST}/split/api`;
let server: ChildProcess;
// Each run starts with nothing kept: an account's day of ledgers, or its list, from an earlier run
// on this machine would change what these tests see.
const kept = mkdtempSync(join(tmpdir(), "split-server-test-"));
/** An account's room for files here: small, so a test can fill it. */
const TEST_QUOTA = 300_000;
/**
 * The month's budget for reading receipts here, in millionths of a dollar: fifty readings by the
 * stand-in for Google (src/server/read.ts, fakeRead: 400 each), so a test can spend it.
 */
const TEST_READ_BUDGET = 20_000;

before(async () => {
  // (with the stand-in rooms server beside it, which says whose the test sessions are: tests/rooms)
  server = spawn("npx", ["wrangler", "dev", "-c", "wrangler.jsonc", "-c", "tests/rooms/wrangler.jsonc", "--port", String(PORT), "--ip", "127.0.0.1", "--var", "ALLOW_TEST_SETTINGS:1", "--var", `TEST_QUOTA:${TEST_QUOTA}`, "--var", "FAKE_READ:1", "--var", `TEST_READ_BUDGET:${TEST_READ_BUDGET}`, "--persist-to", kept], {
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
      break; // already gone
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  rmSync(kept, { recursive: true, force: true });
});

const newId = () => `t${randomUUID().replaceAll("-", "").slice(0, 21)}`;
const newKey = () => `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
async function call<T>(method: string, path: string, key: string | null, body?: unknown, more: Record<string, string> = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(key ? { [KEY_HEADER]: key } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...more },
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
const as = (session: string) => ({ authorization: `Bearer ${session}` });
/** A sign-in of an account of its own (the stand-in rooms server takes any "test-account-…": tests/accounts.ts), so no test runs out of an account's day. */
const someone = () => as(`test-account-${randomUUID().replaceAll("-", "").slice(0, 12)}`);
async function make() {
  const id = newId();
  const key = newKey();
  const made = await call<Snapshot>("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three }, someone());
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
  assert.deepEqual(await call("POST", "/ledgers", key, { id: newId(), name: "x", currency: "XXX", members: three }, someone()), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", "/ledgers", key, "{not json"), { status: 400, data: { error: "bad" } });
});

test("sending changes: in order, once, kept, and in the record", async () => {
  const { id, key } = await make();
  const [e1, e2, e3] = [expense("e1"), { ...expense("e2", 100), by: "w" }, expense("e3")];
  const first = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [e1, e2] });
  assert.deepEqual([first.status, first.data.took, first.data.seq, first.data.ledger.entries.map((e) => e.id)], [200, ["new", "new"], 2, ["e1", "e2"]]);
  const again = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [e1, e2, e3] });
  assert.deepEqual([again.data.took, again.data.seq], [["seen", "seen", "new"], 3]);
  const read = await call<Snapshot>("GET", `/ledgers/${id}`, key);
  assert.deepEqual([read.data.seq, read.data.ledger.entries.length], [3, 3], "what was sent is what is read back");
  const record = await call<Since>("GET", `/ledgers/${id}?since=1`, key);
  assert.deepEqual([record.status, record.data.seq, record.data.changes.map((l) => [l.seq, "sent" in l && l.sent.id])], [200, 3, [[2, e2.id], [3, e3.id]]]);
  assert.deepEqual(record.data.changes.map((l) => "sent" in l && (l.sent.by ?? null)), ["w", null], "the record says who made a change, when the phone said (a phone that didn't, nobody)");
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

test("the owner's two: the lock, and a new key for the invitation", async () => {
  const id = newId();
  const key = newKey();
  const owner = newKey();
  const asOwner = { [OWNER_HEADER]: owner };
  const ledger = { id, name: "周末", currency: "CAD", members: three };
  assert.deepEqual(await call("POST", "/ledgers", newKey(), { ...ledger, id: newId() }, { [OWNER_HEADER]: "short" }), { status: 400, data: { error: "bad" } }, "an owner's key that isn't one makes no ledger");
  assert.deepEqual(await call("POST", "/ledgers", key, { ...ledger, id: newId() }, { [OWNER_HEADER]: key, ...someone() }), { status: 400, data: { error: "bad" } }, "nor does one that is the invitation's key");
  assert.equal((await call("POST", "/ledgers", key, ledger, { ...asOwner, ...someone() })).status, 201);

  const heard: Push[] = [];
  const ws = new WebSocket(`ws://${HOST}/split/api/ledgers/${id}/live`, [LIVE_PROTOCOL, key]);
  ws.addEventListener("message", (e) => heard.push(JSON.parse(String(e.data)) as Push));
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  const until = async (count: number) => {
    for (let i = 0; i < 100 && heard.length < count; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(heard.length, count, "what the listening phone was sent");
  };
  await until(1);

  // the lock
  const lock = `/ledgers/${id}/lock`;
  assert.deepEqual(await call("POST", lock, key, { locked: true }), { status: 403, data: { error: "owner" } }, "not with the invitation's key");
  assert.deepEqual(await call("POST", lock, null, { locked: true }, { [OWNER_HEADER]: key }), { status: 403, data: { error: "owner" } }, "nor with it in the owner's place");
  assert.deepEqual(await call("POST", lock, null, { locked: true }, { [OWNER_HEADER]: newKey() }), { status: 403, data: { error: "owner" } });
  assert.deepEqual(await call("POST", lock, null, { locked: "yes" }, asOwner), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", `/ledgers/${newId()}/lock`, null, { locked: true }, asOwner), { status: 404, data: { error: "gone" } });
  const locked = await call<Snapshot>("POST", lock, null, { locked: true }, asOwner);
  assert.deepEqual([locked.status, locked.data.seq, typeof locked.data.ledger.locked], [200, 1, "number"], "locked by its owner");
  await until(2);
  assert.deepEqual([heard[1].seq, heard[1].ledger.locked], [1, locked.data.ledger.locked], "the phone that is listening sees it at once");
  const e1 = expense("e1");
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, { changes: [e1] }), { status: 423, data: { error: "locked" } }, "locked, it takes nothing");
  assert.equal((await call<Snapshot>("GET", `/ledgers/${id}`, key)).data.ledger.locked, locked.data.ledger.locked, "and can be read");
  assert.equal((await call<Snapshot>("POST", lock, null, { locked: true }, asOwner)).data.seq, 1, "locked again: already so");
  const opened = await call<Snapshot>("POST", lock, null, { locked: false }, asOwner);
  assert.deepEqual([opened.status, opened.data.seq, "locked" in opened.data.ledger], [200, 2, false], "opened again");
  const taken = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [e1] });
  assert.deepEqual([taken.status, taken.data.took, taken.data.seq], [200, ["new"], 3]);
  await until(4);
  const record = await call<Since>("GET", `/ledgers/${id}?since=0`, key);
  assert.deepEqual(record.data.changes.map((l) => ("lock" in l ? `${l.lock ? "locked" : "opened"} ${l.seq}` : `${l.sent.change.do} ${l.seq}`)), ["locked 1", "opened 2", "expense 3"], "the record keeps when it was locked and opened");

  // a new key
  const rekey = `/ledgers/${id}/key`;
  const next = newKey();
  assert.deepEqual(await call("POST", rekey, key, undefined, { [NEXT_HEADER]: next }), { status: 403, data: { error: "owner" } }, "not with the invitation's key");
  assert.deepEqual(await call("POST", rekey, null, undefined, { ...asOwner, [NEXT_HEADER]: "short" }), { status: 400, data: { error: "bad" } });
  assert.deepEqual(await call("POST", rekey, null, undefined, asOwner), { status: 400, data: { error: "bad" } }, "no new key given");
  assert.deepEqual(await call("POST", rekey, null, undefined, { ...asOwner, [NEXT_HEADER]: owner }), { status: 400, data: { error: "bad" } }, "the invitation's key can't be the owner's");
  assert.equal((await call("GET", `/ledgers/${id}`, key)).status, 200, "none of those changed the key");
  const done = await call<Snapshot>("POST", rekey, null, undefined, { ...asOwner, [NEXT_HEADER]: next });
  assert.deepEqual([done.status, done.data.seq, done.data.ledger.entries.length], [200, 3, 1], "the owner changes the key: the ledger is as it was");
  assert.equal(await closed, 4403, "the phone that was listening is let go");
  assert.deepEqual(await call("GET", `/ledgers/${id}`, key), { status: 403, data: { error: "key" } }, "the old key opens nothing");
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, { changes: [expense("e2")] }), { status: 403, data: { error: "key" } });
  assert.equal((await call<Snapshot>("GET", `/ledgers/${id}`, next)).data.seq, 3, "the new one does");
  assert.equal((await call("POST", rekey, null, undefined, { ...asOwner, [NEXT_HEADER]: next })).status, 200, "asked again: already so");
  const opens = (k: string) =>
    new Promise<boolean>((resolve) => {
      const s = new WebSocket(`ws://${HOST}/split/api/ledgers/${id}/live`, [LIVE_PROTOCOL, k]);
      s.addEventListener("open", () => (s.close(), resolve(true)));
      s.addEventListener("error", () => resolve(false));
      s.addEventListener("close", () => resolve(false));
    });
  assert.deepEqual([await opens(key), await opens(next)], [false, true], "and only the new key listens");

  // a ledger made with no owner's key has no owner
  const plain = await make();
  assert.deepEqual(await call("POST", `/ledgers/${plain.id}/lock`, null, { locked: true }, asOwner), { status: 403, data: { error: "owner" } });
  assert.deepEqual(await call("POST", `/ledgers/${plain.id}/key`, null, undefined, { [OWNER_HEADER]: plain.key, [NEXT_HEADER]: next }), { status: 403, data: { error: "owner" } });
});

test("a 查看链接: its key reads the ledger, and nothing else", async () => {
  const { id, key } = await make();
  await call("POST", `/ledgers/${id}/changes`, key, { changes: [expense("e1")] });
  const view = newKey();
  assert.deepEqual(await call("GET", `/ledgers/${id}`, view), { status: 403, data: { error: "key" } }, "before it is made, nothing");
  assert.deepEqual(await call("PUT", `/ledgers/${id}/view`, key, undefined, { [VIEW_HEADER]: "short" }), { status: 400, data: { error: "bad" } }, "a key that isn't one");
  assert.deepEqual(await call("PUT", `/ledgers/${id}/view`, newKey(), undefined, { [VIEW_HEADER]: view }), { status: 403, data: { error: "key" } }, "only the ledger's key makes it");
  assert.deepEqual(await call("PUT", `/ledgers/${id}/view`, key, undefined, { [VIEW_HEADER]: view }), { status: 200, data: { ok: true } }, "made");
  assert.deepEqual(await call("PUT", `/ledgers/${id}/view`, key, undefined, { [VIEW_HEADER]: view }), { status: 200, data: { ok: true } }, "made again: the same");
  const seen = await call<Snapshot>("GET", `/ledgers/${id}`, view);
  assert.ok(seen.status === 200 && seen.data.ledger.entries.length === 1 && seen.data.ledger.name === "周末", "its key reads the ledger as it stands");
  const refused = { status: 403, data: { error: "key" } };
  assert.deepEqual(
    [
      await call("GET", `/ledgers/${id}?since=0`, view),
      await call("POST", `/ledgers/${id}/changes`, view, { changes: [expense("e2")] }),
      await call("GET", `/ledgers/${id}/files`, view),
      await call("POST", `/ledgers/${id}/invites`, view, { to: "someone" }, someone()),
      await call("PUT", `/ledgers/${id}/view`, view, undefined, { [VIEW_HEADER]: newKey() }),
      await call("PUT", `/me/ledgers/${id}`, view, {}, someone()),
    ],
    Array(6).fill(refused),
    "and nothing else: no record, no changes, no files, no invitations, no other link, not kept in my ledgers",
  );
  const socket = await new Promise<string>((resolve) => {
    const ws = new WebSocket(`ws://${HOST}/split/api/ledgers/${id}/live`, [LIVE_PROTOCOL, view]);
    ws.addEventListener("open", () => resolve("open"));
    ws.addEventListener("error", () => resolve("refused"));
    ws.addEventListener("close", () => resolve("refused"));
  });
  assert.equal(socket, "refused", "no live connection");
});

test("addresses that aren't there", async () => {
  const { id, key } = await make();
  for (const [method, path] of [["GET", ""], ["GET", "/ledgers"], ["GET", "/ledgers/abc"], ["PUT", `/ledgers/${id}`], ["GET", `/ledgers/${id}/changes`], ["POST", `/ledgers/${id}/nope`], ["GET", `/ledgers/${id}/key`], ["GET", `/ledgers/${id}/lock`], ["GET", `/ledgers/${id}/live/more`], ["GET", "/other"]]) {
    assert.deepEqual(await call(method, path, key, method === "GET" ? undefined : {}), { status: 404, data: { error: "notfound" } }, `${method} ${path}`);
  }
  assert.equal((await fetch(`${API}/ledgers/${id}/live`, { headers: { [KEY_HEADER]: key } })).status, 426, "the live address is a WebSocket's");
});

const mineOf = async (session: string) => (await call<MyLedgers>("GET", "/me/ledgers", null, undefined, as(session))).data.ledgers;

/** A JPEG's first bytes, then `size` bytes in all. */
const jpeg = (size: number, fill = 7) => Uint8Array.from({ length: size }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : i === 2 ? 0xff : fill));
const pdf = (size: number) => Uint8Array.from({ length: size }, (_, i) => "%PDF-1.7".charCodeAt(i) || 32);
async function putFile(ledger: string, file: string, bytes: Uint8Array, key: string | null, more: Record<string, string> = {}, type = "image/jpeg") {
  const res = await fetch(`${API}/ledgers/${ledger}/files/${file}`, { method: "PUT", headers: { ...(key ? { [KEY_HEADER]: key } : {}), "content-type": type, ...more }, body: bytes });
  return { status: res.status, data: (await res.json()) as Stored & { error?: string } };
}
/** My files, as of `later` ms from now (by then what was just stored has settled: ledger.ts, SETTLING_MS). */
const storageOf = async (who: Record<string, string>, later = 0) => (await call<MyFiles>("GET", `/me/files${later ? `?at=${Date.now() + later}` : ""}`, null, undefined, who)).data;
const nothing = { count: 0, bytes: 0 };

test("receipt photos: stored by a signed-in phone with the key, read back as they were, charged once", async () => {
  const { id, key } = await make();
  const steve = someone();
  const photo = jpeg(1_000);
  for (const [why, got, want] of [
    ["no sign-in", await putFile(id, "f-0000001", photo, key), { status: 401, data: { error: "signin" } }],
    ["a sign-in that is nobody's", await putFile(id, "f-0000001", photo, key, as("nobody")), { status: 401, data: { error: "signin" } }],
    ["the wrong key", await putFile(id, "f-0000001", photo, newKey(), steve), { status: 403, data: { error: "key" } }],
    ["no key", await putFile(id, "f-0000001", photo, null, steve), { status: 403, data: { error: "key" } }],
    ["a ledger that isn't there", await putFile(newId(), "f-0000001", photo, key, steve), { status: 404, data: { error: "gone" } }],
    ["a page, not a photo", await putFile(id, "f-0000001", photo, key, steve, "text/html"), { status: 400, data: { error: "bad" } }],
    ["a JPEG said to be a PNG", await putFile(id, "f-0000001", photo, key, steve, "image/png"), { status: 400, data: { error: "bad" } }],
    ["nothing at all", await putFile(id, "f-0000001", new Uint8Array(), key, steve), { status: 400, data: { error: "bad" } }],
    ["bigger than FILE_MAX", await putFile(id, "f-0000001", jpeg(FILE_MAX + 1), key, steve), { status: 413, data: { error: "big" } }],
    ["an id that isn't one", await putFile(id, "a.b", photo, key, steve), { status: 404, data: { error: "notfound" } }],
  ] as const) assert.deepEqual(got, want, why);
  assert.deepEqual(await storageOf(steve), { used: 0, quota: TEST_QUOTA, unused: nothing, ledgers: [] }, "none of that was kept, or charged");

  const first = await putFile(id, "f-0000001", photo, key, steve);
  assert.equal(first.status, 201);
  assert.deepEqual([first.data.file.id, first.data.file.size, first.data.file.type, first.data.used, first.data.quota, "by" in first.data.file], ["f-0000001", 1_000, "image/jpeg", 1_000, TEST_QUOTA, false], "stored, and charged to the account that sent it");
  const again = await putFile(id, "f-0000001", jpeg(1_000, 9), key, steve);
  assert.deepEqual([again.status, again.data.file, again.data.used], [200, first.data.file, 1_000], "sent again with the same id: the file already kept, charged once");

  const read = await fetch(`${API}/ledgers/${id}/files/f-0000001`, { headers: { [KEY_HEADER]: key } });
  assert.equal(read.status, 200);
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), photo, "read back as it was sent the first time");
  assert.deepEqual(
    ["content-type", "x-content-type-options", "content-security-policy", "cache-control"].map((h) => read.headers.get(h)),
    ["image/jpeg", "nosniff", "default-src 'none'; sandbox", "private, max-age=31536000, immutable"],
    "as what it is, to be shown and never run, kept only on the phone that asked",
  );
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/f-0000001`, newKey()), { status: 403, data: { error: "key" } }, "not with the wrong key");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/f-0000001`, null), { status: 403, data: { error: "key" } }, "nor with none");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/f-nope0001`, key), { status: 404, data: { error: "gone" } }, "an id it doesn't have");

  const friend = someone();
  assert.equal((await putFile(id, "f-0000002", pdf(2_000), key, friend, "application/pdf")).status, 201, "a friend signed in stores a PDF");
  assert.deepEqual((await call<Files>("GET", `/ledgers/${id}/files`, key)).data.files.map((f) => [f.id, f.size, f.type, "by" in f]), [["f-0000001", 1_000, "image/jpeg", false], ["f-0000002", 2_000, "application/pdf", false]], "the ledger's files, the first stored first, and not whose account sent each");
  assert.deepEqual([(await storageOf(steve)).used, (await storageOf(friend)).used], [1_000, 2_000], "each charged for their own");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files`, newKey()), { status: 403, data: { error: "key" } });

  // an expense says which photos are its own: the server takes it, and a later change about the note keeps them
  const withPhoto = { ...expense("e1"), change: { do: "expense", expense: { kind: "expense", id: "e1", at: Date.now(), payer: "s", amount: 3000, note: "晚饭", split: { how: "equal", among: ["s", "w", "m"] }, rot: 0, files: ["f-0000001", "f-0000002"] } } } as Sent;
  const pushed = await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [withPhoto] });
  assert.deepEqual([pushed.data.took, pushed.data.ledger.entries[0]?.kind === "expense" && pushed.data.ledger.entries[0].files], [["new"], ["f-0000001", "f-0000002"]], "an expense with its photos");
});

test("receipt photos: taken off by anyone with the key, the room back to whoever sent them; never past the quota", async () => {
  const { id, key } = await make();
  const steve = someone();
  assert.equal((await putFile(id, "big-0001", jpeg(150_000), key, steve)).status, 201);
  assert.equal((await putFile(id, "big-0002", jpeg(140_000), key, steve)).status, 201);
  assert.deepEqual(await putFile(id, "big-0003", jpeg(10_001), key, steve), { status: 413, data: { error: "quota" } }, `${TEST_QUOTA} bytes in all: one past it is turned away`);
  assert.equal((await putFile(id, "big-0003", jpeg(10_000), key, steve)).status, 201, "up to it, taken");
  assert.deepEqual(await storageOf(steve), { used: TEST_QUOTA, quota: TEST_QUOTA, unused: nothing, ledgers: [{ id, bytes: TEST_QUOTA, count: 3, unused: nothing }] }, "(none on an expense, but all just stored: none to clear yet)");

  assert.deepEqual(await call("DELETE", `/ledgers/${id}/files/big-0001`, newKey()), { status: 403, data: { error: "key" } });
  assert.deepEqual(await call("DELETE", `/ledgers/${id}/files/big-0001`, key), { status: 200, data: { ok: true } }, "taken off by someone with the key, signed in or not");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/big-0001`, key), { status: 404, data: { error: "gone" } }, "and gone");
  assert.deepEqual(await call("DELETE", `/ledgers/${id}/files/big-0001`, key), { status: 404, data: { error: "gone" } }, "taken off twice: gone");
  assert.equal((await storageOf(steve)).used, 150_000, "its room is back to the account that sent it");
  assert.equal((await putFile(id, "big-0004", jpeg(140_000), key, steve)).status, 201, "and can be used again");
  assert.deepEqual((await call<Files>("GET", `/ledgers/${id}/files`, key)).data.files.map((f) => f.id), ["big-0002", "big-0003", "big-0004"]);
});

test("receipt photos: a locked ledger takes none and lets none go; a deleted one hands every account its room back", async () => {
  const id = newId();
  const key = newKey();
  const owner = newKey();
  const steve = someone();
  const friend = someone();
  assert.equal((await call("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three }, { [OWNER_HEADER]: owner, ...steve })).status, 201);
  assert.equal((await putFile(id, "lk-00001", jpeg(1_000), key, steve)).status, 201);
  assert.equal((await putFile(id, "lk-00002", jpeg(2_000), key, friend)).status, 201);
  assert.equal((await call("POST", `/ledgers/${id}/lock`, null, { locked: true }, { [OWNER_HEADER]: owner })).status, 200);
  assert.deepEqual(await putFile(id, "lk-00003", jpeg(1_000), key, steve), { status: 423, data: { error: "locked" } }, "locked: no new photo");
  assert.deepEqual(await call("DELETE", `/ledgers/${id}/files/lk-00001`, key), { status: 423, data: { error: "locked" } }, "nor one taken off");
  assert.equal((await fetch(`${API}/ledgers/${id}/files/lk-00001`, { headers: { [KEY_HEADER]: key } })).status, 200, "but they can still be seen");
  assert.equal((await putFile(id, "lk-00001", jpeg(1_000), key, steve)).status, 200, "and one stored already, sent again, hears it is there");

  assert.deepEqual(await call("DELETE", `/ledgers/${id}`, null, undefined, { [OWNER_HEADER]: owner }), { status: 200, data: { ok: true } }, "the owner deletes the ledger");
  assert.deepEqual([await storageOf(steve), await storageOf(friend)], [{ used: 0, quota: TEST_QUOTA, unused: nothing, ledgers: [] }, { used: 0, quota: TEST_QUOTA, unused: nothing, ledgers: [] }], "every account that sent it photos has its room back");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/lk-00001`, key), { status: 404, data: { error: "gone" } });
  assert.deepEqual(await call("GET", "/me/files", null), { status: 401, data: { error: "signin" } }, "my files need a sign-in");
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The Expense change for an expense with these photos. */
const withFiles = (entry: string, files: string[]): Sent => ({ ...expense(entry), change: { do: "expense", expense: { kind: "expense", id: entry, at: Date.now(), payer: "s", amount: 3000, note: "晚饭", split: { how: "equal", among: ["s", "w", "m"] }, rot: 0, files } } }) as Sent;
const editFiles = (entry: string, files: string[] | null): Sent => ({ id: `c${++n}-${randomUUID()}`, at: Date.now(), change: { do: "edit", entry, to: { payer: "s", amount: 3000, note: "晚饭", split: { how: "equal", among: ["s", "w", "m"] }, files } } });
const listed = async (id: string, key: string) => (await call<Files>("GET", `/ledgers/${id}/files`, key)).data.files.map((f) => f.id);
const inBucket = async (id: string, key: string, file: string) => (await fetch(`${API}/ledgers/${id}/files/${file}`, { headers: { [KEY_HEADER]: key } })).status;
/** The account a "test-account-…" sign-in is (tests/accounts.ts). */
const accountIn = (who: Record<string, string>) => who.authorization.replace("Bearer test-account-", "");

test("receipt photos no expense uses: counted on my files once settled, cleared now, the room back", async () => {
  const { id, key } = await make();
  const steve = someone();
  const friend = someone();
  for (const [f, size, who] of [["on-0001", 1_000, steve], ["off-0001", 2_000, steve], ["loose-001", 3_000, steve], ["theirs-01", 4_000, friend]] as const) assert.equal((await putFile(id, f, jpeg(size), key, who)).status, 201);
  assert.equal((await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [withFiles("e1", ["on-0001", "off-0001", "theirs-01"])] })).status, 200);
  assert.deepEqual(await storageOf(steve), { used: 6_000, quota: TEST_QUOTA, unused: nothing, ledgers: [{ id, count: 3, bytes: 6_000, unused: nothing }] }, "just stored: the one on no expense may be on its way onto one, so none to clear");
  assert.deepEqual((await storageOf(steve, 2 * HOUR)).unused, { count: 1, bytes: 3_000 }, "two hours on: the one on no expense");
  assert.equal((await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [editFiles("e1", ["on-0001", "theirs-01"])] })).status, 200, "one taken off the expense");
  const later = await storageOf(steve, 2 * HOUR);
  assert.deepEqual([later.unused, later.ledgers[0]?.unused], [{ count: 2, bytes: 5_000 }, { count: 2, bytes: 5_000 }], "now two of steve's, in all and in that ledger");
  assert.deepEqual((await storageOf(friend, 2 * HOUR)).unused, nothing, "the friend's is on the expense");

  assert.deepEqual(await call("DELETE", "/me/files/unused", null), { status: 401, data: { error: "signin" } }, "clearing needs a sign-in");
  assert.deepEqual(await call("GET", "/me/files/unused", null, undefined, steve), { status: 404, data: { error: "notfound" } });
  const cleared = await call<MyFiles>("DELETE", `/me/files/unused?at=${Date.now() + 2 * HOUR}`, null, undefined, steve);
  assert.deepEqual([cleared.status, cleared.data.used, cleared.data.unused], [200, 1_000, nothing], "cleared: the two go, and the room with them");
  assert.deepEqual(await listed(id, key), ["on-0001", "theirs-01"], "off the ledger's list");
  assert.deepEqual([await inBucket(id, key, "off-0001"), await inBucket(id, key, "loose-001"), await inBucket(id, key, "on-0001")], [404, 404, 200], "not to be had; the one on the expense is");
  assert.equal((await call<{ swept: number }>("POST", "/test/night", null, { ledger: id, at: Date.now() + 2 * HOUR })).data.swept, 0, "and out of the bucket: the night finds nothing of them there");
  assert.equal((await storageOf(friend)).used, 4_000, "the friend's room as it was");
  assert.equal((await call<MyFiles>("DELETE", `/me/files/unused?at=${Date.now() + 2 * HOUR}`, null, undefined, steve)).data.used, 1_000, "twice is once");
});

test("the nightly check: a photo no expense has used for thirty days goes; so does what the bucket has and no ledger lists", async () => {
  const { id, key } = await make();
  const steve = someone();
  for (const f of ["used-0001", "gone-0001", "none-0001"]) assert.equal((await putFile(id, f, jpeg(1_000), key, steve)).status, 201);
  assert.equal((await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [withFiles("e1", ["used-0001"]), withFiles("e2", ["gone-0001"])] })).status, 200);
  assert.equal((await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [{ id: `c${++n}-${randomUUID()}`, at: Date.now(), change: { do: "out", entry: "e2", at: Date.now() } }] })).status, 200, "the expense with the second photo deleted");
  assert.deepEqual(await call("POST", "/test/loose", null, { ledger: id, file: "stray-001" }), { status: 200, data: { ok: true } }, "(and a file in the bucket the ledger doesn't list: a put whose list went wrong)");
  const night = async (later: number) => (await call<{ gone: number; swept: number; left: number }>("POST", "/test/night", null, { ledger: id, at: Date.now() + later })).data;
  assert.deepEqual(await night(2 * HOUR), { gone: 0, swept: 1, left: 3 }, "tonight: none of the ledger's go; the stray one does");
  assert.equal(await inBucket(id, key, "stray-001"), 404);
  assert.deepEqual(await night(5 * DAY), { gone: 0, swept: 0, left: 3 }, "five days on: nothing yet (改回去 and 恢复 can still bring them back)");
  assert.deepEqual(await night(31 * DAY), { gone: 2, swept: 0, left: 1 }, "thirty-one days on: the deleted expense's photo, and the one on no expense, go");
  assert.deepEqual(await listed(id, key), ["used-0001"]);
  assert.deepEqual([await inBucket(id, key, "gone-0001"), await inBucket(id, key, "none-0001"), await inBucket(id, key, "used-0001")], [404, 404, 200], "out of the bucket; the one on an expense stays");
  assert.equal((await storageOf(steve)).used, 1_000, "and their sender has the room back");
});

test("the nightly check of an account: charged for what the ledgers keep, no more and no less", async () => {
  const { id, key } = await make();
  const steve = someone();
  const account = accountIn(steve);
  assert.equal((await putFile(id, "real-0001", jpeg(1_000), key, steve)).status, 201);
  assert.equal((await call("POST", "/test/charge", null, { ledger: id, file: "phantom1", account })).status, 200, "(charged for a file no ledger keeps: a room given back that went wrong)");
  assert.equal((await storageOf(steve)).used, 2_234, "charged for both");
  assert.deepEqual(await call("POST", "/test/night", null, { account }), { status: 200, data: { used: 1_000 } }, "its night: only what the ledger keeps");
  assert.deepEqual((await storageOf(steve)).ledgers, [{ id, count: 1, bytes: 1_000, unused: nothing }]);
  const gone = newId();
  assert.equal((await call("POST", "/test/charge", null, { ledger: gone, file: "phantom2", account })).status, 200, "(and for a file in a ledger that isn't there)");
  assert.deepEqual((await storageOf(steve)).used, 1_000, "my files leave a ledger that isn't there out, and its room is back");
});

test("an account deleted: the rooms server tells this one, and every photo it sent goes, from every ledger; nothing is kept for it", async () => {
  const one = await make();
  const two = await make();
  const steve = someone();
  const friend = someone();
  assert.equal((await call("PUT", `/me/ledgers/${one.id}`, one.key, {}, steve)).status, 200, "(steve keeps a ledger in his list)");
  for (const [l, f, who] of [[one, "s-0000001", steve], [one, "s-0000002", steve], [two, "s-0000003", steve], [one, "f-0000001", friend]] as const) assert.equal((await putFile(l.id, f, jpeg(1_000), l.key, who)).status, 201);
  assert.equal((await call<Pushed>("POST", `/ledgers/${one.id}/changes`, one.key, { changes: [withFiles("e1", ["s-0000001", "f-0000001"])] })).status, 200);
  assert.deepEqual(await call("POST", "/test/account-gone", null, undefined, steve), { status: 200, data: { files: 3, left: 0 } }, "the rooms server says steve's account is deleted (its stand-in, through its binding to Internal, as the real one does)");
  assert.deepEqual([await listed(one.id, one.key), await listed(two.id, two.key)], [["f-0000001"], []], "his photos are off both ledgers, on an expense or not");
  for (const [l, f] of [[one, "s-0000001"], [one, "s-0000002"], [two, "s-0000003"]] as const) assert.equal(await inBucket(l.id, l.key, f), 404, `${f} not to be had`);
  for (const l of [one, two]) assert.equal((await call<{ swept: number }>("POST", "/test/night", null, { ledger: l.id, at: Date.now() + 2 * HOUR })).data.swept, 0, "and out of the bucket: the night finds nothing of them there");
  assert.equal(await inBucket(one.id, one.key, "f-0000001"), 200, "the friend's stays");
  const [e1] = (await call<Snapshot>("GET", `/ledgers/${one.id}`, one.key)).data.ledger.entries;
  assert.equal(e1?.kind === "expense" ? e1.files?.join() : "", "s-0000001,f-0000001", "the expense is as it was (his photo shows as gone)");
  assert.deepEqual([await storageOf(steve), (await call<MyLedgers>("GET", "/me/ledgers", null, undefined, steve)).data.ledgers], [{ used: 0, quota: TEST_QUOTA, unused: nothing, ledgers: [] }, []], "nothing kept for him: no room used, no ledgers");
  assert.equal((await storageOf(friend)).used, 1_000, "the friend's room as it was");
  assert.deepEqual(await call("POST", "/test/account-gone", null, undefined, steve), { status: 200, data: { files: 0, left: 0 } }, "told twice: nothing more to do");
});

test("signed in, a ledger made is kept in the account's list, keys and all", async () => {
  const id = newId();
  const key = newKey();
  const owner = newKey();
  const ledger = { id, name: "周末", currency: "CAD", members: three };
  assert.deepEqual(await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: owner, ...as(SESSION.nobody) }), { status: 401, data: { error: "signin" } }, "a sign-in that is nobody's makes nothing");
  assert.deepEqual(await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: owner, ...as(SESSION.down) }), { status: 503, data: { error: "down" } }, "nor does one the rooms server can't answer for now");
  assert.deepEqual(await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: owner, authorization: "Bearer x" }), { status: 401, data: { error: "signin" } }, "nor what isn't a sign-in");
  assert.equal((await call("GET", `/ledgers/${id}`, key)).status, 404, "(none of them made it)");

  const before = (await mineOf(SESSION.steve)).length;
  assert.equal((await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: owner, ...as(SESSION.steve) })).status, 201);
  const mine = await mineOf(SESSION.steve);
  assert.equal(mine.length, before + 1);
  assert.deepEqual({ ...mine[0], at: 0 }, { id, key, owner, at: 0 }, "the last one made is first, with its key and the owner's key");
  assert.equal((await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: owner, ...as(SESSION.steve) })).status, 200, "asked for again: the same ledger");
  assert.equal((await mineOf(SESSION.steve)).length, before + 1, "and still once in the list");
  assert.ok(!(await mineOf(SESSION.wang)).some((m) => m.id === id), "another account's list doesn't have it");
  assert.equal((await call("POST", "/ledgers", key, ledger, { [OWNER_HEADER]: newKey(), ...as(SESSION.wang) })).status, 200, "asked for by another account with the key and some other owner's key");
  assert.deepEqual(Object.keys((await mineOf(SESSION.wang)).find((m) => m.id === id) ?? {}).sort(), ["at", "id", "key"], "that account keeps the key, and not an owner's key that isn't the owner's");

  for (const [session, want] of [[null, { status: 401, data: { error: "signin" } }], [SESSION.nobody, { status: 401, data: { error: "signin" } }], [SESSION.down, { status: 503, data: { error: "down" } }]] as const) {
    assert.deepEqual(await call("GET", "/me/ledgers", null, undefined, session ? as(session) : {}), want, `my ledgers asked by ${session ?? "nobody signed in"}`);
  }
  const unsigned = { ...ledger, id: newId() };
  const unsignedKey = newKey();
  assert.deepEqual(await call("POST", "/ledgers", unsignedKey, unsigned), { status: 401, data: { error: "signin" } }, "not signed in, no ledger is made");
  assert.equal((await call("GET", `/ledgers/${unsigned.id}`, unsignedKey)).status, 404, "(it wasn't)");
  assert.equal((await call("POST", "/ledgers", key, ledger)).status, 200, "a ledger already made, asked for again with its key, needs no sign-in: nothing new is made");
});

test("a ledger joined is kept in the account's list when its key opens it", async () => {
  const { id, key } = await make();
  const at = `/me/ledgers/${id}`;
  const wang = as(SESSION.wang);
  assert.deepEqual(await call("PUT", at, newKey(), { me: "w" }, wang), { status: 403, data: { error: "key" } }, "not with a key that doesn't open it");
  assert.deepEqual(await call("PUT", `/me/ledgers/${newId()}`, key, { me: "w" }, wang), { status: 404, data: { error: "gone" } }, "nor one that isn't there");
  assert.deepEqual(await call("PUT", at, null, { me: "w" }, wang), { status: 400, data: { error: "bad" } }, "nor with no key");
  assert.deepEqual(await call("PUT", at, key, { me: "w" }, { ...wang, [OWNER_HEADER]: newKey() }), { status: 403, data: { error: "owner" } }, "nor with an owner's key that isn't its owner's");
  assert.deepEqual(await call("PUT", at, key, { me: "w" }), { status: 401, data: { error: "signin" } }, "nor signed in to nobody");
  assert.ok(!(await mineOf(SESSION.wang)).some((m) => m.id === id), "(none of them kept it)");

  const kept = await call<MineBody>("PUT", at, key, { me: "w" }, wang);
  assert.deepEqual([kept.status, { ...kept.data.mine, at: 0 }], [200, { id, key, me: "w", at: 0 }], "kept, with who they are in it");
  assert.deepEqual({ ...(await mineOf(SESSION.wang)).find((m) => m.id === id), at: 0 }, { id, key, me: "w", at: 0 });
  assert.deepEqual({ ...(await call<MineBody>("PUT", at, key, { me: "nobody-in-it" }, wang)).data.mine, at: 0 }, { id, key, at: 0 }, "someone who isn't in it is forgotten");
  assert.equal((await call<MineBody>("PUT", at, key, {}, wang)).data.mine.me, undefined);
  assert.equal((await call<MineBody>("PUT", at, key, { me: "m" }, wang)).data.mine.me, "m");
  assert.equal((await call<MineBody>("PUT", at, key, undefined, wang)).data.mine.me, "m", "saying nothing of who they are keeps it");

  assert.deepEqual(await call("DELETE", at, null, undefined, wang), { status: 200, data: { ok: true } }, "taken off the list");
  assert.ok(!(await mineOf(SESSION.wang)).some((m) => m.id === id));
  assert.equal((await call("GET", `/ledgers/${id}`, key)).status, 200, "the ledger itself is still there");
  assert.deepEqual(await call("DELETE", at, null, undefined, wang), { status: 200, data: { ok: true } }, "twice is once");
});

test("an account starts at most ten ledgers a day", async () => {
  const someone = as(`test-account-${randomUUID().replaceAll("-", "").slice(0, 12)}`);
  for (let i = 0; i < 10; i++) assert.equal((await call("POST", "/ledgers", newKey(), { id: newId(), name: "周末", currency: "CAD", members: three }, someone)).status, 201, `the ${i + 1}th`);
  const eleventh = { id: newId(), name: "周末", currency: "CAD", members: three };
  const key = newKey();
  assert.deepEqual(await call("POST", "/ledgers", key, eleventh, someone), { status: 429, data: { error: "limit" } }, "an eleventh, no");
  assert.equal((await call("GET", `/ledgers/${eleventh.id}`, key)).status, 404, "(it wasn't made)");
  assert.equal((await call("POST", "/ledgers", key, eleventh, as(SESSION.wang))).status, 201, "another account, yes");
});

/** Two (or more) accounts of a test's own that are friends on changle.ca: the stand-in makes friends of names that start the same up to an "_" (tests/accounts.ts). */
const circle = (...names: string[]) => {
  const tag = `c${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  return names.map((name) => ({ id: `${tag}_${name}`, headers: as(`test-account-${tag}_${name}`) }));
};
const invitesOf = async (headers: Record<string, string>) => (await call<MyInvites>("GET", "/me/invites", null, undefined, headers)).data.invites;
const inviting = (id: string, key: string, body: unknown, headers: Record<string, string>) => call<InviteSent>("POST", `/ledgers/${id}/invites`, key, body, headers);

test("inviting a friend on changle.ca: it waits in their account until they keep the ledger, or say no", async () => {
  const { id, key } = await make();
  // (Steve and 小王 are friends: tests/accounts.ts)
  const steve = as(SESSION.steve);
  const wang = as(SESSION.wang);
  const before = await invitesOf(wang);
  assert.deepEqual(await inviting(id, key, { to: "uwang00000001", member: "w" }, steve), { status: 201, data: { invite: "sent" } }, "anyone with the key, signed in, invites a friend");
  const waiting = (await invitesOf(wang)).filter((i) => !before.some((b) => b.ledger === i.ledger));
  assert.deepEqual(
    waiting.map((i) => ({ ...i, at: 0 })),
    [{ ledger: id, key, name: "周末", from: { id: "usteve0000001", name: "Steve", av: 0 }, member: "w", at: 0 }],
    "it waits in the friend's account: the ledger, the key, its name, who sent it (as changle.ca names them), and the person in it they are",
  );
  assert.ok(Math.abs(waiting[0].at - Date.now()) < 60_000, "and when");
  assert.deepEqual(await inviting(id, key, { to: "uwang00000001" }, steve), { status: 200, data: { invite: "again" } }, "the same one again: nothing new");

  assert.equal((await call("PUT", `/me/ledgers/${id}`, key, { me: "w" }, wang)).status, 200, "小王 keeps the ledger (joined)");
  assert.ok(!(await invitesOf(wang)).some((i) => i.ledger === id), "and the invitation is used up");
  assert.deepEqual(await inviting(id, key, { to: "uwang00000001" }, steve), { status: 200, data: { invite: "in" } }, "inviting someone to a ledger of theirs: nothing new");

  const [amy, ben] = circle("Amy", "Ben");
  assert.deepEqual(await inviting(id, key, { to: ben.id, member: "nobody" }, amy.headers), { status: 201, data: { invite: "sent" } });
  assert.deepEqual(
    (await invitesOf(ben.headers)).map((i) => [i.ledger, i.from.name, i.member ?? null]),
    [[id, "Amy", null]],
    "a person who isn't in the ledger isn't said",
  );
  assert.deepEqual(await call("DELETE", `/me/invites/${id}`, null, undefined, ben.headers), { status: 200, data: { ok: true } }, "Ben says no");
  assert.deepEqual(await invitesOf(ben.headers), [], "and it is gone");
  assert.deepEqual(await call("DELETE", `/me/invites/${id}`, null, undefined, ben.headers), { status: 200, data: { ok: true } }, "twice is once");
});

test("who may invite whom: signed in, with the key, a friend, to a ledger that takes people", async () => {
  const { id, key } = await make();
  const [amy, ben] = circle("Amy", "Ben");
  const [stranger] = circle("Cal");
  const to = { to: ben.id };
  assert.deepEqual(await inviting(id, key, to, {}), { status: 401, data: { error: "signin" } }, "signed out, no");
  assert.deepEqual(await inviting(id, key, to, as(SESSION.nobody)), { status: 401, data: { error: "signin" } }, "a sign-in that is nobody's, no");
  assert.deepEqual(await inviting(id, key, to, as(SESSION.down)), { status: 503, data: { error: "down" } }, "the rooms server can't say whose it is: not now");
  assert.deepEqual(await inviting(id, newKey(), to, amy.headers), { status: 403, data: { error: "key" } }, "without the key, no");
  assert.deepEqual(await inviting(newId(), key, to, amy.headers), { status: 404, data: { error: "gone" } }, "no such ledger");
  assert.deepEqual(await inviting(id, key, { to: stranger.id }, amy.headers), { status: 403, data: { error: "friends" } }, "someone who isn't a friend, no");
  assert.deepEqual(await inviting(id, key, { to: STRANGER }, amy.headers), { status: 403, data: { error: "friends" } }, "someone changle.ca has never heard of, no");
  assert.deepEqual(await invitesOf(stranger.headers), [], "(nothing waits for them)");
  for (const bad of [{}, { to: amy.id }, { to: "not an id!" }, { to: 7 }, { to: ben.id, member: "?" }, "{not json"])
    assert.deepEqual(await inviting(id, key, bad, amy.headers), { status: 400, data: { error: "bad" } }, `not an invitation: ${JSON.stringify(bad)}`);

  const owner = newKey();
  const lockedId = newId();
  const lockedKey = newKey();
  assert.equal((await call("POST", "/ledgers", lockedKey, { id: lockedId, name: "锁了", currency: "CAD", members: three }, { [OWNER_HEADER]: owner, ...someone() })).status, 201);
  assert.equal((await call("POST", `/ledgers/${lockedId}/lock`, null, { locked: true }, { [OWNER_HEADER]: owner })).status, 200);
  assert.deepEqual(await inviting(lockedId, lockedKey, to, amy.headers), { status: 423, data: { error: "locked" } }, "a locked ledger takes nobody new");

  assert.deepEqual(await call("GET", "/me/invites", null), { status: 401, data: { error: "signin" } }, "my invitations: signed in only");
  assert.deepEqual(await call("POST", "/me/invites", null, {}, ben.headers), { status: 404, data: { error: "notfound" } });
  assert.deepEqual(await call("DELETE", "/me/invites/no!", null, undefined, ben.headers), { status: 404, data: { error: "notfound" } });
});

test("an account sends at most fifty invitations a day", async () => {
  const { id, key } = await make();
  const [amy, ...friends] = circle("Amy", ...Array.from({ length: 51 }, (_, i) => `F${i}`));
  for (let i = 0; i < 50; i++) assert.equal((await inviting(id, key, { to: friends[i].id }, amy.headers)).status, 201, `the ${i + 1}th`);
  assert.deepEqual(await inviting(id, key, { to: friends[50].id }, amy.headers), { status: 429, data: { error: "limit" } }, "a fifty-first, no");
  assert.deepEqual(await invitesOf(friends[50].headers), [], "(it didn't go)");
  const [ben, cal] = circle("Ben", "Cal");
  assert.equal((await inviting(id, key, { to: cal.id }, ben.headers)).status, 201, "another account, yes");
});

/** A photo whose bytes say what the stand-in for Google reads off it ("receipt:42.50 CAD Café"). */
const saying = (text: string) => Uint8Array.from([0xff, 0xd8, 0xff, ...new TextEncoder().encode(` ${text}`)]);
const reading = (ledger: string, file: string, key: string | null, headers: Record<string, string>) => call<ReadReply>("POST", `/ledgers/${ledger}/files/${file}/read`, key, undefined, headers);

test("reading a receipt: signed in, with the key, a file of the ledger's; so many a day, and not past the month's budget", async () => {
  const { id, key } = await make();
  const [amy, ben, cal] = circle("Amy", "Ben", "Cal");
  const lunch = newId();
  assert.equal((await putFile(id, lunch, saying("receipt:42.50 CAD Tim Hortons"), key, amy.headers)).status, 201);
  assert.deepEqual(await reading(id, lunch, key, amy.headers), { status: 200, data: { read: { total: "42.50", currency: "CAD", merchant: "Tim Hortons", tip: null, tax: null, date: null, place: null, payment: null } } }, "read: the total, its currency, the shop (no tip, tax or day on it)");
  const dinner = newId();
  assert.equal((await putFile(id, dinner, saying("receipt:123.00 CAD Joe's Diner tip=18.00 tax=5.25 date=2026-11-12"), key, amy.headers)).status, 201);
  assert.deepEqual(await reading(id, dinner, key, amy.headers), { status: 200, data: { read: { total: "123.00", currency: "CAD", merchant: "Joe's Diner", tip: "18.00", tax: "5.25", date: "2026-11-12", place: null, payment: null } } }, "and the tip and tax in the total, and the day, when it has them");
  const blank = newId();
  assert.equal((await putFile(id, blank, saying("receipt:none"), key, amy.headers)).status, 201);
  assert.deepEqual(await reading(id, blank, key, ben.headers), { status: 200, data: { read: null } }, "nothing to read on it: said as nothing (and anyone in the ledger may ask, not only who sent it)");

  assert.deepEqual(await reading(id, lunch, key, {}), { status: 401, data: { error: "signin" } }, "signed out, no");
  assert.deepEqual(await reading(id, lunch, newKey(), amy.headers), { status: 403, data: { error: "key" } }, "without the key, no");
  assert.deepEqual(await reading(id, newId(), key, amy.headers), { status: 404, data: { error: "gone" } }, "a file the ledger doesn't have");
  assert.deepEqual(await reading(newId(), lunch, key, amy.headers), { status: 404, data: { error: "gone" } }, "a ledger there isn't");
  assert.deepEqual(await call("GET", `/ledgers/${id}/files/${lunch}/read`, key, undefined, amy.headers), { status: 404, data: { error: "notfound" } }, "asked any other way, no such address");
  assert.deepEqual(await call("POST", `/ledgers/${id}/files/${lunch}/look`, key, undefined, amy.headers), { status: 404, data: { error: "notfound" } });

  // so many a day for an account (three read above: Amy two, Ben one)
  for (let i = 2; i < 30; i++) assert.equal((await reading(id, lunch, key, amy.headers)).status, 200, `Amy's ${i + 1}th`);
  assert.deepEqual(await reading(id, lunch, key, amy.headers), { status: 429, data: { error: "limit" } }, "a thirty-first today, no");
  // and the month's budget for the whole site: 31 readings so far (all of Amy's 30, Ben's one), 12,400 of 20,000; nineteen more spend it
  for (let i = 0; i < 19; i++) assert.equal((await reading(id, lunch, key, i < 15 ? ben.headers : cal.headers)).status, 200, `the ${32 + i}th this month`);
  assert.deepEqual(await reading(id, lunch, key, cal.headers), { status: 429, data: { error: "budget" } }, "the month's money spent: nothing more is read, for anyone");
});

test("an expense's tip and tax: kept, and what an edit does with them", async () => {
  const { id, key } = await make();
  const at = Date.now();
  const dinner = { kind: "expense", id: "e1", at, payer: "s", amount: 12300, note: "晚饭", split: { how: "equal", among: ["s", "w", "m"] }, rot: 0 };
  const said = { payer: "s", amount: 12300, note: "晚饭", split: dinner.split };
  const push = (change: unknown) => call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [{ id: `c${++n}-${randomUUID()}`, at: Date.now(), change }] });
  const first = async () => (await call<Snapshot>("GET", `/ledgers/${id}`, key)).data.ledger.entries[0] as Record<string, unknown>;
  assert.deepEqual((await push({ do: "expense", expense: { ...dinner, tip: 1800, tax: 525 } })).data.took, ["new"]);
  assert.deepEqual([(await first()).tip, (await first()).tax], [1800, 525], "recorded with them, and served with them");
  assert.deepEqual((await push({ do: "edit", entry: "e1", to: { ...said, note: "晚饭和酒" } })).data.took, ["new"]);
  assert.deepEqual([(await first()).tip, (await first()).tax], [1800, 525], "an edit that doesn't mention them, what was paid the same: they stay");
  assert.deepEqual((await push({ do: "edit", entry: "e1", to: { ...said, note: "晚饭和酒", tip: 99999 } })).data.took, ["nothing"], "one with a tip bigger than what was paid: nothing");
  assert.deepEqual((await push({ do: "edit", entry: "e1", to: { ...said, note: "晚饭和酒", tip: null } })).data.took, ["new"]);
  const after = await first();
  assert.deepEqual(["tip" in after, after.tax], [false, 525], "one that says there is no tip: it goes, and the tax stays");
  assert.deepEqual((await push({ do: "expense", expense: { ...dinner, id: "e2", tip: 10000, tax: 3000 } })).data.took, ["nothing"], "an expense whose tip and tax come to more than it: not recorded");
  // and the day it was spent
  assert.deepEqual((await push({ do: "expense", expense: { ...dinner, id: "e3", date: "2026-11-12" } })).data.took, ["new"]);
  const third = async () => (await call<Snapshot>("GET", `/ledgers/${id}`, key)).data.ledger.entries.find((e) => e.id === "e3") as Record<string, unknown>;
  assert.equal((await third()).date, "2026-11-12", "recorded with the day it was spent, and served with it");
  assert.equal((await push({ do: "edit", entry: "e3", to: { ...said, date: "2026-02-30" } })).status, 400, "an edit to a day the calendar hasn't: not even read as a change");
  assert.deepEqual((await push({ do: "edit", entry: "e3", to: { ...said, note: "晚饭和茶" } })).data.took, ["new"]);
  assert.equal((await third()).date, "2026-11-12", "an edit that doesn't mention it leaves it");
  assert.deepEqual((await push({ do: "edit", entry: "e3", to: { ...said, date: "2026-11-13" } })).data.took, ["new"]);
  assert.equal((await third()).date, "2026-11-13", "one that says another day changes it");
  // and where it was bought and how it was paid
  const shop = { merchant: "McDonald's", place: "Aldergrove, BC", payment: "Mastercard" };
  assert.deepEqual((await push({ do: "expense", expense: { ...dinner, id: "e4", ...shop } })).data.took, ["new"]);
  const fourth = async () => (({ merchant, place, payment }) => ({ merchant, place, payment }))((await call<Snapshot>("GET", `/ledgers/${id}`, key)).data.ledger.entries.find((e) => e.id === "e4") as Record<string, unknown>);
  assert.deepEqual(await fourth(), shop, "recorded with its business, place and what paid, and served with them");
  assert.deepEqual((await push({ do: "edit", entry: "e4", to: { ...said, note: "晚饭和茶" } })).data.took, ["new"]);
  assert.deepEqual(await fourth(), shop, "an edit that doesn't mention them leaves them");
  assert.deepEqual((await push({ do: "edit", entry: "e4", to: { ...said, place: "Langley, BC", payment: null } })).data.took, ["new"]);
  assert.deepEqual(await fourth(), { ...shop, place: "Langley, BC", payment: undefined }, "one that says another place changes it, and null takes what paid off");
  assert.equal((await push({ do: "edit", entry: "e4", to: { ...said, merchant: 5 } })).status, 400, "a number for a name: not even read as a change");
});

test("the owner deletes a ledger: gone for everyone, and off the owner's list", async () => {
  const id = newId();
  const key = newKey();
  const owner = newKey();
  assert.equal((await call("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three }, { [OWNER_HEADER]: owner, ...as(SESSION.steve) })).status, 201);
  assert.equal((await call<Pushed>("POST", `/ledgers/${id}/changes`, key, { changes: [expense("e1")] })).status, 200);
  assert.equal((await call("PUT", `/me/ledgers/${id}`, key, { me: "w" }, as(SESSION.wang))).status, 200, "(a friend keeps it too)");
  const ws = new WebSocket(`ws://${HOST}/split/api/ledgers/${id}/live`, [LIVE_PROTOCOL, key]);
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  await new Promise((resolve) => ws.addEventListener("message", resolve, { once: true }));

  for (const who of [{ [KEY_HEADER]: key }, { [OWNER_HEADER]: key }, { [OWNER_HEADER]: newKey() }, {}] as Record<string, string>[]) {
    assert.deepEqual(await call("DELETE", `/ledgers/${id}`, null, undefined, who), { status: 403, data: { error: "owner" } }, "only the owner's key deletes it");
  }
  assert.deepEqual(await call("DELETE", `/ledgers/${newId()}`, null, undefined, { [OWNER_HEADER]: owner }), { status: 404, data: { error: "gone" } });
  assert.deepEqual(await call("DELETE", `/ledgers/${id}`, null, undefined, { [OWNER_HEADER]: owner, ...as(SESSION.steve) }), { status: 200, data: { ok: true } }, "the owner deletes it");
  assert.equal(await closed, 4404, "the phone that was listening is let go");
  assert.deepEqual(await call("GET", `/ledgers/${id}`, key), { status: 404, data: { error: "gone" } }, "it is gone");
  assert.deepEqual(await call("POST", `/ledgers/${id}/changes`, key, { changes: [expense("e2")] }), { status: 404, data: { error: "gone" } });
  assert.deepEqual(await call("GET", `/ledgers/${id}?since=0`, key), { status: 404, data: { error: "gone" } }, "its record too");
  assert.deepEqual(await call("DELETE", `/ledgers/${id}`, null, undefined, { [OWNER_HEADER]: owner }), { status: 404, data: { error: "gone" } }, "deleted twice: gone");
  assert.deepEqual(await call("POST", "/ledgers", key, { id, name: "周末", currency: "CAD", members: three }, { [OWNER_HEADER]: owner, ...someone() }), { status: 404, data: { error: "gone" } }, "its id isn't made into another ledger");
  assert.ok(!(await mineOf(SESSION.steve)).some((m) => m.id === id), "it is off its owner's list");
  assert.deepEqual(await call("PUT", `/me/ledgers/${id}`, key, {}, as(SESSION.wang)), { status: 404, data: { error: "gone" } }, "and can't be kept again by anyone");
});
