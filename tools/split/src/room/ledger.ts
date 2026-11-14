// One ledger on the server: the ledger itself, the key that opens it, and every change it has been
// sent. Plain logic over a small store, so the tests run it without Cloudflare; the Durable Object
// in src/server/worker.ts wraps it and keeps the store in SQLite.
//
// The rules for a change (what it does, that it counts once, what is refused) are not here: they
// are the phone's own, in site/src/split/changes.ts, so the phone and the server can't disagree.
// What is here is what only a server has: who may open the ledger, the order changes arrived in,
// and the record of them.
//
// Who may open it: whoever holds the key in the invitation link. The room never keeps the key,
// only its SHA-256 fingerprint.
import { accept, parseSent, type Sent, type Took } from "../../../../site/src/split/changes";
import { MAX_MEMBERS, type Ledger, type Member } from "../../../../site/src/split/core";
import { NAME_MAX, startLedger, tidy } from "../../../../site/src/split/ops";
import { CURRENCY_BY_CODE } from "../../../../site/src/tools/money";

/** Changes one request may carry. */
export const MAX_BATCH = 500;
/** Changes one ledger remembers having been sent, counted or not. Past this it takes no more. */
export const MAX_SENT = 20_000;
/** A ledger's id, as phones make them and the site's address takes them (site/src/router.ts). */
export const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MEMBER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TEXT_MOST = 400;

export type Meta = {
  /** the fingerprint of the key that opens this ledger */
  keyHash: string;
  madeAt: number;
  /** how many changes have counted: the last one's number */
  seq: number;
  /** how many changes it has been sent, counted or not */
  sent: number;
};
/** A change that counted: its number, when the server took it, and the change as it was sent. */
export type Logged = { seq: number; at: number; sent: Sent };
export type Snapshot = { seq: number; ledger: Ledger };

export interface Store {
  load(): { meta: Meta; ledger: Ledger } | null;
  save(meta: Meta, ledger: Ledger): void;
  /** Has this ledger been sent a change with this id, and did it count? Undefined when it hasn't. */
  seen(id: string): boolean | undefined;
  /** Remember a change's id and whether it counted, and the change itself when it did. */
  keep(id: string, logged: Logged | null): void;
  /** The changes that counted after number `seq`, oldest first, at most `limit` of them. */
  since(seq: number, limit: number): Logged[];
}

export type ErrorCode = "gone" | "exists" | "bad" | "key" | "full";
export type Fail = { ok: false; error: ErrorCode };
export type Ok<T = object> = { ok: true } & T;
const fail = (error: ErrorCode): Fail => ({ ok: false, error });

/** The ledger a phone asks to have made, or null when it isn't one: two to thirty people with names of their own, a currency the site knows. */
function newLedger(x: { id: unknown; name: unknown; currency: unknown; members: unknown }): Ledger | null {
  if (typeof x.id !== "string" || !ID_RE.test(x.id) || typeof x.name !== "string" || x.name.length > TEXT_MOST) return null;
  if (typeof x.currency !== "string" || !Object.hasOwn(CURRENCY_BY_CODE, x.currency)) return null;
  if (!Array.isArray(x.members) || x.members.length < 2 || x.members.length > MAX_MEMBERS) return null;
  const members: Member[] = [];
  for (const m of x.members as unknown[]) {
    if (typeof m !== "object" || m === null) return null;
    const { id, name } = m as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || !MEMBER_ID.test(id) || typeof name !== "string" || name.length > TEXT_MOST) return null;
    const kept = tidy(name, NAME_MAX);
    if (!kept || members.some((y) => y.id === id || y.name.toLowerCase() === kept.toLowerCase())) return null;
    members.push({ id, name: kept });
  }
  const ledger = startLedger(x.id, x.name, x.currency, members);
  return ledger.name ? ledger : null;
}

export class LedgerRoom {
  private meta: Meta | null = null;
  private ledger: Ledger | null = null;

  constructor(private store: Store) {
    const kept = store.load();
    if (kept) {
      this.meta = kept.meta;
      this.ledger = kept.ledger;
    }
  }

  /** Does this key open the ledger? (No key opens one that isn't there.) */
  opens(keyHash: string | null): boolean {
    return this.meta !== null && keyHash !== null && keyHash === this.meta.keyHash;
  }

  snapshot(): Snapshot | null {
    return this.meta && this.ledger ? { seq: this.meta.seq, ledger: this.ledger } : null;
  }

  /**
   * A new ledger, opened by this key from now on. Asked for again with the same key (a phone that
   * wasn't sure its request arrived), it is the ledger already made, as it stands now.
   */
  create(input: { id: unknown; name: unknown; currency: unknown; members: unknown; keyHash: string; now: number }): Ok<Snapshot> | Fail {
    if (this.meta) return this.meta.keyHash === input.keyHash ? { ok: true, ...this.snapshot()! } : fail("exists");
    const ledger = newLedger(input);
    if (!ledger) return fail("bad");
    this.meta = { keyHash: input.keyHash, madeAt: input.now, seq: 0, sent: 0 };
    this.ledger = ledger;
    this.store.save(this.meta, ledger);
    return { ok: true, ...this.snapshot()! };
  }

  read(keyHash: string | null): Ok<Snapshot> | Fail {
    if (!this.meta) return fail("gone");
    return this.opens(keyHash) ? { ok: true, ...this.snapshot()! } : fail("key");
  }

  /**
   * Take what one phone sent: its changes, oldest first. They are taken in that order, each one
   * counting once however often it is sent. A request with anything in it that isn't a change is
   * turned away whole, so a phone never has half of what it sent taken.
   */
  push(keyHash: string | null, raw: unknown, now: number): Ok<Snapshot & { took: Took[] }> | Fail {
    if (!this.meta || !this.ledger) return fail("gone");
    if (!this.opens(keyHash)) return fail("key");
    if (!Array.isArray(raw) || raw.length > MAX_BATCH) return fail("bad");
    const sent: Sent[] = [];
    for (const x of raw as unknown[]) {
      const s = parseSent(x);
      if (!s) return fail("bad");
      sent.push(s);
    }
    const fresh = new Set(sent.map((s) => s.id).filter((id) => this.store.seen(id) === undefined));
    if (this.meta.sent + fresh.size > MAX_SENT) return fail("full");

    const meta = { ...this.meta };
    let ledger = this.ledger;
    const took: Took[] = [];
    // accept() asks whether a change was sent before and says whether this one counted; the
    // store is told below, with the record of it when it did
    const seen = { get: (id: string) => this.store.seen(id), set: () => undefined };
    for (const s of sent) {
      const before = this.store.seen(s.id) !== undefined;
      const got = accept(ledger, seen, s);
      took.push(got.took);
      if (before) continue;
      meta.sent += 1;
      ledger = got.ledger;
      this.store.keep(s.id, got.took === "new" ? { seq: ++meta.seq, at: now, sent: s } : null);
    }
    if (meta.sent !== this.meta.sent) {
      this.meta = meta;
      this.ledger = ledger;
      this.store.save(meta, ledger);
    }
    return { ok: true, ...this.snapshot()!, took };
  }

  /** The changes that counted after number `seq` (the record: who changed what, in order), at most MAX_BATCH at a time. */
  since(keyHash: string | null, seq: unknown): Ok<{ seq: number; changes: Logged[] }> | Fail {
    if (!this.meta) return fail("gone");
    if (!this.opens(keyHash)) return fail("key");
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return fail("bad");
    return { ok: true, seq: this.meta.seq, changes: this.store.since(seq, MAX_BATCH) };
  }
}

/** A store that lives only as long as the test does. */
export function memoryStore(): Store & { ids: Map<string, boolean>; log: Logged[] } {
  let kept: { meta: Meta; ledger: Ledger } | null = null;
  const ids = new Map<string, boolean>();
  const log: Logged[] = [];
  return {
    ids,
    log,
    load: () => (kept ? structuredClone(kept) : null),
    save(meta, ledger) {
      kept = structuredClone({ meta, ledger });
    },
    seen: (id) => ids.get(id),
    keep(id, logged) {
      ids.set(id, logged !== null);
      if (logged) log.push(structuredClone(logged));
    },
    since: (seq, limit) => log.filter((l) => l.seq > seq).slice(0, limit),
  };
}
