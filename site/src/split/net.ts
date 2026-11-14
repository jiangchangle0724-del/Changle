/**
 * 两清's server as a phone reaches it: making a ledger, sending changes, the live connection that
 * brings what other phones record, and the owner's two requests (a new key, the lock). What is said at each address is the server's own file,
 * tools/split/src/room/protocol.ts. When to call any of this is syncer.ts; this is only the calls.
 *
 * Only an answer that is recognisably the server's counts. No signal, a timeout, a hotel's sign-in
 * page, a firewall's refusal, the server's own bad day: all of these are "no answer" (status 0),
 * and the syncer tries again later. So a phone is never told its key is wrong by something that
 * isn't the server.
 */
import { asPushed, asSnapshot, isRecord, isText } from "./shape";
import type { Net, Reply } from "./syncer";

const API = "/split/api";
const KEY_HEADER = "x-split-key";
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
/** What the server closes a live connection with when the ledger's key was changed (its worker.ts). */
const KEY_CHANGED = 4403;
/** How the server says no (ErrorCode and ApiError in its protocol.ts). */
const REFUSALS = ["gone", "exists", "bad", "key", "full", "limit", "notfound", "owner", "locked"];

/**
 * One request. `keys` are the headers that carry keys (a key is never in an address or a body);
 * with a `body` it is a POST of that, and `post` makes it a POST with nothing in it.
 */
async function ask<T>(path: string, keys: Record<string, string>, read: (x: unknown) => T | null, body?: unknown, post = body !== undefined): Promise<Reply<T>> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), PATIENCE);
  try {
    const res = await fetch(`${API}${path}`, {
      method: post ? "POST" : "GET",
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
    if (opened && e.code !== KEY_CHANGED) return end(0);
    window.clearInterval(beat);
    // Refused before it opened, and a browser doesn't say why; or let go because the key was
    // changed. Ask for the ledger once: the answer tells a key that no longer opens it (403) and a
    // ledger that is gone (404) from no signal.
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
  make: (key, body, owner) => ask("/ledgers", owner ? { [KEY_HEADER]: key, [OWNER_HEADER]: owner } : { [KEY_HEADER]: key }, asSnapshot, body),
  read: (id, key) => ask(`/ledgers/${id}`, { [KEY_HEADER]: key }, asSnapshot),
  push: (id, key, changes) => ask(`/ledgers/${id}/changes`, { [KEY_HEADER]: key }, (x) => asPushed(x, changes.length), { changes }),
  rekey: (id, owner, next) => ask(`/ledgers/${id}/key`, { [OWNER_HEADER]: owner, [NEXT_HEADER]: next }, asSnapshot, undefined, true),
  lock: (id, owner, locked) => ask(`/ledgers/${id}/lock`, { [OWNER_HEADER]: owner }, asSnapshot, { locked }),
  listen,
};
