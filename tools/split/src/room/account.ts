// One changle.ca account's ledgers on the server ("my ledgers"): the ones its holder started, and
// the ones they joined and keep. Each comes with the key that opens it, the owner's key for the
// ones they started, and which person in it they are. So a new phone signed in to the same account
// opens them all again, and is still the owner where they were. Plain logic over a small store,
// tested without Cloudflare (tests/room.test.ts); the Durable Object in src/server/worker.ts keeps
// the store in SQLite, one per account.
//
// The keys are kept here as they are, not as fingerprints like in a ledger: that is the point, a
// phone that has never seen the invitation gets them back from here. Only the account's own
// sign-in reads them (src/server/worker.ts, `GET /me/ledgers`).
//
// Whether a key opens its ledger, and whether an owner's key is its owner's, is the Worker's to
// check with the ledger before anything is kept here.
//
// The account's room for receipt photos and files (the plan's 每人 500 MB): every file it has sent
// that is still kept somewhere, which ledger and how big. A file is charged here before it goes in
// the bucket, and the room comes back when it is taken off, or its ledger is deleted.

/** One of an account's ledgers. `owner`: the owner's key, for a ledger they started. `me`: the id of the person in it they are. `at`: when it was first kept. */
export type Mine = { id: string; key: string; owner?: string; me?: string; at: number };

export interface AccountStore {
  /** Every ledger kept, the last one kept first. */
  list(): Mine[];
  get(id: string): Mine | null;
  put(mine: Mine): void;
  drop(id: string): void;
  count(): number;
  /** Ledgers started on this day (a date, "2026-11-14"). */
  used(day: string): number;
  /** One more started on this day. Days before it are forgotten. */
  use(day: string): void;
  fileOf(ledger: string, id: string): AccountFile | null;
  addFile(file: AccountFile): void;
  dropFile(ledger: string, id: string): void;
  /** Every file kept, the first sent first. */
  files(): AccountFile[];
  /** Files sent on this day (a date). */
  uploads(day: string): number;
  /** One more sent on this day. Days before it are forgotten. */
  upload(day: string): void;
}

/** Ledgers one account keeps. Far more than anyone travels with; it stops a runaway phone, not a person. */
export const MAX_MINE = 300;
/** Ledgers one account may start in a day. */
export const STARTS_PER_DAY = 10;
/** Files one account may send in a day: a trip's worth of receipts many times over. It stops a runaway phone. */
export const UPLOADS_PER_DAY = 200;

/** A file this account sent, still kept: in which ledger, its id there, its size in bytes, and when. */
export type AccountFile = { ledger: string; id: string; size: number; at: number };
/** How much of its room an account's files use: in all, and in each ledger (the most first). */
export type Storage = { used: number; quota: number; ledgers: { id: string; bytes: number; count: number }[] };
export type Reserved = { ok: true; used: number; fresh: boolean } | { ok: false; error: "quota" | "limit" };

export type Kept = { ok: true; mine: Mine } | { ok: false; error: "full" };

export class AccountRoom {
  constructor(private store: AccountStore) {}

  list(): Mine[] {
    return this.store.list();
  }

  /**
   * Keep a ledger in this account's list, or bring the one kept up to date. The key is always the
   * one given (a new key replaces an old one). The owner's key and who they are: given, they
   * replace what was kept; null takes away who they are; not given, what was kept stays. So a
   * phone of the account's that doesn't hold the owner's key can't take it from the others.
   */
  keep(input: { id: string; key: string; owner?: string | null; me?: string | null; now: number }): Kept {
    const was = this.store.get(input.id);
    if (!was && this.store.count() >= MAX_MINE) return { ok: false, error: "full" };
    const owner = typeof input.owner === "string" ? input.owner : was?.owner;
    const me = input.me === null ? undefined : typeof input.me === "string" ? input.me : was?.me;
    const mine: Mine = { id: input.id, key: input.key, ...(owner ? { owner } : {}), ...(me ? { me } : {}), at: was?.at ?? input.now };
    if (!was || JSON.stringify(was) !== JSON.stringify(mine)) this.store.put(mine);
    return { ok: true, mine };
  }

  /** No longer in this account's list. (The ledger itself is untouched.) */
  drop(id: string): void {
    this.store.drop(id);
  }

  /** One more ledger started today, when today's allowance isn't used up; false when it is. */
  take(day: string, limit: number): boolean {
    if (this.store.used(day) >= limit) return false;
    this.store.use(day);
    return true;
  }

  /** Bytes this account's files use. */
  used(): number {
    return this.store.files().reduce((a, f) => a + f.size, 0);
  }

  /**
   * Room for one more file: charged to this account, unless it already is (the same file, sent
   * again: `fresh` false). Refused when it would take the account past `quota` ("quota"), or
   * today's files are used up ("limit"). What comes back is the bytes used, this one counted.
   */
  reserve(input: { ledger: string; id: string; size: number; now: number; day: string; quota: number }): Reserved {
    const used = this.used();
    if (this.store.fileOf(input.ledger, input.id)) return { ok: true, used, fresh: false };
    if (used + input.size > input.quota) return { ok: false, error: "quota" };
    if (this.store.uploads(input.day) >= UPLOADS_PER_DAY) return { ok: false, error: "limit" };
    this.store.upload(input.day);
    this.store.addFile({ ledger: input.ledger, id: input.id, size: input.size, at: input.now });
    return { ok: true, used: used + input.size, fresh: true };
  }

  /** Files of one ledger no longer kept (taken off, or the ledger deleted): their room is the account's again. The bytes used now. */
  release(ledger: string, ids: string[]): number {
    for (const id of ids) this.store.dropFile(ledger, id);
    return this.used();
  }

  /** How much of `quota` this account's files use, in all and in each ledger, the most first. */
  storage(quota: number): Storage {
    const by = new Map<string, { bytes: number; count: number }>();
    for (const f of this.store.files()) {
      const was = by.get(f.ledger) ?? { bytes: 0, count: 0 };
      by.set(f.ledger, { bytes: was.bytes + f.size, count: was.count + 1 });
    }
    const ledgers = [...by].map(([id, n]) => ({ id, ...n })).sort((a, b) => b.bytes - a.bytes || (a.id < b.id ? -1 : 1));
    return { used: ledgers.reduce((a, l) => a + l.bytes, 0), quota, ledgers };
  }
}

/** A store that lives only as long as the test does. */
export function memoryAccountStore(): AccountStore & { days: Map<string, number>; sent: Map<string, number> } {
  const kept = new Map<string, Mine>();
  const days = new Map<string, number>();
  const files = new Map<string, AccountFile>();
  const sent = new Map<string, number>();
  const at = (ledger: string, id: string) => `${ledger}/${id}`;
  let order = 0;
  const when = new Map<string, number>();
  return {
    days,
    sent,
    fileOf: (ledger, id) => (files.has(at(ledger, id)) ? structuredClone(files.get(at(ledger, id))!) : null),
    addFile(f) {
      files.set(at(f.ledger, f.id), structuredClone(f));
    },
    dropFile(ledger, id) {
      files.delete(at(ledger, id));
    },
    files: () => [...files.values()].map((f) => structuredClone(f)),
    uploads: (day) => sent.get(day) ?? 0,
    upload(day) {
      const n = (sent.get(day) ?? 0) + 1;
      sent.clear();
      sent.set(day, n);
    },
    // (as the SQLite store orders them: the last first kept first, and among those kept the same moment, the last put)
    list: () => [...kept.values()].sort((a, b) => b.at - a.at || (when.get(b.id) ?? 0) - (when.get(a.id) ?? 0)).map((m) => structuredClone(m)),
    get: (id) => (kept.has(id) ? structuredClone(kept.get(id)!) : null),
    put(mine) {
      if (!kept.has(mine.id)) when.set(mine.id, ++order);
      kept.set(mine.id, structuredClone(mine));
    },
    drop(id) {
      kept.delete(id);
      when.delete(id);
    },
    count: () => kept.size,
    used: (day) => days.get(day) ?? 0,
    use(day) {
      const n = (days.get(day) ?? 0) + 1;
      days.clear();
      days.set(day, n);
    },
  };
}
