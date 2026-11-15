// 两清 · All Square: the server. One Worker answering changle.ca/split/api and nothing else (the
// pages at changle.ca/split are the main site's own, site/src/split). What is said on each address
// is in src/room/protocol.ts.
//
// Each ledger is one Durable Object (LedgerDO) with its own small SQLite database: the ledger, the
// fingerprints of the key that opens it and of its owner's key, the id of every change it has been
// sent, and the record of the ones that counted. It takes changes one request at a time, so two
// phones recording at once can't cross, and it tells every phone that is listening.
//
// Each changle.ca account that has signed in here has one too (AccountDO): its ledgers, with their
// keys (src/room/account.ts), and the room its files use. Who is signed in, the rooms server says
// (src/server/who.ts).
//
// Receipt photos and files are in the private bucket split-files (FILES), each at
// "<ledger>/<file>". The Worker puts them there and reads them back; the ledger keeps the list, and
// the sender's account is charged for each before it goes in. Every night (an alarm on each ledger
// with files, and on each account with files: src/room/nightly.ts) a ledger lets go of files no
// expense has used for 30 days, and anything in the bucket it doesn't keep; an account makes what it
// is charged what the ledgers keep. When a changle.ca account is deleted, the rooms server says so
// through `Internal`, and its files go.
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type { Ledger } from "../../../../site/src/split/core";
import { AccountRoom, INVITES_PER_DAY, STARTS_PER_DAY, type AccountFile, type AccountStore, type Invite, type Invited, type Kept, type Mine, type Reserved, type Storage } from "../room/account";
import { ID_RE, LedgerRoom, SETTLING_MS, type Count, type ErrorCode, type Fail, type FileInfo, type Logged, type Meta, type Store, type StoredFile, type Usage } from "../room/ledger";
import { nextNight } from "../room/nightly";
import {
  ACCOUNT_RE,
  FILE_MAX,
  FILE_TYPES,
  KEY_HEADER,
  KEY_RE,
  LIVE_PROTOCOL,
  MEMBER_RE,
  NEXT_HEADER,
  OWNER_HEADER,
  QUOTA,
  type ApiError,
  type Files,
  type InviteSent,
  type MineBody,
  type MyFiles,
  type MyInvites,
  type MyLedgers,
  type Push,
  type Pushed,
  type Since,
  type Snapshot,
  type Stored,
} from "../room/protocol";
import { friendOf, sessionOf, sha256, whoIs, type Who } from "./who";

export interface Env {
  LEDGERS: DurableObjectNamespace<LedgerDO>;
  GATES: DurableObjectNamespace<GateDO>;
  ACCOUNTS: DurableObjectNamespace<AccountDO>;
  /** the rooms server (site/worker), which says whose a sign-in is */
  ROOMS: Fetcher;
  /** receipt photos (stage three): the private bucket split-files, read and written only here */
  FILES: R2Bucket;
  /** local runs and tests only: "1" lifts the daily allowance of new ledgers per network (not per account) */
  ALLOW_TEST_SETTINGS?: string;
  /** with ALLOW_TEST_SETTINGS only: an account's room for files, in bytes, smaller than QUOTA, for the tests to fill */
  TEST_QUOTA?: string;
}

const BASE = "/split/api";
/** Ledgers one network may make in a day. (One account may start STARTS_PER_DAY, src/room/account.ts.) */
const MAKES_PER_DAY = 10;
/** The longest request read: 500 changes fit several times over. */
const BODY_MAX = 400_000;
/** How the Worker hands the Durable Object the fingerprint of a live connection's key. Set here only, never taken from a phone. */
const HASH_HEADER = "x-split-key-hash";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const refuse = (error: ApiError["error"], status: number) => json({ error } satisfies ApiError, status);
const STATUS: Record<ErrorCode, number> = { gone: 404, exists: 409, bad: 400, key: 403, full: 409, owner: 403, locked: 423 };
/** The live connections of a ledger whose key was changed are closed with this: they were let in by the old one. */
const KEY_CHANGED = 4403;
/** The live connections of a ledger its owner deleted are closed with this. */
const DELETED = 4404;
const failed = (f: Fail) => refuse(f.error, STATUS[f.error]);
const today = () => new Date().toISOString().slice(0, 10);

async function body(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > BODY_MAX) return null;
  const text = await req.text();
  if (text.length > BODY_MAX) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One more ledger today from this network; false when today's are used up. Networks are told apart by address, kept only as a fingerprint. */
async function allowed(req: Request, env: Env): Promise<boolean> {
  if (env.ALLOW_TEST_SETTINGS === "1") return true;
  const network = await sha256(`split:${req.headers.get("cf-connecting-ip") ?? "local"}`);
  return env.GATES.get(env.GATES.idFromName(network)).take("make", MAKES_PER_DAY, today());
}

const accountOf = (env: Env, id: string) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`u:${id}`));

/** An account's room for files: QUOTA, or a smaller one the tests set. */
const quotaOf = (env: Env) => (env.ALLOW_TEST_SETTINGS === "1" && /^\d{1,12}$/.test(env.TEST_QUOTA ?? "") ? Number(env.TEST_QUOTA) : QUOTA);

/** Where a ledger's file is in the bucket. */
const fileKey = (ledger: string, id: string) => `${ledger}/${id}`;

/** Does a file start the way one of its kind does? (A file that says it is a photo and isn't, isn't kept.) */
function looksLike(bytes: Uint8Array, type: string): boolean {
  const starts = (...b: number[]) => b.every((x, i) => bytes[i] === x);
  const text = (from: number, s: string) => [...s].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === "image/webp") return text(0, "RIFF") && text(8, "WEBP");
  if (type === "application/pdf") return text(0, "%PDF-");
  return false;
}

/**
 * A file goes back to a phone holding the key: as what it is, kept on that phone (it never changes:
 * an id is never used for another file), and only ever shown, never run.
 */
function fileResponse(object: R2ObjectBody, file: FileInfo): Response {
  return new Response(object.body, {
    headers: {
      "content-type": file.type,
      "content-length": String(object.size),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
}

/**
 * A ledger's files: listed, stored, read, and taken off. Every one needs the key; storing one
 * also needs a sign-in, and is charged to that account before it goes in the bucket.
 */
async function files(req: Request, env: Env, ctx: ExecutionContext, stub: DurableObjectStub<LedgerDO>, ledger: string, id: string | undefined, keyHash: string | null): Promise<Response> {
  if (id === undefined) {
    if (req.method !== "GET") return refuse("notfound", 404);
    const got = await stub.listFiles(keyHash);
    return got.ok ? json({ files: got.files } satisfies Files) : failed(got);
  }
  if (!ID_RE.test(id)) return refuse("notfound", 404);
  if (req.method === "GET") {
    const got = await stub.file(keyHash, id);
    if (!got.ok) return failed(got);
    const object = await env.FILES.get(fileKey(ledger, id));
    return object ? fileResponse(object, got.file) : refuse("gone", 404);
  }
  if (req.method === "DELETE") {
    const got = await stub.unstore(keyHash, id);
    if (!got.ok) return failed(got);
    // (it is off the ledger whatever happens here; a file left behind is found by the nightly check)
    try {
      await env.FILES.delete(fileKey(ledger, id));
      await accountOf(env, got.file.by).release(ledger, [id]);
    } catch (e) {
      console.error("split: a file taken off its ledger wasn't let go", e);
    }
    return json({ ok: true });
  }
  if (req.method !== "PUT") return refuse("notfound", 404);

  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(FILE_TYPES as readonly string[]).includes(type)) return refuse("bad", 400);
  if (Number(req.headers.get("content-length") ?? 0) > FILE_MAX) return refuse("big", 413);
  // (the key, before a body of up to 10 MB is read; a file stored already is that file, charged once)
  const may = await stub.mayStore(keyHash, id);
  if (!may.ok) return failed(may);
  const account = accountOf(env, who.id);
  const quota = quotaOf(env);
  if (may.kept) return json({ file: may.kept, used: await account.used(), quota } satisfies Stored);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > FILE_MAX) return refuse("big", 413);
  if (!bytes.length || !looksLike(bytes, type)) return refuse("bad", 400);
  const room = await account.reserve({ ledger, id, size: bytes.length, day: today(), quota, account: who.id });
  if (!room.ok) return refuse(room.error, room.error === "quota" ? 413 : 429);
  const at = Date.now();
  try {
    await env.FILES.put(fileKey(ledger, id), bytes, { httpMetadata: { contentType: type }, customMetadata: { by: who.id, at: String(at) } });
  } catch {
    await account.release(ledger, [id]);
    return refuse("down", 503);
  }
  const kept = await stub.stored({ id, size: bytes.length, type, by: who.id, at });
  if (!kept.ok) {
    // (the ledger was locked or deleted meanwhile: the file goes, and so does its charge)
    await env.FILES.delete(fileKey(ledger, id));
    await account.release(ledger, [id]);
    return failed(kept);
  }
  return json({ file: kept.file, used: room.used, quota } satisfies Stored, 201);
}

/** "My files": how much of its room a signed-in account's files use; and its files no expense uses, cleared now. */
async function myFiles(req: Request, env: Env, ctx: ExecutionContext, what: string | undefined): Promise<Response> {
  if (!(what === undefined ? req.method === "GET" : what === "unused" && req.method === "DELETE")) return refuse("notfound", 404);
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  // (the tests ask as of an hour or two from now, when what they just stored has settled)
  const later = new URL(req.url).searchParams.get("at") ?? "";
  const now = env.ALLOW_TEST_SETTINGS === "1" && /^\d{1,15}$/.test(later) ? Number(later) : Date.now();
  if (what === "unused") await clearUnused(env, who.id, now);
  return json((await myRoom(env, who.id, now)) satisfies MyFiles);
}

const ledgerOf = (env: Env, id: string) => env.LEDGERS.get(env.LEDGERS.idFromName(id));
const none = (): Count => ({ count: 0, bytes: 0 });

/** An account's room as the storage page shows it: each ledger asked how many of its files there no expense uses. (One that is gone gives its room back here.) */
async function myRoom(env: Env, account: string, now: number): Promise<MyFiles> {
  const stub = accountOf(env, account);
  const room = await stub.storage(quotaOf(env));
  const asked: (Usage | null | undefined)[] = await Promise.all(room.ledgers.map((l) => ledgerOf(env, l.id).usage(account, now).catch(() => undefined)));
  let used = room.used;
  for (const [i, l] of room.ledgers.entries()) if (asked[i] === null) used = await stub.settle(l.id, []);
  const ledgers = room.ledgers.flatMap((l, i) => (asked[i] === null ? [] : [{ ...l, unused: asked[i]?.unused ?? none() }]));
  const unused = ledgers.reduce((a, l) => ({ count: a.count + l.unused.count, bytes: a.bytes + l.unused.bytes }), none());
  return { used, quota: room.quota, unused, ledgers };
}

/** The storage page's 现在清掉: an account's files no expense uses go now, from every ledger (not one stored in the last hour). */
async function clearUnused(env: Env, account: string, now: number): Promise<void> {
  const stub = accountOf(env, account);
  for (const ledger of await stub.ledgersWithFiles()) {
    try {
      const gone = await ledgerOf(env, ledger).dropUnused(account, now);
      if (gone.length) await stub.release(ledger, gone.map((f) => f.id));
    } catch (e) {
      console.error("split: an account's unused files in a ledger weren't cleared", e);
    }
  }
}

/** Every key under a ledger's prefix in the bucket that isn't on its list goes (one put in the last hour may still be on its way onto the list). */
async function sweep(env: Env, ledger: string, keeps: (file: string) => boolean, now: number): Promise<number> {
  let cursor: string | undefined;
  let swept = 0;
  do {
    const page = await env.FILES.list({ prefix: `${ledger}/`, cursor, limit: 1000 });
    const loose = page.objects.filter((o) => !keeps(o.key.slice(ledger.length + 1)) && now - o.uploaded.getTime() >= SETTLING_MS).map((o) => o.key);
    if (loose.length) await env.FILES.delete(loose);
    swept += loose.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return swept;
}

/**
 * A changle.ca account is deleted: every file it sent goes, from every ledger and the bucket, and
 * then all that was kept for it here (its ledgers, its room). The ledgers keep its name, and its
 * expenses; their photos show as gone. What can't be reached now is tried again in an hour.
 */
async function forgetAccount(env: Env, account: string): Promise<{ files: number; left: number }> {
  return accountOf(env, account).forget(account);
}

/** What only the rooms server reaches, through a Service Binding to this entrypoint (no address of changle.ca leads here): an account deleted. */
export class Internal extends WorkerEntrypoint<Env> {
  async accountGone(account: unknown): Promise<{ files: number; left: number }> {
    if (typeof account !== "string" || !ACCOUNT_RE.test(account)) return { files: 0, left: 0 };
    return forgetAccount(this.env, account);
  }
}

/**
 * Local runs and tests only (ALLOW_TEST_SETTINGS): a ledger's nightly check, as of a time to come;
 * an account's; an account deleted, the way the rooms server does it (the stand-in, through its
 * binding to `Internal`: tests/rooms); and two things that go wrong only rarely, for the nightly
 * checks to put right: a file in the bucket no ledger lists, and an account charged for a file no
 * ledger keeps.
 */
async function testOnly(req: Request, env: Env, what: string | undefined): Promise<Response> {
  if (env.ALLOW_TEST_SETTINGS !== "1" || req.method !== "POST") return refuse("notfound", 404);
  const input = (await body(req)) ?? {};
  const ledger = typeof input.ledger === "string" && ID_RE.test(input.ledger) ? input.ledger : null;
  const file = typeof input.file === "string" && ID_RE.test(input.file) ? input.file : null;
  if (what === "night" && ledger) {
    const at = typeof input.at === "number" && Number.isFinite(input.at) ? input.at : Date.now();
    return json(await ledgerOf(env, ledger).nightlyAt(at));
  }
  if (what === "night" && typeof input.account === "string") return json({ used: await accountOf(env, input.account).check() });
  if (what === "account-gone") return env.ROOMS.fetch(new Request("https://rooms.split.invalid/api/me", { method: "DELETE", headers: { authorization: req.headers.get("authorization") ?? "" } }));
  if (what === "loose" && ledger && file) {
    await env.FILES.put(fileKey(ledger, file), new Uint8Array([0xff, 0xd8, 0xff, 0]), { httpMetadata: { contentType: "image/jpeg" } });
    return json({ ok: true });
  }
  if (what === "charge" && ledger && file && typeof input.account === "string") {
    return json(await accountOf(env, input.account).reserve({ ledger, id: file, size: 1234, day: today(), quota: quotaOf(env), account: input.account }));
  }
  return refuse("bad", 400);
}

/**
 * The account a request is signed in to. Null when it carries no sign-in; a response to send
 * back when it carries one that isn't anybody's (401 "signin") or can't be checked now (503).
 */
async function signedIn(req: Request, env: Env, ctx: ExecutionContext): Promise<Who | null | Response> {
  const session = sessionOf(req);
  if (session === null) return req.headers.has("authorization") ? refuse("signin", 401) : null;
  const asked = await whoIs(session, env.ROOMS, (p) => ctx.waitUntil(p));
  return asked.ok ? asked.who : refuse(asked.error, asked.error === "signin" ? 401 : 503);
}

/**
 * Someone in a ledger (they hold its key) invites a friend of theirs on changle.ca: signed in, and
 * the two friends there, as the rooms server says. The invitation waits in the friend's account
 * (src/room/account.ts), with the key the inviter sent, the ledger's name, who sent it, and the
 * person in the ledger it is for when that came (and is someone in it).
 */
async function invite(req: Request, env: Env, ctx: ExecutionContext, stub: DurableObjectStub<LedgerDO>, ledger: string, key: string, keyHash: string | null): Promise<Response> {
  const session = sessionOf(req);
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who || !session) return refuse("signin", 401);
  const input = await body(req);
  const to = typeof input?.to === "string" && ACCOUNT_RE.test(input.to) ? input.to : null;
  if (!input || !to || to === who.id || (input.member !== undefined && (typeof input.member !== "string" || !MEMBER_RE.test(input.member)))) return refuse("bad", 400);
  const got = await stub.read(keyHash);
  if (!got.ok) return failed(got);
  // (a locked ledger takes nobody new)
  if (got.ledger.locked !== undefined) return refuse("locked", 423);
  // (counted before the rooms server is asked: a phone that keeps asking about strangers stops too)
  if (!(await accountOf(env, who.id).mayInvite(today(), INVITES_PER_DAY))) return refuse("limit", 429);
  const friend = await friendOf(session, to, env.ROOMS);
  if (friend !== "yes") return friend === "no" ? refuse("friends", 403) : refuse(friend, friend === "signin" ? 401 : 503);
  const member = typeof input.member === "string" && got.ledger.members.some((m) => m.id === input.member) ? input.member : undefined;
  const from = { id: who.id, name: who.name, av: who.av, ...(who.ac === undefined ? {} : { ac: who.ac }) };
  const invited = await accountOf(env, to).invited({ ledger, key, name: got.ledger.name, from, ...(member ? { member } : {}), at: Date.now() });
  return json({ invite: invited } satisfies InviteSent, invited === "sent" ? 201 : 200);
}

/** The invitations waiting for the signed-in account; and one it says no to (or has used), which goes. */
async function myInvites(req: Request, env: Env, ctx: ExecutionContext, ledger: string | undefined): Promise<Response> {
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  const account = accountOf(env, who.id);
  if (ledger === undefined) return req.method === "GET" ? json({ invites: await account.invites() } satisfies MyInvites) : refuse("notfound", 404);
  if (!ID_RE.test(ledger) || req.method !== "DELETE") return refuse("notfound", 404);
  await account.uninvite(ledger);
  return json({ ok: true });
}

/** "My ledgers": what a signed-in phone asks of its account. */
async function mine(req: Request, env: Env, ctx: ExecutionContext, id: string | undefined): Promise<Response> {
  const who = await signedIn(req, env, ctx);
  if (who instanceof Response) return who;
  if (!who) return refuse("signin", 401);
  const account = accountOf(env, who.id);
  if (id === undefined) {
    if (req.method !== "GET") return refuse("notfound", 404);
    return json({ ledgers: await account.list() } satisfies MyLedgers);
  }
  if (!ID_RE.test(id)) return refuse("notfound", 404);
  if (req.method === "DELETE") {
    await account.drop(id);
    return json({ ok: true });
  }
  if (req.method !== "PUT") return refuse("notfound", 404);
  // Kept only when the key opens the ledger, and the owner's key, when one comes, is its owner's.
  const key = req.headers.get(KEY_HEADER) ?? "";
  const owner = req.headers.get(OWNER_HEADER);
  if (!KEY_RE.test(key) || (owner !== null && !KEY_RE.test(owner))) return refuse("bad", 400);
  const input = (await body(req)) ?? {};
  const stub = env.LEDGERS.get(env.LEDGERS.idFromName(id));
  const got = await stub.read(await sha256(key));
  if (!got.ok) return failed(got);
  if (owner !== null && !(await stub.owned(await sha256(owner)))) return refuse("owner", 403);
  // (who they are only if they are someone in it: one taken out since is forgotten)
  const me = typeof input.me === "string" && MEMBER_RE.test(input.me) && got.ledger.members.some((m) => m.id === input.me) ? input.me : input.me === undefined ? undefined : null;
  const kept = await account.keep({ id, key, owner, me });
  return kept.ok ? json({ mine: kept.mine } satisfies MineBody) : refuse(kept.error, 409);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return refuse("notfound", 404);
    const parts = url.pathname.slice(BASE.length).split("/").filter(Boolean);
    if (parts[0] === "me" && parts[1] === "ledgers" && parts.length <= 3) return mine(req, env, ctx, parts[2]);
    if (parts[0] === "me" && parts[1] === "files" && parts.length <= 3) return myFiles(req, env, ctx, parts[2]);
    if (parts[0] === "me" && parts[1] === "invites" && parts.length <= 3) return myInvites(req, env, ctx, parts[2]);
    if (parts[0] === "test" && parts.length === 2) return testOnly(req, env, parts[1]);
    if (parts[0] !== "ledgers" || parts.length > 4) return refuse("notfound", 404);

    // the live connection: its key comes as a protocol name, because a browser can't give it a header
    if (parts.length === 3 && parts[2] === "live" && req.method === "GET") {
      if (!ID_RE.test(parts[1])) return refuse("notfound", 404);
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) return new Response("forbidden", { status: 403 });
      const [name, key = ""] = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim());
      if (name !== LIVE_PROTOCOL || !KEY_RE.test(key)) return refuse("key", 403);
      const headers = new Headers(req.headers);
      headers.set(HASH_HEADER, await sha256(key));
      return env.LEDGERS.get(env.LEDGERS.idFromName(parts[1])).fetch(new Request(req, { headers }));
    }

    const key = req.headers.get(KEY_HEADER) ?? "";
    const keyHash = KEY_RE.test(key) ? await sha256(key) : null;
    // the owner's key: on the request that makes the ledger, and on the owner's two
    const owner = req.headers.get(OWNER_HEADER);
    const ownerHash = owner !== null && KEY_RE.test(owner) ? await sha256(owner) : null;

    if (parts.length === 1 && req.method === "POST") {
      if (!keyHash) return refuse("key", 403);
      // (an owner's key that isn't one makes no ledger: better than a ledger its maker can't lock)
      if (owner !== null && !ownerHash) return refuse("bad", 400);
      // A ledger is made for a phone signed in to changle.ca: it goes into the account's list, keys
      // and all, and counts against the account's day. (Asked for again, one already made needs no
      // sign-in: nothing new is made, and a phone that signed out meanwhile still gets its answer.)
      const who = await signedIn(req, env, ctx);
      if (who instanceof Response) return who;
      const input = await body(req);
      if (!input || typeof input.id !== "string" || !ID_RE.test(input.id)) return refuse("bad", 400);
      const id = input.id;
      const stub = env.LEDGERS.get(env.LEDGERS.idFromName(id));
      // (keeping it in the list is a convenience: the phone holds the keys, and puts them in its account itself when this didn't)
      const keep = async (owned: boolean) => {
        if (who) await accountOf(env, who.id).keep({ id, key, owner: owned && ownerHash ? owner : undefined }).catch(() => undefined);
      };
      // a phone asking again for the ledger it has already made doesn't use up the day's allowance
      // (and its owner's key is kept only if it is the one the ledger was made with)
      const there = await stub.read(keyHash);
      if (there.ok) {
        await keep(await stub.owned(ownerHash));
        return json({ seq: there.seq, ledger: there.ledger } satisfies Snapshot);
      }
      if (there.error !== "gone") return refuse("exists", 409);
      if (!who) return refuse("signin", 401);
      if (!(await allowed(req, env))) return refuse("limit", 429);
      if (who && !(await accountOf(env, who.id).take(today(), STARTS_PER_DAY))) return refuse("limit", 429);
      const made = await stub.create({ id, name: input.name, currency: input.currency, members: input.members, keyHash, ownerHash, now: Date.now() });
      if (!made.ok) return failed(made);
      await keep(true);
      return json({ seq: made.seq, ledger: made.ledger } satisfies Snapshot, 201);
    }

    if (!ID_RE.test(parts[1] ?? "")) return refuse("notfound", 404);
    const stub = env.LEDGERS.get(env.LEDGERS.idFromName(parts[1]));
    if (parts[2] === "files") return files(req, env, ctx, stub, parts[1], parts[3], keyHash);
    if (parts.length > 3) return refuse("notfound", 404);

    // The owner deletes it. Signed in, it also leaves the owner's list.
    if (parts.length === 2 && req.method === "DELETE") {
      const got = await stub.wipe(ownerHash);
      if (!got.ok) return failed(got);
      const who = await signedIn(req, env, ctx);
      if (who && !(who instanceof Response)) await accountOf(env, who.id).drop(parts[1]);
      return json({ ok: true });
    }
    if (parts.length === 2 && req.method === "GET") {
      const since = url.searchParams.get("since");
      if (since === null) {
        const got = await stub.read(keyHash);
        return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
      }
      const got = await stub.since(keyHash, /^\d{1,15}$/.test(since) ? Number(since) : -1);
      return got.ok ? json({ seq: got.seq, changes: got.changes } satisfies Since) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "changes" && req.method === "POST") {
      const input = await body(req);
      if (!input) return refuse("bad", 400);
      const got = await stub.push(keyHash, input.changes);
      return got.ok ? json({ seq: got.seq, ledger: got.ledger, took: got.took } satisfies Pushed) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "key" && req.method === "POST") {
      const next = req.headers.get(NEXT_HEADER) ?? "";
      if (!KEY_RE.test(next)) return refuse("bad", 400);
      const got = await stub.rekey(ownerHash, await sha256(next));
      return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
    }
    if (parts.length === 3 && parts[2] === "invites" && req.method === "POST") return invite(req, env, ctx, stub, parts[1], key, keyHash);
    if (parts.length === 3 && parts[2] === "lock" && req.method === "POST") {
      const input = await body(req);
      if (!input) return refuse("bad", 400);
      const got = await stub.lock(ownerHash, input.locked);
      return got.ok ? json({ seq: got.seq, ledger: got.ledger } satisfies Snapshot) : failed(got);
    }
    return refuse("notfound", 404);
  },
} satisfies ExportedHandler<Env>;

/** The room's store, in the Durable Object's own SQLite. Nothing is written for a ledger nobody made. */
function sqlStore(sql: SqlStorage): Store {
  // every change this ledger was sent, and whether it counted
  const HEARD = "CREATE TABLE IF NOT EXISTS heard (id TEXT PRIMARY KEY, counted INTEGER NOT NULL) WITHOUT ROWID";
  // its receipt photos and files: what is in the bucket for it, and whose account sent each
  const FILES = "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, size INTEGER NOT NULL, type TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL)";
  // its files the nightly check found no expense uses, and since when
  const UNUSED = "CREATE TABLE IF NOT EXISTS unused (id TEXT PRIMARY KEY, since INTEGER NOT NULL) WITHOUT ROWID";
  let made = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
  // A ledger made on the server's first day has a table named `sent` with ids only. It gets the
  // new table here and the old one is left as it is, not read. (A ledger made before files gets
  // their table here too.)
  if (made) {
    sql.exec(HEARD);
    sql.exec(FILES);
    sql.exec(UNUSED);
  }
  const ready = () => {
    if (made) return;
    sql.exec("CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, ledger TEXT NOT NULL)");
    sql.exec(HEARD);
    sql.exec(FILES);
    sql.exec(UNUSED);
    sql.exec("CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL)");
    made = true;
  };
  return {
    load() {
      if (!made) return null;
      const row = sql.exec("SELECT json, ledger FROM meta WHERE id = 1").toArray()[0];
      return row ? { meta: JSON.parse(row.json as string) as Meta, ledger: JSON.parse(row.ledger as string) as Ledger } : null;
    },
    save(meta, ledger) {
      ready();
      sql.exec("INSERT INTO meta (id, json, ledger) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, ledger = excluded.ledger", JSON.stringify(meta), JSON.stringify(ledger));
    },
    seen(id) {
      if (!made) return undefined;
      const row = sql.exec("SELECT counted FROM heard WHERE id = ?", id).toArray()[0];
      return row ? row.counted === 1 : undefined;
    },
    keep(id, logged) {
      ready();
      sql.exec("INSERT OR IGNORE INTO heard (id, counted) VALUES (?, ?)", id, logged ? 1 : 0);
      if (logged) sql.exec("INSERT INTO log (seq, at, json) VALUES (?, ?, ?)", logged.seq, logged.at, JSON.stringify(logged.sent));
    },
    // (a line that is no change is kept as {"lock": true or false}, where a change's line is the change as it was sent)
    note(logged) {
      ready();
      sql.exec("INSERT INTO log (seq, at, json) VALUES (?, ?, ?)", logged.seq, logged.at, JSON.stringify({ lock: logged.lock }));
    },
    since(seq, limit) {
      if (!made) return [];
      const rows = sql.exec("SELECT seq, at, json FROM log WHERE seq > ? ORDER BY seq LIMIT ?", seq, limit).toArray();
      return rows.map((r): Logged => {
        const line = JSON.parse(r.json as string) as { lock?: unknown };
        return typeof line.lock === "boolean" ? { seq: r.seq as number, at: r.at as number, lock: line.lock } : { seq: r.seq as number, at: r.at as number, sent: line as Extract<Logged, { sent: unknown }>["sent"] };
      });
    },
    // Every table goes (the ledger, the ids it was sent, its record, the first day's `sent`), and
    // one is made with only the time it went.
    wipe(now) {
      const tables = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").toArray();
      for (const t of tables) sql.exec(`DROP TABLE IF EXISTS "${String(t.name).replaceAll('"', "")}"`);
      sql.exec("CREATE TABLE buried (at INTEGER NOT NULL)");
      sql.exec("INSERT INTO buried (at) VALUES (?)", now);
      made = false;
    },
    buried() {
      if (made) return null;
      const there = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'buried'").toArray().length > 0;
      const row = there ? sql.exec("SELECT at FROM buried LIMIT 1").toArray()[0] : undefined;
      return row ? (row.at as number) : null;
    },
    files() {
      if (!made) return [];
      return sql.exec("SELECT id, size, type, by, at FROM files ORDER BY at, rowid").toArray().map(asStoredFile);
    },
    file(id) {
      if (!made) return null;
      const row = sql.exec("SELECT id, size, type, by, at FROM files WHERE id = ?", id).toArray()[0];
      return row ? asStoredFile(row) : null;
    },
    putFile(f) {
      ready();
      sql.exec("INSERT OR IGNORE INTO files (id, size, type, by, at) VALUES (?, ?, ?, ?, ?)", f.id, f.size, f.type, f.by, f.at);
    },
    dropFile(id) {
      if (!made) return;
      sql.exec("DELETE FROM files WHERE id = ?", id);
      sql.exec("DELETE FROM unused WHERE id = ?", id);
    },
    fileCount: () => (made ? Number(sql.exec("SELECT count(*) AS n FROM files").one().n) : 0),
    unused: () => new Map(made ? sql.exec("SELECT id, since FROM unused").toArray().map((r) => [String(r.id), Number(r.since)] as const) : []),
    markUnused(id, since) {
      if (made) sql.exec("INSERT INTO unused (id, since) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET since = excluded.since", id, since);
    },
    clearUnused(id) {
      if (made) sql.exec("DELETE FROM unused WHERE id = ?", id);
    },
  };
}

const asStoredFile = (r: Record<string, SqlStorageValue>): StoredFile => ({ id: String(r.id), size: Number(r.size), type: String(r.type), by: String(r.by), at: Number(r.at) });

/** One ledger. */
export class LedgerDO extends DurableObject<Env> {
  private room: LedgerRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new LedgerRoom(sqlStore(ctx.storage.sql));
  }

  /** Every phone that is listening gets the ledger as it now stands. */
  private tell(): void {
    const snap = this.room.snapshot();
    if (!snap) return;
    const text = JSON.stringify({ t: "ledger", ...snap } satisfies Push);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // a phone that just left
      }
    }
  }

  async create(input: Parameters<LedgerRoom["create"]>[0]): Promise<ReturnType<LedgerRoom["create"]>> {
    return this.room.create(input);
  }

  async read(keyHash: string | null): Promise<ReturnType<LedgerRoom["read"]>> {
    return this.room.read(keyHash);
  }

  async push(keyHash: string | null, changes: unknown): Promise<ReturnType<LedgerRoom["push"]>> {
    const got = this.room.push(keyHash, changes, Date.now());
    if (got.ok && got.took.includes("new")) this.tell();
    return got;
  }

  async since(keyHash: string | null, seq: number): Promise<ReturnType<LedgerRoom["since"]>> {
    return this.room.since(keyHash, seq);
  }

  /** The owner changes the key. Every phone that was listening was let in by the old one: they are let go, and come back with the new one or not at all. */
  async rekey(ownerHash: string | null, nextHash: string): Promise<ReturnType<LedgerRoom["rekey"]>> {
    const got = this.room.rekey(ownerHash, nextHash);
    if (got.ok && got.changed) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(KEY_CHANGED, "key");
        } catch {
          // a phone that just left
        }
      }
    }
    return got;
  }

  /** Is this the owner's key? */
  async owned(ownerHash: string | null): Promise<boolean> {
    return this.room.owns(ownerHash);
  }

  /**
   * The owner deletes the ledger. Every phone that was listening is let go, and finds it gone when
   * it comes back. Its files go from the bucket, and each sender's account has their room back.
   */
  async wipe(ownerHash: string | null): Promise<Fail | { ok: true }> {
    const got = this.room.wipe(ownerHash, Date.now());
    if (!got.ok) return got;
    this.letGo();
    // (anything of its own the bucket still has goes in a little while, by a night that comes early)
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS sweep (id TEXT NOT NULL)");
    this.ctx.storage.sql.exec("DELETE FROM sweep");
    this.ctx.storage.sql.exec("INSERT INTO sweep (id) VALUES (?)", got.id);
    await this.ctx.storage.setAlarm(Date.now() + 2 * SETTLING_MS);
    // (the ledger is gone whatever happens here; a file left behind is found by the nightly check)
    try {
      const keys = got.files.map((f) => fileKey(got.id, f.id));
      for (let i = 0; i < keys.length; i += 1000) await this.env.FILES.delete(keys.slice(i, i + 1000));
      const by = new Map<string, string[]>();
      for (const f of got.files) by.set(f.by, [...(by.get(f.by) ?? []), f.id]);
      for (const [account, ids] of by) await accountOf(this.env, account).release(got.id, ids);
    } catch (e) {
      console.error("split: a deleted ledger's files weren't all let go", e);
    }
    return { ok: true };
  }

  async mayStore(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["mayStore"]>> {
    return this.room.mayStore(keyHash, id);
  }

  async stored(file: StoredFile): Promise<ReturnType<LedgerRoom["stored"]>> {
    const got = this.room.stored(file);
    // (a ledger with files has its nightly check)
    const id = this.room.snapshot()?.ledger.id;
    if (got.ok && id && (await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextNight(id, Date.now()));
    return got;
  }

  /** The nightly check (its alarm). */
  async alarm(): Promise<void> {
    await this.nightlyAt(Date.now());
  }

  /**
   * The nightly check, as of `now`: files no expense has used for 30 days go, from the list, the
   * bucket and their senders' room; so does anything in the bucket the list doesn't have. A
   * deleted ledger's leftovers in the bucket go too, and then it has no night again.
   */
  async nightlyAt(now: number): Promise<{ gone: number; swept: number; left: number }> {
    const id = this.room.snapshot()?.ledger.id;
    if (!id) {
      const sweeping = this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sweep'").toArray().length > 0;
      const left = sweeping ? this.ctx.storage.sql.exec("SELECT id FROM sweep LIMIT 1").toArray()[0] : undefined;
      return { gone: 0, swept: left ? await sweep(this.env, String(left.id), () => false, now) : 0, left: 0 };
    }
    const { gone, left } = this.room.nightly(now);
    await this.letGoOf(id, gone);
    let swept = 0;
    try {
      swept = await sweep(this.env, id, (file) => this.room.keeps(file), now);
    } catch (e) {
      console.error("split: a ledger's bucket wasn't swept", e);
    }
    if (left > 0) await this.ctx.storage.setAlarm(nextNight(id, now));
    return { gone: gone.length, swept, left };
  }

  /** Files off the list go from the bucket, and their senders have the room back. (One left behind is the next night's.) */
  private async letGoOf(id: string, files: StoredFile[]): Promise<void> {
    if (!files.length) return;
    try {
      const keys = files.map((f) => fileKey(id, f.id));
      for (let i = 0; i < keys.length; i += 1000) await this.env.FILES.delete(keys.slice(i, i + 1000));
      const by = new Map<string, string[]>();
      for (const f of files) by.set(f.by, [...(by.get(f.by) ?? []), f.id]);
      for (const [account, ids] of by) await accountOf(this.env, account).release(id, ids);
    } catch (e) {
      console.error("split: files off a ledger's list weren't all let go", e);
    }
  }

  /** One account's files here, for its storage page; null when the ledger is gone. */
  async usage(account: string, now: number): Promise<Usage | null> {
    return this.room.usage(account, now);
  }

  /** An account clears its files here that no expense uses: off the list and out of the bucket; returned, for the account's room. */
  async dropUnused(account: string, now: number): Promise<StoredFile[]> {
    const id = this.room.snapshot()?.ledger.id;
    const gone = this.room.dropUnused(account, now);
    if (id && gone.length) {
      try {
        await this.env.FILES.delete(gone.map((f) => fileKey(id, f.id)));
      } catch (e) {
        console.error("split: cleared files weren't let go (the nightly check sweeps them)", e);
      }
    }
    return gone;
  }

  /** An account is deleted: every file it sent here goes, off the list and out of the bucket. How many. */
  async dropBy(account: string): Promise<number> {
    const id = this.room.snapshot()?.ledger.id;
    const gone = this.room.dropBy(account);
    if (id && gone.length) {
      const keys = gone.map((f) => fileKey(id, f.id));
      for (let i = 0; i < keys.length; i += 1000) await this.env.FILES.delete(keys.slice(i, i + 1000));
    }
    return gone.length;
  }

  /** One account's files as the list has them (the account's nightly check); null when the ledger is gone. */
  async filesBy(account: string): Promise<StoredFile[] | null> {
    return this.room.filesBy(account);
  }

  async file(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["file"]>> {
    return this.room.file(keyHash, id);
  }

  async listFiles(keyHash: string | null): Promise<ReturnType<LedgerRoom["listFiles"]>> {
    return this.room.listFiles(keyHash);
  }

  async unstore(keyHash: string | null, id: string): Promise<ReturnType<LedgerRoom["unstore"]>> {
    return this.room.unstore(keyHash, id);
  }

  /** Every phone listening to a ledger that is gone is let go. */
  private letGo() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(DELETED, "gone");
      } catch {
        // a phone that just left
      }
    }
  }

  /** The owner locks the ledger, or opens it again: every phone that is listening sees it. */
  async lock(ownerHash: string | null, locked: unknown): Promise<ReturnType<LedgerRoom["lock"]>> {
    const got = this.room.lock(ownerHash, locked, Date.now());
    if (got.ok && got.changed) this.tell();
    return got;
  }

  /** The live connection: a phone listens here and is sent the ledger now, and again whenever it changes. */
  async fetch(req: Request): Promise<Response> {
    const snap = this.room.snapshot();
    if (!snap) return refuse("gone", 404);
    if (!this.room.opens(req.headers.get(HASH_HEADER))) return refuse("key", 403);
    const [client, server] = Object.values(new WebSocketPair());
    // a phone's keep-alive is answered without waking the ledger
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: "ledger", ...snap } satisfies Push));
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": LIVE_PROTOCOL } });
  }

  async webSocketMessage(): Promise<void> {
    // phones only listen here (changes go by POST); "ping" is answered before it gets this far
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011);
    } catch {
      // already closed
    }
  }
}

/** One network's daily allowance of new ledgers. Forgets everything two days after its last use. */
export class GateDO extends DurableObject<Env> {
  async take(kind: string, limit: number, day: string): Promise<boolean> {
    const key = `${kind}:${day}`;
    const used = (await this.ctx.storage.get<number>(key)) ?? 0;
    if (used >= limit) return false;
    await this.ctx.storage.put(key, used + 1);
    await this.ctx.storage.setAlarm(Date.now() + 2 * 86_400_000);
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

/** An account's list, in the Durable Object's own SQLite. */
function accountStore(sql: SqlStorage): AccountStore {
  sql.exec("CREATE TABLE IF NOT EXISTS mine (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS started (day TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID");
  sql.exec("CREATE TABLE IF NOT EXISTS files (ledger TEXT NOT NULL, id TEXT NOT NULL, size INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ledger, id))");
  sql.exec("CREATE TABLE IF NOT EXISTS sent (day TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID");
  // which account this is (told with its first file); and whether it is deleted, and its files are still going
  sql.exec("CREATE TABLE IF NOT EXISTS self (id INTEGER PRIMARY KEY CHECK (id = 1), account TEXT NOT NULL, forgetting INTEGER NOT NULL DEFAULT 0)");
  // invitations from friends waiting for this account; and how many it sent today
  sql.exec("CREATE TABLE IF NOT EXISTS invites (ledger TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS invited (day TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID");
  const asFile = (r: Record<string, SqlStorageValue>): AccountFile => ({ ledger: String(r.ledger), id: String(r.id), size: Number(r.size), at: Number(r.at) });
  const read = (json: unknown) => JSON.parse(json as string) as Mine;
  return {
    // (the newest first; among those sent the same moment, the last put: a replaced one is put again, so it gets a new rowid)
    invites: () =>
      sql
        .exec("SELECT json FROM invites ORDER BY at DESC, rowid DESC")
        .toArray()
        .map((r) => JSON.parse(r.json as string) as Invite),
    putInvite(invite) {
      sql.exec("INSERT OR REPLACE INTO invites (ledger, json, at) VALUES (?, ?, ?)", invite.ledger, JSON.stringify(invite), invite.at);
    },
    dropInvite(ledger) {
      sql.exec("DELETE FROM invites WHERE ledger = ?", ledger);
    },
    inviting: (day) => Number(sql.exec("SELECT n FROM invited WHERE day = ?", day).toArray()[0]?.n ?? 0),
    invite(day) {
      sql.exec("DELETE FROM invited WHERE day <> ?", day);
      sql.exec("INSERT INTO invited (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1", day);
    },
    // (the last first kept first; among those kept the same moment, the last put)
    list: () => sql.exec("SELECT json FROM mine ORDER BY at DESC, rowid DESC").toArray().map((r) => read(r.json)),
    get: (id) => {
      const row = sql.exec("SELECT json FROM mine WHERE id = ?", id).toArray()[0];
      return row ? read(row.json) : null;
    },
    put(m) {
      sql.exec("INSERT INTO mine (id, json, at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json", m.id, JSON.stringify(m), m.at);
    },
    drop(id) {
      sql.exec("DELETE FROM mine WHERE id = ?", id);
    },
    count: () => Number(sql.exec("SELECT count(*) AS n FROM mine").one().n),
    used: (day) => Number(sql.exec("SELECT n FROM started WHERE day = ?", day).toArray()[0]?.n ?? 0),
    use(day) {
      sql.exec("DELETE FROM started WHERE day <> ?", day);
      sql.exec("INSERT INTO started (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1", day);
    },
    fileOf(ledger, id) {
      const row = sql.exec("SELECT ledger, id, size, at FROM files WHERE ledger = ? AND id = ?", ledger, id).toArray()[0];
      return row ? asFile(row) : null;
    },
    addFile(f) {
      sql.exec("INSERT OR IGNORE INTO files (ledger, id, size, at) VALUES (?, ?, ?, ?)", f.ledger, f.id, f.size, f.at);
    },
    dropFile(ledger, id) {
      sql.exec("DELETE FROM files WHERE ledger = ? AND id = ?", ledger, id);
    },
    files: () => sql.exec("SELECT ledger, id, size, at FROM files ORDER BY at, rowid").toArray().map(asFile),
    uploads: (day) => Number(sql.exec("SELECT n FROM sent WHERE day = ?", day).toArray()[0]?.n ?? 0),
    upload(day) {
      sql.exec("DELETE FROM sent WHERE day <> ?", day);
      sql.exec("INSERT INTO sent (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1", day);
    },
    self: () => {
      const row = sql.exec("SELECT account FROM self WHERE id = 1").toArray()[0];
      return row ? String(row.account) : null;
    },
    setSelf(account) {
      sql.exec("INSERT INTO self (id, account) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET account = excluded.account", account);
    },
    // (the tables stay, empty)
    wipe() {
      for (const t of ["mine", "started", "files", "sent", "self", "invites", "invited"]) sql.exec(`DELETE FROM ${t}`);
    },
  };
}

/** One changle.ca account's ledgers ("my ledgers"), with their keys; and how many it started today. */
export class AccountDO extends DurableObject<Env> {
  private room: AccountRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new AccountRoom(accountStore(ctx.storage.sql));
  }

  async list(): Promise<Mine[]> {
    return this.room.list();
  }

  async keep(input: { id: string; key: string; owner?: string | null; me?: string | null }): Promise<Kept> {
    return this.room.keep({ ...input, now: Date.now() });
  }

  async drop(id: string): Promise<void> {
    this.room.drop(id);
  }

  async take(day: string, limit: number): Promise<boolean> {
    return this.room.take(day, limit);
  }

  async used(): Promise<number> {
    return this.room.used();
  }

  async reserve(input: { ledger: string; id: string; size: number; day: string; quota: number; account: string }): Promise<Reserved> {
    const got = this.room.reserve({ ...input, now: Date.now() });
    // (an account with files has its nightly check)
    if (got.ok && got.fresh && (await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextNight(`u:${input.account}`, Date.now()));
    return got;
  }

  async ledgersWithFiles(): Promise<string[]> {
    return this.room.ledgersWithFiles();
  }

  async settle(ledger: string, kept: { id: string; size: number; at: number }[]): Promise<number> {
    return this.room.settle(ledger, kept);
  }

  /** The nightly check (its alarm): an account deleted, its files still going; otherwise what it is charged made what the ledgers keep. */
  async alarm(): Promise<void> {
    const me = this.room.self();
    if (me && this.forgetting()) await this.forget(me);
    else await this.check();
  }

  /** What this account is charged for, made what each ledger its files are in really keeps of them. The bytes used now. */
  async check(): Promise<number> {
    const me = this.room.self();
    if (!me) return this.room.used();
    for (const ledger of this.room.ledgersWithFiles()) {
      try {
        this.room.settle(ledger, (await this.env.LEDGERS.get(this.env.LEDGERS.idFromName(ledger)).filesBy(me)) ?? []);
      } catch (e) {
        console.error("split: an account's files in a ledger weren't checked", e);
      }
    }
    if (this.room.ledgersWithFiles().length) await this.ctx.storage.setAlarm(nextNight(`u:${me}`, Date.now()));
    return this.room.used();
  }

  private forgetting(): boolean {
    return this.ctx.storage.sql.exec("SELECT forgetting FROM self WHERE id = 1").toArray()[0]?.forgetting === 1;
  }

  /**
   * The account is deleted: every file it sent goes from each ledger and the bucket, and then all
   * that is kept for it here. A ledger that can't be reached now is tried again in an hour (and
   * until then the account is remembered as being forgotten).
   */
  async forget(account: string): Promise<{ files: number; left: number }> {
    this.ctx.storage.sql.exec("INSERT INTO self (id, account, forgetting) VALUES (1, ?, 1) ON CONFLICT (id) DO UPDATE SET account = excluded.account, forgetting = 1", account);
    let files = 0;
    let left = 0;
    for (const ledger of this.room.ledgersWithFiles()) {
      try {
        files += await this.env.LEDGERS.get(this.env.LEDGERS.idFromName(ledger)).dropBy(account);
        this.room.settle(ledger, []);
      } catch (e) {
        left += 1;
        console.error("split: a deleted account's files in a ledger didn't go yet", e);
      }
    }
    if (left) {
      await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
      return { files, left };
    }
    this.room.wipe();
    await this.ctx.storage.deleteAlarm();
    return { files, left };
  }

  async release(ledger: string, ids: string[]): Promise<number> {
    return this.room.release(ledger, ids);
  }

  async storage(quota: number): Promise<Storage> {
    return this.room.storage(quota);
  }

  /** A friend invites this account to a ledger (src/room/account.ts, `invited`). */
  async invited(invite: Invite): Promise<Invited> {
    return this.room.invited(invite, Date.now());
  }

  async invites(): Promise<Invite[]> {
    return this.room.invites(Date.now());
  }

  async uninvite(ledger: string): Promise<void> {
    this.room.uninvite(ledger);
  }

  async mayInvite(day: string, limit: number): Promise<boolean> {
    return this.room.mayInvite(day, limit);
  }
}
