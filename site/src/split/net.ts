/**
 * 两清's server as a phone reaches it: making a ledger, sending changes, the live connection that
 * brings what other phones record, the owner's three requests (a new key, the lock, deleting it),
 * the signed-in account's own list of ledgers, and invitations to friends. What is said at each address is the server's
 * own file, tools/split/src/room/protocol.ts. When to call any of this is syncer.ts and
 * syncing.ts; this is only the calls.
 *
 * Only an answer that is recognisably the server's counts. No signal, a timeout, a hotel's sign-in
 * page, a firewall's refusal, the server's own bad day: all of these are "no answer" (status 0),
 * and the syncer tries again later. So a phone is never told its key is wrong by something that
 * isn't the server.
 */
import { KINDS } from "./photos";
import { asDone, asInvitations, asInviteSent, asItemsReply, asMine, asPushed, asReadReply, asReminded, asSince, asSnapshot, isRecord, isText, type Mine, type Since } from "./shape";
import type { Net, Reply } from "./syncer";

const API = "/split/api";
const KEY_HEADER = "x-split-key";
const VIEW_HEADER = "x-split-view";
/** the owner's key: sent when the ledger is made, and on the owner's two requests (which carry it instead of the key) */
const OWNER_HEADER = "x-split-owner";
/** the key the owner is changing to */
const NEXT_HEADER = "x-split-next";
const LIVE_PROTOCOL = "split.v1";
/** How long a request may take before it counts as no answer. */
const PATIENCE = 15_000;
/** The live connection is asked "ping" this often; one that never answered by the next time is a dead one. */
const PING_EVERY = 25_000;
/** Back in front after the phone slept, a line that doesn't answer within this is a dead one. */
const ANSWER_WITHIN = 4_000;
/** What the server closes a live connection with when the ledger's key was changed, and when its owner deleted it (its worker.ts). */
const KEY_CHANGED = 4403;
const DELETED = 4404;
/** How the server says no (ErrorCode and ApiError in its protocol.ts). */
const REFUSALS = ["gone", "exists", "bad", "key", "full", "limit", "notfound", "owner", "locked", "signin"];
/** How the server says no to a reminder by mail (its protocol.ts, ApiError). */
const REMINDING = ["again", "today", "settled", "me", "to"];

/**
 * Where the site keeps its sign-in on the phone (site/src/lib/api.ts, `TOKEN`: the same name, and a
 * test checks they agree). Read here rather than imported, so this file runs where the tests run.
 */
export const SESSION_KEY = "changle.session";
/** The site's sign-in, as a header for the server; none when nobody is signed in. */
function signedIn(): Record<string, string> {
  try {
    const token = localStorage.getItem(SESSION_KEY) ?? "";
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * One request. `keys` are the headers that carry keys and the sign-in (a key is never in an
 * address or a body); with a `body` it is a POST of that unless another method is given.
 */
async function ask<T>(path: string, keys: Record<string, string>, read: (x: unknown) => T | null, body?: unknown, method = body !== undefined ? "POST" : "GET"): Promise<Reply<T>> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), PATIENCE);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body === undefined ? keys : { ...keys, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: ctl.signal,
    });
    const said: unknown = await res.json();
    if (res.ok) {
      const data = read(said);
      return data ? { status: res.status, data } : { status: 0 };
    }
    // the server's own refusals name themselves; anything else that says no isn't the server
    if (res.status >= 500 || !isRecord(said) || !isText(said.error) || !REFUSALS.includes(said.error)) return { status: 0 };
    // ("notfound" is an address the server doesn't have, which is this page's mistake, not a ledger that is gone)
    return { status: said.error === "notfound" ? 400 : res.status };
  } catch {
    return { status: 0 };
  } finally {
    window.clearTimeout(timer);
  }
}

const listen: Net["listen"] = (id, key, on, down) => {
  let ended = false;
  let opened = false;
  /** asked "ping", and nothing has come back since */
  let unanswered = false;
  let ws: WebSocket | null = null;
  let beat = 0;
  let check = 0;

  const close = () => {
    window.clearInterval(beat);
    window.clearTimeout(check);
    document.removeEventListener("visibilitychange", onFront);
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close(1000);
    } catch {
      // closed already
    }
  };
  const end = (status: number) => {
    if (ended) return;
    ended = true;
    close();
    down(status);
  };
  const ping = () => {
    unanswered = true;
    try {
      ws?.send("ping");
    } catch {
      end(0);
    }
  };
  /** The page is in front again. A phone that slept may be holding a line that ended while it did: ask, and see. */
  function onFront() {
    if (document.visibilityState !== "visible" || !opened || ended) return;
    ping();
    window.clearTimeout(check);
    check = window.setTimeout(() => unanswered && end(0), ANSWER_WITHIN);
  }

  try {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${API}/ledgers/${id}/live`, [LIVE_PROTOCOL, key]);
  } catch {
    queueMicrotask(() => end(0));
    return () => {
      ended = true;
    };
  }
  ws.onopen = () => {
    opened = true;
    beat = window.setInterval(() => (unanswered ? end(0) : ping()), PING_EVERY);
    document.addEventListener("visibilitychange", onFront);
  };
  ws.onmessage = (e) => {
    // (anything at all from the server shows the line is alive)
    unanswered = false;
    if (typeof e.data !== "string" || e.data === "pong") return;
    try {
      const said: unknown = JSON.parse(e.data);
      const snapshot = isRecord(said) && said.t === "ledger" ? asSnapshot(said) : null;
      if (snapshot) on(snapshot);
    } catch {
      // not the server's
    }
  };
  ws.onclose = (e) => {
    if (opened && e.code !== KEY_CHANGED && e.code !== DELETED) return end(0);
    window.clearInterval(beat);
    // Refused before it opened, and a browser doesn't say why; or let go because the key was
    // changed, or the ledger deleted. Ask for the ledger once: the answer tells a key that no
    // longer opens it (403) and a ledger that is gone (404) from no signal.
    void ask(`/ledgers/${id}`, { [KEY_HEADER]: key }, asSnapshot).then((got) => end(got.status === 403 || got.status === 404 ? got.status : 0));
  };
  return () => {
    if (ended) return;
    ended = true;
    close();
  };
};

/** The real network. (The tests hand the syncer a made-up one: tests/split-sync.test.ts.) */
export const net: Net = {
  // (signed in, the ledger goes into the account's list as it is made: the server does that)
  make: (key, body, owner) => ask("/ledgers", { ...signedIn(), [KEY_HEADER]: key, ...(owner ? { [OWNER_HEADER]: owner } : {}) }, asSnapshot, body),
  read: (id, key) => ask(`/ledgers/${id}`, { [KEY_HEADER]: key }, asSnapshot),
  push: (id, key, changes) => ask(`/ledgers/${id}/changes`, { [KEY_HEADER]: key }, (x) => asPushed(x, changes.length), { changes }),
  rekey: (id, owner, next) => ask(`/ledgers/${id}/key`, { [OWNER_HEADER]: owner, [NEXT_HEADER]: next }, asSnapshot, undefined, "POST"),
  lock: (id, owner, locked) => ask(`/ledgers/${id}/lock`, { [OWNER_HEADER]: owner }, asSnapshot, { locked }),
  listen,
};

/**
 * A ledger's 查看链接: made (or made again, the same) with the ledger's key, its own key in a header
 * of its own; and the ledger read with that key, which is all it does (tools/split/src/room/protocol.ts).
 */
export const viewNet = {
  make: (id: string, key: string, view: string): Promise<Reply<true>> => ask(`/ledgers/${id}/view`, { [KEY_HEADER]: key, [VIEW_HEADER]: view }, asDone, undefined, "PUT"),
  look: (id: string, view: string) => ask(`/ledgers/${id}`, { [KEY_HEADER]: view }, asSnapshot),
};

/** The ledger's record after change `seq` (0: from the start), at most a batch of it (the server's MAX_BATCH, 500). */
export const recordNet = (id: string, key: string, seq: number): Promise<Reply<Since>> => ask(`/ledgers/${id}?since=${seq}`, { [KEY_HEADER]: key }, asSince);

/** A file's request: what the server said (its status, and the error it named when it said no), and the answer. 0: no answer. */
export type FileReply<T> = { status: number; error?: string; data?: T };

/** One request about a ledger's files, the key (and the sign-in, to store one) in headers. Only the server's own answers count. */
async function fileAsk<T>(path: string, method: string, keys: Record<string, string>, read: (res: Response) => Promise<T | null>, body?: Blob, type?: string, patience = PATIENCE): Promise<FileReply<T>> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), patience);
  try {
    const res = await fetch(`${API}${path}`, { method, headers: { ...keys, ...(type ? { "content-type": type } : {}) }, body, signal: ctl.signal });
    if (res.ok) {
      const data = await read(res);
      return data === null ? { status: 0 } : { status: res.status, data };
    }
    const said: unknown = await res.json().catch(() => null);
    if (res.status >= 500 || !isRecord(said) || !isText(said.error) || ![...REFUSALS, "quota", "big", "friends", "off", "budget", ...REMINDING].includes(said.error)) return { status: 0 };
    return { status: res.status, error: said.error };
  } catch {
    return { status: 0 };
  } finally {
    window.clearTimeout(timer);
  }
}

/** A stored file as the server answers: its id, and the bytes the sender's account now uses of its quota. */
export type Stored = { id: string; used: number; quota: number };
const asStored = async (res: Response): Promise<Stored | null> => {
  const x: unknown = await res.json().catch(() => null);
  if (!isRecord(x) || !isRecord(x.file) || !isText(x.file.id) || typeof x.used !== "number" || typeof x.quota !== "number") return null;
  return { id: x.file.id, used: x.used, quota: x.quota };
};

/** A receipt read by the server (signed in, with the key: tools/split/src/room/protocol.ts): what it says was paid. Google can take a few seconds. */
export const readNet = (id: string, key: string, file: string) =>
  fileAsk(`/ledgers/${id}/files/${file}/read`, "POST", { ...signedIn(), [KEY_HEADER]: key }, async (res) => asReadReply(await res.json().catch(() => null)), undefined, undefined, 40_000);

/** 小票逐项分: a receipt's lines, read at the server (signed in, with the key). */
export const itemsNet = (id: string, key: string, file: string) =>
  fileAsk(`/ledgers/${id}/files/${file}/items`, "POST", { ...signedIn(), [KEY_HEADER]: key }, async (res) => asItemsReply(await res.json().catch(() => null)), undefined, undefined, 40_000);

/** A ledger's files at the server: one stored (signed in; a photo can take a while on a slow line), read back as it is, or taken off. */
export const fileNet = {
  put: (id: string, key: string, file: string, blob: Blob, type: string) => fileAsk(`/ledgers/${id}/files/${file}`, "PUT", { ...signedIn(), [KEY_HEADER]: key }, asStored, blob, type, 60_000),
  // (only a kind of file the server keeps: anything else is not its answer, as a hotel's sign-in page isn't)
  get: (id: string, key: string, file: string) =>
    fileAsk(`/ledgers/${id}/files/${file}`, "GET", { [KEY_HEADER]: key }, async (res) => res.blob().then((b) => (KINDS.includes(b.type) ? b : null)), undefined, undefined, 60_000),
  drop: (id: string, key: string, file: string) => fileAsk(`/ledgers/${id}/files/${file}`, "DELETE", { [KEY_HEADER]: key }, async () => true as const),
};

/** How many of an account's files, and how big. */
export type Room = { count: number; bytes: number };
/**
 * An account's room for photos, as the storage page shows it (the server's MyFiles,
 * tools/split/src/room/protocol.ts): the bytes used of the quota, how many no expense uses, and each
 * ledger they are in, the most first.
 */
export type MyRoom = { used: number; quota: number; unused: Room; ledgers: ({ id: string } & Room & { unused: Room })[] };
const isBytes = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isRoom = (x: unknown): x is Room => isRecord(x) && isBytes(x.count) && isBytes(x.bytes);
const asMyRoom = async (res: Response): Promise<MyRoom | null> => {
  const x: unknown = await res.json().catch(() => null);
  if (!isRecord(x) || !isBytes(x.used) || !isBytes(x.quota) || !isRoom(x.unused) || !Array.isArray(x.ledgers)) return null;
  const ledgers: MyRoom["ledgers"] = [];
  for (const l of x.ledgers as unknown[]) {
    if (!isRecord(l) || !isText(l.id) || !isBytes(l.count) || !isBytes(l.bytes) || !isRoom(l.unused)) return null;
    ledgers.push({ id: l.id, count: l.count, bytes: l.bytes, unused: { count: l.unused.count, bytes: l.unused.bytes } });
  }
  return { used: x.used, quota: x.quota, unused: { count: x.unused.count, bytes: x.unused.bytes }, ledgers };
};
/** The signed-in account's room for photos: how much is used; and its photos no expense uses, cleared now (the answer is the room as it is then). */
export const roomNet = {
  get: () => fileAsk("/me/files", "GET", signedIn(), asMyRoom),
  clear: () => fileAsk("/me/files/unused", "DELETE", signedIn(), asMyRoom),
};

/** The owner deletes a ledger, for everyone. (Signed in, it leaves the owner's list too: the server does that.) */
export const deleteLedger = (id: string, owner: string): Promise<Reply<true>> => ask(`/ledgers/${id}`, { ...signedIn(), [OWNER_HEADER]: owner }, asDone, undefined, "DELETE");

/** The signed-in account's own list of ledgers ("my ledgers"), on the server. Every request carries the site's sign-in. */
export const mineNet = {
  list: (): Promise<Reply<Mine[]>> => ask("/me/ledgers", signedIn(), asMine),
  /** keep one in the list, or bring it up to date: its key (which has to open it), the owner's key if this phone has it, who they are in it (null: nobody) */
  put: (id: string, key: string, owner: string | undefined, me: string | null): Promise<Reply<Mine>> =>
    ask(`/me/ledgers/${id}`, { ...signedIn(), [KEY_HEADER]: key, ...(owner ? { [OWNER_HEADER]: owner } : {}) }, (x) => (isRecord(x) ? (asMine({ ledgers: [x.mine] })?.[0] ?? null) : null), { me }, "PUT"),
  drop: (id: string): Promise<Reply<true>> => ask(`/me/ledgers/${id}`, signedIn(), asDone, undefined, "DELETE"),
};
export type MineNet = typeof mineNet;

/** A request with a JSON body, as fileAsk sends one. */
const asJson = (body: unknown) => new Blob([JSON.stringify(body)]);
const read = <T>(as: (x: unknown) => T | null) => async (res: Response) => as(await res.json().catch(() => null));

/**
 * Invitations to friends on changle.ca. One is sent signed in, with the ledger's key, to a friend's
 * account, with the person in the ledger they are when the phone knows (what came of it, or the
 * error the server named: "friends", "locked", "limit", "signin"…). And the signed-in account's own:
 * the ones waiting for it, and one it says no to.
 */
export const inviteNet = {
  send: (id: string, key: string, to: string, member?: string) =>
    fileAsk(`/ledgers/${id}/invites`, "POST", { ...signedIn(), [KEY_HEADER]: key }, read(asInviteSent), asJson({ to, ...(member ? { member } : {}) }), "application/json"),
  waiting: () => fileAsk("/me/invites", "GET", signedIn(), read(asInvitations)),
  drop: (id: string) => fileAsk(`/me/invites/${id}`, "DELETE", signedIn(), read(asDone)),
};

/**
 * 催一下 by mail: the site sends the reminder (signed in, with the key: tools/split, remind). Whom
 * (the person in the ledger), the address, and the language; what came of it, or the error the
 * server named ("again", "limit", "today", "settled", "me", "to", "signin"…). Everything the mail
 * says, the server writes.
 */
export const remindNet = (id: string, key: string, member: string, to: string, lang: "zh" | "en") =>
  fileAsk(`/ledgers/${id}/remind`, "POST", { ...signedIn(), [KEY_HEADER]: key }, read(asReminded), asJson({ member, to, lang }), "application/json");
