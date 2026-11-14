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
//
// Its owner is the phone that made it, which holds a second key nobody else is given. That key
// opens three doors only: changing the invitation's key (the old one is turned away from then on),
// locking the ledger (it can be read, and takes no changes, until the owner opens it again), and
// deleting it. A deleted ledger is gone for everyone, and its id can't be used for another.
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
  /** the fingerprint of its owner's key; a ledger made before there were owners has none, and no owner */
  ownerHash?: string;
  madeAt: number;
  /** how many changes have counted: the last one's number */
  seq: number;
  /** how many changes it has been sent, counted or not */
  sent: number;
};
/**
 * One line of the record: a change that counted (its number, when the server took it, and the
 * change as it was sent), or the ledger being locked or opened again by its owner.
 */
export type LoggedChange = { seq: number; at: number; sent: Sent };
export type LoggedLock = { seq: number; at: number; lock: boolean };
export type Logged = LoggedChange | LoggedLock;
export type Snapshot = { seq: number; ledger: Ledger };

export interface Store {
  load(): { meta: Meta; ledger: Ledger } | null;
  save(meta: Meta, ledger: Ledger): void;
  /** Has this ledger been sent a change with this id, and did it count? Undefined when it hasn't. */
  seen(id: string): boolean | undefined;
  /** Remember a change's id and whether it counted, and the change itself when it did. */
  keep(id: string, logged: LoggedChange | null): void;
  /** Add a line to the record that is no phone's change (the ledger locked, or opened again). */
  note(logged: LoggedLock): void;
  /** The changes that counted after number `seq`, oldest first, at most `limit` of them. */
  since(seq: number, limit: number): Logged[];
  /** Everything kept for this ledger is deleted, and only when it was deleted is kept. */
  wipe(now: number): void;
  /** When this ledger was deleted; null when it wasn't. */
  buried(): number | null;
}

/** "owner": not the owner's key (or the ledger has no owner). "locked": the ledger is locked and this would change it. */
export type ErrorCode = "gone" | "exists" | "bad" | "key" | "full" | "owner" | "locked";
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

  /** Is this the owner's key? (No key is, for a ledger with no owner.) */
  owns(ownerHash: string | null): boolean {
    return this.meta?.ownerHash !== undefined && ownerHash !== null && ownerHash === this.meta.ownerHash;
  }

  snapshot(): Snapshot | null {
    return this.meta && this.ledger ? { seq: this.meta.seq, ledger: this.ledger } : null;
  }

  /**
   * A new ledger, opened by this key from now on, and owned by whoever holds the owner's key (when
   * one is given). Asked for again with the same key (a phone that wasn't sure its request
   * arrived), it is the ledger already made, as it stands now, with the owner it had.
   */
  create(input: { id: unknown; name: unknown; currency: unknown; members: unknown; keyHash: string; ownerHash?: string | null; now: number }): Ok<Snapshot> | Fail {
    // (a deleted ledger's id isn't made into another: the phones that had it would open a stranger's)
    if (this.store.buried() !== null) return fail("gone");
    if (this.meta) return this.meta.keyHash === input.keyHash ? { ok: true, ...this.snapshot()! } : fail("exists");
    const ledger = newLedger(input);
    // (the owner's key is nobody else's: never the one that goes out in the invitation)
    if (!ledger || input.ownerHash === input.keyHash) return fail("bad");
    this.meta = { keyHash: input.keyHash, ...(input.ownerHash ? { ownerHash: input.ownerHash } : {}), madeAt: input.now, seq: 0, sent: 0 };
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
    // Locked, it takes nothing new. What it took before it still answers for: a phone whose answer
    // was lost has to hear that its change is in, or it would say the change is stuck outside.
    if (this.ledger.locked !== undefined && fresh.size) return fail("locked");
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

  /**
   * The owner changes the key: from now on only the new one opens the ledger, and the old
   * invitation is turned away. Nothing in the ledger changes. Asked again with the same new key
   * (the answer was lost), it is already so.
   */
  rekey(ownerHash: string | null, nextHash: string): Ok<Snapshot & { changed: boolean }> | Fail {
    if (!this.meta || !this.ledger) return fail("gone");
    if (!this.owns(ownerHash)) return fail("owner");
    if (nextHash === this.meta.ownerHash) return fail("bad");
    const changed = nextHash !== this.meta.keyHash;
    if (changed) {
      this.meta = { ...this.meta, keyHash: nextHash };
      this.store.save(this.meta, this.ledger);
    }
    return { ok: true, ...this.snapshot()!, changed };
  }

  /**
   * The owner locks the ledger, or opens it again. It is something everyone sees in the ledger, so
   * it has a number of its own and a line in the record, like a change. Asked for what is already
   * so, nothing happens (a ledger locked twice keeps the time it was first locked).
   */
  lock(ownerHash: string | null, locked: unknown, now: number): Ok<Snapshot & { changed: boolean }> | Fail {
    if (!this.meta || !this.ledger) return fail("gone");
    if (!this.owns(ownerHash)) return fail("owner");
    if (typeof locked !== "boolean") return fail("bad");
    if (locked === (this.ledger.locked !== undefined)) return { ok: true, ...this.snapshot()!, changed: false };
    const { locked: _since, ...open } = this.ledger;
    const ledger: Ledger = locked ? { ...open, locked: now } : open;
    const meta = { ...this.meta, seq: this.meta.seq + 1 };
    this.store.note({ seq: meta.seq, at: now, lock: locked });
    this.meta = meta;
    this.ledger = ledger;
    this.store.save(meta, ledger);
    return { ok: true, ...this.snapshot()!, changed: true };
  }

  /**
   * The owner deletes the ledger: everything kept for it goes, and from then on it is gone for
   * everyone (404), the owner included. There is no undoing it.
   */
  wipe(ownerHash: string | null, now: number): Ok | Fail {
    if (!this.meta || !this.ledger) return fail("gone");
    if (!this.owns(ownerHash)) return fail("owner");
    this.store.wipe(now);
    this.meta = null;
    this.ledger = null;
    return { ok: true };
  }

  /** The record after number `seq` (who changed what, in order, and when it was locked or opened), at most MAX_BATCH lines at a time. */
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
  let buried: number | null = null;
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
    note(logged) {
      log.push(structuredClone(logged));
    },
    since: (seq, limit) => log.filter((l) => l.seq > seq).slice(0, limit),
    wipe(now) {
      kept = null;
      ids.clear();
      log.length = 0;
      buried = now;
    },
    buried: () => buried,
  };
}
