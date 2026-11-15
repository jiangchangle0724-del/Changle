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
// the bucket, and the room comes back when it is taken off, or its ledger is deleted. Each night
// it is checked against what the ledgers really keep (the plan's 以实际为准: `settle`). A deleted
// account's everything goes.
//
// Invitations from friends on changle.ca: someone in a ledger invites a friend of theirs, and the
// invitation waits in the friend's account until they join (keeping the ledger takes it away), say
// no, or INVITE_DAYS pass. It carries the ledger's key, as an invitation link does; a key changed
// since makes it one that no longer opens the ledger, as it does a link. Whether the two are
// friends, and whether the key opens the ledger, is the Worker's to check before anything is kept.

/** One of an account's ledgers. `owner`: the owner's key, for a ledger they started. `me`: the id of the person in it they are. `at`: when it was first kept. */
export type Mine = { id: string; key: string; owner?: string; me?: string; at: number };

/** Who sent an invitation, as changle.ca shows them: their account, name, and photo (`av`: its version, 0 for none; `ac`: the colour of their letter). */
export type Sender = { id: string; name: string; av: number; ac?: number };
/**
 * An invitation waiting in an account: to which ledger, with the key that opens it and the
 * ledger's name when it was sent; who sent it; the person in the ledger it is for, when the sender
 * said (the friend is that one, and isn't asked); and when.
 */
export type Invite = { ledger: string; key: string; name: string; from: Sender; member?: string; at: number };
/** What came of inviting someone: a new invitation is waiting for them ("sent"), the same one already was ("again"), or the ledger is one of theirs already ("in"). */
export type Invited = "sent" | "again" | "in";

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
  /** Which account this is (told with the first file it sends, for the nightly check to ask the ledgers by). */
  self(): string | null;
  setSelf(account: string): void;
  /** Invitations waiting for this account, the newest first. */
  invites(): Invite[];
  /** One waiting (it replaces the one to the same ledger). */
  putInvite(invite: Invite): void;
  dropInvite(ledger: string): void;
  /** Invitations this account sent on this day (a date). */
  inviting(day: string): number;
  /** One more sent on this day. Days before it are forgotten. */
  invite(day: string): void;
  /** Everything kept for the account goes. */
  wipe(): void;
}

/** Ledgers one account keeps. Far more than anyone travels with; it stops a runaway phone, not a person. */
export const MAX_MINE = 300;
/** Ledgers one account may start in a day. */
export const STARTS_PER_DAY = 10;
/** Files one account may send in a day: a trip's worth of receipts many times over. It stops a runaway phone. */
export const UPLOADS_PER_DAY = 200;
/** Invitations one account may send in a day, to friends: a few trips' worth of friends. It stops a runaway phone. */
export const INVITES_PER_DAY = 50;
/** How long an invitation waits for its friend, in days. */
export const INVITE_DAYS = 30;
/** Invitations one account keeps waiting; a new one past these pushes out the oldest. */
export const MAX_INVITES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    // (one of theirs now: an invitation to it has done its job)
    this.store.dropInvite(input.id);
    return { ok: true, mine };
  }

  /**
   * A friend invites this account to a ledger. Nothing is kept when the ledger is one of the
   * account's already ("in"), or the same invitation, with the same key, is already waiting
   * ("again"). Otherwise it waits here ("sent"), in place of one to the same ledger with an older
   * key; and past MAX_INVITES, the oldest goes.
   */
  invited(invite: Invite, now: number): Invited {
    if (this.store.get(invite.ledger)) return "in";
    this.expire(now);
    if (this.store.invites().some((i) => i.ledger === invite.ledger && i.key === invite.key)) return "again";
    this.store.putInvite(invite);
    for (const old of this.store.invites().slice(MAX_INVITES)) this.store.dropInvite(old.ledger);
    return "sent";
  }

  /** The invitations waiting for this account (none older than INVITE_DAYS), the newest first. */
  invites(now: number): Invite[] {
    this.expire(now);
    return this.store.invites();
  }

  /** Not for them (or used): the invitation to this ledger goes. */
  uninvite(ledger: string): void {
    this.store.dropInvite(ledger);
  }

  /** One more invitation sent by this account today, when today's aren't used up; false when they are. */
  mayInvite(day: string, limit: number): boolean {
    if (this.store.inviting(day) >= limit) return false;
    this.store.invite(day);
    return true;
  }

  /** Invitations that have waited INVITE_DAYS go. */
  private expire(now: number): void {
    for (const i of this.store.invites()) if (now - i.at >= INVITE_DAYS * DAY_MS) this.store.dropInvite(i.ledger);
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
  reserve(input: { ledger: string; id: string; size: number; now: number; day: string; quota: number; account?: string }): Reserved {
    if (input.account && this.store.self() !== input.account) this.store.setSelf(input.account);
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

  /** The ledgers this account's files are in. */
  ledgersWithFiles(): string[] {
    return [...new Set(this.store.files().map((f) => f.ledger))];
  }

  /**
   * The nightly check, for one ledger: what the account is charged for there becomes what the
   * ledger keeps of its files (none, for a ledger that is gone). The bytes used now.
   */
  settle(ledger: string, kept: { id: string; size: number; at: number }[]): number {
    const have = new Map(this.store.files().filter((f) => f.ledger === ledger).map((f) => [f.id, f]));
    const there = new Map(kept.map((f) => [f.id, f]));
    for (const [id, f] of have) if (!there.has(id) || there.get(id)!.size !== f.size) this.store.dropFile(ledger, id);
    for (const [id, f] of there) if (!have.has(id) || have.get(id)!.size !== f.size) this.store.addFile({ ledger, id, size: f.size, at: f.at });
    return this.used();
  }

  /** Which account this is, when it has sent a file. */
  self(): string | null {
    return this.store.self();
  }

  /** The account is deleted: its ledgers, its room, its days, all of it goes. */
  wipe(): void {
    this.store.wipe();
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
export function memoryAccountStore(): AccountStore & { days: Map<string, number>; sent: Map<string, number>; asked: Map<string, number> } {
  const kept = new Map<string, Mine>();
  const days = new Map<string, number>();
  const files = new Map<string, AccountFile>();
  const sent = new Map<string, number>();
  const at = (ledger: string, id: string) => `${ledger}/${id}`;
  let order = 0;
  const when = new Map<string, number>();
  let me: string | null = null;
  /** invitations waiting, each with when it was put (the later put first among those sent the same moment, as the SQLite store has them) */
  const invites = new Map<string, { invite: Invite; put: number }>();
  /** invitations sent, by day */
  const asked = new Map<string, number>();
  return {
    days,
    sent,
    asked,
    self: () => me,
    setSelf(account) {
      me = account;
    },
    invites: () => [...invites.values()].sort((a, b) => b.invite.at - a.invite.at || b.put - a.put).map((x) => structuredClone(x.invite)),
    putInvite(invite) {
      invites.set(invite.ledger, { invite: structuredClone(invite), put: ++order });
    },
    dropInvite(ledger) {
      invites.delete(ledger);
    },
    inviting: (day) => asked.get(day) ?? 0,
    invite(day) {
      const n = (asked.get(day) ?? 0) + 1;
      asked.clear();
      asked.set(day, n);
    },
    wipe() {
      kept.clear();
      days.clear();
      files.clear();
      sent.clear();
      when.clear();
      invites.clear();
      asked.clear();
      me = null;
    },
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
