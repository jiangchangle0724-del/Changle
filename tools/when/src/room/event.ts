// One gathering: its days, who answered what, what was set, and who may change which part of it.
// Plain logic over a small store, so the tests run it without Cloudflare; the Durable Object in
// src/server/worker.ts wraps it, keeps the store in SQLite and tells the phones when it changes.
//
// Who is who: every phone makes its own key (32 random bytes) and sends it with each request. The
// room never keeps a key, only its SHA-256 fingerprint. A row can be changed only with the key it
// was made with. The phone that made the gathering is its host; another phone becomes one by
// giving the 6-digit admin code.
import { cleanAnswers, cleanDays, slotsOf } from "../engine/slots";
import { cleanText } from "../engine/text";
import type { Day, EventState, Grain, Person, Settled, SlotKey } from "../engine/types";

export const MAX_PEOPLE = 40;
export const NAME_MAX = 16;
export const TITLE_MAX = 40;
/** A gathering and everything in it is deleted this long after it was made. */
export const KEEP_MS = 60 * 86_400_000;
/** Wrong admin codes in a row before the gathering stops taking any for a while. */
export const ADMIN_TRIES = 5;
export const ADMIN_LOCK_MS = 3_600_000;
/** Phones that can manage one gathering. */
export const MAX_HOSTS = 8;

export type Meta = Omit<EventState, "people"> & {
  /** fingerprints of the keys of the phones that manage this gathering */
  hosts: string[];
  admin: { hash: string; salt: string; fails: number; lockedUntil: number };
};
export type Row = Person & { keyHash: string; joinedAt: number };

export interface Store {
  load(): { meta: Meta | null; rows: Row[] };
  saveMeta(meta: Meta): void;
  saveRow(row: Row): void;
  deleteRow(id: string): void;
  wipe(): void;
}

export type ErrorCode = "gone" | "exists" | "bad" | "name" | "full" | "forbidden" | "locked" | "wrong";
export type Fail = { ok: false; error: ErrorCode };
export type Ok<T = object> = { ok: true } & T;
const fail = (error: ErrorCode): Fail => ({ ok: false, error });

export type HostAction =
  | { do: "settle"; slot: SlotKey }
  | { do: "reopen" }
  | { do: "edit"; title?: unknown; minPeople?: unknown; deadline?: unknown }
  | { do: "must"; id: string; must: boolean }
  | { do: "remove"; id: string };

export class EventRoom {
  private meta: Meta | null;
  private rows: Map<string, Row>;

  constructor(private store: Store) {
    const { meta, rows } = store.load();
    this.meta = meta;
    this.rows = new Map([...rows].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).map((r) => [r.id, r]));
  }

  get exists(): boolean {
    return this.meta !== null;
  }
  get expiresAt(): number | null {
    return this.meta?.expiresAt ?? null;
  }
  get title(): string | null {
    return this.meta?.title ?? null;
  }

  /** Make the gathering. `today` is the Vancouver day at `now`. */
  create(input: { code: string; title: unknown; days: unknown; grain: unknown; hostHash: string; adminHash: string; adminSalt: string; now: number; today: Day }): Ok | Fail {
    if (this.meta) return fail("exists");
    const title = cleanText(input.title, TITLE_MAX);
    const days = cleanDays(input.days, input.today);
    const grain: Grain | null = input.grain === "half" || input.grain === "day" ? input.grain : null;
    if (!title || !days || !grain) return fail("bad");
    this.meta = {
      code: input.code,
      title,
      days,
      grain,
      createdAt: input.now,
      expiresAt: input.now + KEEP_MS,
      deadline: null,
      minPeople: 1,
      settled: null,
      v: 1,
      hosts: [input.hostHash],
      admin: { hash: input.adminHash, salt: input.adminSalt, fails: 0, lockedUntil: 0 },
    };
    this.store.saveMeta(this.meta);
    return { ok: true };
  }

  /** What every phone is shown; null when there is no such gathering (never made, or deleted). */
  state(): EventState | null {
    if (!this.meta) return null;
    const { hosts: _hosts, admin: _admin, ...shown } = this.meta;
    return { ...shown, people: [...this.rows.values()].map(({ keyHash: _key, joinedAt: _joined, ...person }) => person) };
  }

  isHost(keyHash: string | null): boolean {
    return !!keyHash && !!this.meta?.hosts.includes(keyHash);
  }

  /** The id of the row this key made, if it made one. */
  rowOf(keyHash: string | null): string | null {
    if (!keyHash) return null;
    for (const row of this.rows.values()) if (row.keyHash === keyHash) return row.id;
    return null;
  }

  /**
   * Save someone's own row: their name and their answers. The first save makes the row. A row is
   * changed only with the key that made it; a key has one row.
   */
  saveMine(input: { id?: unknown; keyHash: string; newId: () => string; name: unknown; answers: unknown; now: number }): Ok<{ id: string; fresh: boolean }> | Fail {
    const meta = this.meta;
    if (!meta) return fail("gone");
    const name = cleanText(input.name, NAME_MAX);
    if (!name) return fail("name");
    const answers = cleanAnswers(input.answers, new Set(slotsOf(meta.days, meta.grain)));
    const mine = this.rowOf(input.keyHash);
    if (typeof input.id === "string" && this.rows.has(input.id) && input.id !== mine) return fail("forbidden");
    let row = mine ? this.rows.get(mine)! : null;
    const fresh = !row;
    if (!row) {
      if (this.rows.size >= MAX_PEOPLE) return fail("full");
      let id = input.newId();
      while (this.rows.has(id)) id = input.newId();
      row = { id, name, must: false, proxy: false, answers, at: input.now, keyHash: input.keyHash, joinedAt: input.now };
      this.rows.set(id, row);
    } else {
      row.name = name;
      row.answers = answers;
      row.at = input.now;
    }
    this.store.saveRow(row);
    this.bump();
    return { ok: true, id: row.id, fresh };
  }

  /** Something only a host's phone may do. */
  hostAct(keyHash: string | null, action: HostAction, now: number): Ok | Fail {
    const meta = this.meta;
    if (!meta) return fail("gone");
    if (!this.isHost(keyHash)) return fail("forbidden");
    switch (action?.do) {
      case "settle": {
        const at = slotsOf(meta.days, meta.grain).indexOf(action.slot);
        if (at < 0) return fail("bad");
        const [day, part] = action.slot.split(":") as [Day, Settled["part"]];
        meta.settled = { day, part, at: now };
        break;
      }
      case "reopen":
        meta.settled = null;
        break;
      case "edit": {
        if (action.title !== undefined) {
          const title = cleanText(action.title, TITLE_MAX);
          if (!title) return fail("bad");
          meta.title = title;
        }
        if (action.minPeople !== undefined) {
          const n = action.minPeople;
          if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_PEOPLE) return fail("bad");
          meta.minPeople = n;
        }
        if (action.deadline !== undefined) {
          const d = action.deadline;
          if (d !== null && (typeof d !== "number" || !Number.isFinite(d) || d <= now || d > meta.expiresAt)) return fail("bad");
          meta.deadline = d === null ? null : Math.floor(d as number);
        }
        break;
      }
      case "must": {
        const row = this.rows.get(action.id);
        if (!row) return fail("bad");
        row.must = action.must === true;
        this.store.saveRow(row);
        break;
      }
      case "remove": {
        if (!this.rows.delete(action.id)) return fail("bad");
        this.store.deleteRow(action.id);
        break;
      }
      default:
        return fail("bad");
    }
    this.bump();
    return { ok: true };
  }

  /** The salt to fingerprint a typed admin code with, or why no code is being taken right now. */
  adminSalt(now: number): Ok<{ salt: string }> | Fail {
    if (!this.meta) return fail("gone");
    if (this.meta.admin.lockedUntil > now) return fail("locked");
    return { ok: true, salt: this.meta.admin.salt };
  }

  /**
   * A phone gives the admin code (already fingerprinted with the salt) to become a host. Five wrong
   * codes in a row and the gathering takes none for an hour.
   */
  claim(input: { adminHash: string; keyHash: string; now: number }): Ok | Fail {
    const meta = this.meta;
    if (!meta) return fail("gone");
    const admin = meta.admin;
    if (admin.lockedUntil > input.now) return fail("locked");
    if (input.adminHash !== admin.hash) {
      admin.fails += 1;
      if (admin.fails >= ADMIN_TRIES) {
        admin.fails = 0;
        admin.lockedUntil = input.now + ADMIN_LOCK_MS;
      }
      this.store.saveMeta(meta);
      return fail(admin.lockedUntil > input.now ? "locked" : "wrong");
    }
    admin.fails = 0;
    if (!meta.hosts.includes(input.keyHash)) {
      // the newest phones stay; the phone that made the gathering always does
      if (meta.hosts.length >= MAX_HOSTS) meta.hosts.splice(1, 1);
      meta.hosts.push(input.keyHash);
    }
    this.store.saveMeta(meta);
    return { ok: true };
  }

  /** Delete everything (the 60 days are up). */
  wipe(): void {
    this.store.wipe();
    this.meta = null;
    this.rows.clear();
  }

  private bump(): void {
    if (!this.meta) return;
    this.meta.v += 1;
    this.store.saveMeta(this.meta);
  }
}

/** A store in memory, for the tests and for running the rules anywhere. */
export function memoryStore(): Store & { meta: Meta | null; rows: Map<string, Row> } {
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const self = {
    meta: null as Meta | null,
    rows: new Map<string, Row>(),
    load: () => ({ meta: self.meta ? copy(self.meta) : null, rows: [...self.rows.values()].map(copy) }),
    saveMeta(meta: Meta) {
      self.meta = copy(meta);
    },
    saveRow(row: Row) {
      self.rows.set(row.id, copy(row));
    },
    deleteRow(id: string) {
      self.rows.delete(id);
    },
    wipe() {
      self.meta = null;
      self.rows.clear();
    },
  };
  return self;
}
