/**
 * One ledger as a phone holds it while it is shared (the plan's stage two, 一起记).
 *
 * The phone keeps three things: the server's ledger as it last heard it, the changes made here
 * that the server hasn't answered for yet, and the ones that didn't stick. What the screen shows
 * is the first with the second made on top (changes.ts, rebase), so a phone with no signal still
 * records, and what it recorded is there when it comes back.
 *
 * This file is the rules, as plain functions from one state to the next. Talking to the server,
 * and when, is syncer.ts. Tests: tests/split-sync.test.ts.
 */
import { applyChange, rebase, type Change, type Sent, type Took } from "./changes";
import type { Ledger, Member } from "./core";
import { LEDGER_NAME_MAX, NAME_MAX, NOTE_MAX, tidy } from "./ops";

/** The server's ledger and the number of its last change. */
export type Snapshot = { seq: number; ledger: Ledger };
/** The server's answer to changes sent: where the ledger stands, and what became of each. */
export type Pushed = Snapshot & { took: Took[] };
/** What a phone asks the server to make. */
export type MakeBody = { id: string; name: string; currency: string; members: Member[] };

export type Held = {
  /** the key that opens this ledger (from the phone that made it, or from the invitation link) */
  key: string;
  /**
   * the owner's key: only the phone that made the ledger has one, and no invitation carries it. It
   * changes the invitation's key and locks the ledger (tools/split/src/room/ledger.ts).
   */
  owner?: string;
  /** the key the owner is changing to, kept from the moment it is asked for until the server has it: then it is `key` */
  next?: string;
  /** has the server made it yet? A ledger opened with no signal is made on the first send. */
  made: boolean;
  /** the number of the server's last change, as last heard */
  seq: number;
  /** the server's ledger, as last heard */
  server: Ledger;
  /** changes made here that the server hasn't answered for, oldest first */
  waiting: Sent[];
  /** changes the server took and that changed nothing they were meant to: for the screen to say so */
  lost: Sent[];
};

/** Changes sent in one request (the server takes up to 500). */
export const SEND_MOST = 500;
/** Changes that didn't stick, kept for the screen until it has said so. */
export const LOST_MOST = 50;

/** A ledger just opened on this phone, which owns it when it has made an owner's key for it. The server hasn't heard of it yet. */
export const hold = (ledger: Ledger, key: string, owner?: string): Held => ({ key, ...(owner ? { owner } : {}), made: false, seq: 0, server: ledger, waiting: [], lost: [] });

/** A ledger someone else opened, as the server gave it to this phone. */
export const join = (snapshot: Snapshot, key: string): Held => ({ key, made: true, seq: snapshot.seq, server: snapshot.ledger, waiting: [], lost: [] });

/** What the screen shows: the server's ledger with what is waiting made on top. */
export const shown = (h: Held): Ledger => rebase(h.server, h.waiting);

/** What the server is asked to make, the first time. (Until it is made, `server` is the ledger as it was opened.) */
export const makeBody = (h: Held): MakeBody => ({ id: h.server.id, name: h.server.name, currency: h.server.currency, members: h.server.members });

/** The phone does something. Null when the ledger as shown doesn't allow it, or is locked. */
export function act(h: Held, change: Change, id: string, at: number): Held | null {
  const now = shown(h);
  return now.locked === undefined && applyChange(now, change) ? { ...h, waiting: [...h.waiting, { id, at, change }] } : null;
}

/**
 * The owner asks for a new key for the invitation. It is kept on the phone before anything is
 * sent: the server may have it and the answer be lost, and a phone that forgot the key it asked
 * for would be shut out of its own ledger. One at a time; and never one of the keys it has.
 */
export const rekeying = (h: Held, next: string): Held => (h.owner && h.made && !h.next && next !== h.key && next !== h.owner ? { ...h, next } : h);

/** The server has the new key: it is the key now. */
export function rekeyed(h: Held, next: string): Held {
  if (h.next !== next) return h;
  const { next: _asked, ...rest } = h;
  return { ...rest, key: next };
}

/** The server won't take the key that was asked for: the ledger's key stays as it was. */
export function keyStays(h: Held): Held {
  if (h.next === undefined) return h;
  const { next: _asked, ...rest } = h;
  return rest;
}

/**
 * The server says this phone's owner's key isn't the ledger's owner's (the ledger was made without
 * one: by an older page, or while the server was being changed). The phone stops holding it, so
 * its screens don't offer what the server will never do.
 */
export function notOwner(h: Held): Held {
  if (h.owner === undefined) return h;
  const { owner: _key, next: _asked, ...rest } = h;
  return rest;
}

/**
 * Another key for a ledger this phone holds, with the ledger as that key read it: a new
 * invitation, opened after the owner changed the key. What was waiting to be sent still is.
 */
export const opened = (h: Held, key: string, s: Snapshot): Held => ({ ...heard(h, s), key });

/**
 * The server says where the ledger stands (on making it, on the live connection). News older than
 * what the phone has is ignored, and so is news it has already: a ledger at one number is one
 * ledger, so hearing it twice (the answer to a change, then the same thing on the live connection)
 * changes nothing here, and nothing is drawn or kept again.
 */
export function heard(h: Held, s: Snapshot): Held {
  if (s.seq < h.seq || (h.made && s.seq === h.seq)) return h;
  return { ...h, made: true, seq: s.seq, server: s.ledger };
}

/** What to send: everything waiting, oldest first, so nothing arrives before what it follows. */
export const toSend = (h: Held): Sent[] => h.waiting.slice(0, SEND_MOST);

const same = (a: unknown, b: unknown): boolean => {
  const canon = (x: unknown) => JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([p], [q]) => (p < q ? -1 : 1))) : v));
  return canon(a) === canon(b);
};

/** Does the ledger say what this change was for? (An entry taken out is out, whoever took it out.) */
export function holds(l: Ledger, c: Change): boolean {
  const entry = (id: string) => l.entries.find((e) => e.id === id);
  switch (c.do) {
    case "expense":
      return entry(c.expense.id)?.kind === "expense";
    case "transfer":
      return entry(c.transfer.id)?.kind === "transfer";
    case "edit": {
      const e = entry(c.entry);
      return !!e && e.kind === "expense" && e.payer === c.to.payer && e.amount === c.to.amount && e.note === tidy(c.to.note, NOTE_MAX) && same(e.split, c.to.split);
    }
    case "out": {
      const e = entry(c.entry);
      return !e || e.gone !== undefined;
    }
    case "back": {
      const e = entry(c.entry);
      return !!e && e.gone === undefined;
    }
    case "member":
      return l.members.some((m) => m.id === c.member.id);
    case "rename":
      return l.members.find((m) => m.id === c.member)?.name === tidy(c.name, NAME_MAX);
    case "remove":
      return !l.members.some((m) => m.id === c.member);
    case "title":
      return l.name === tidy(c.name, LEDGER_NAME_MAX);
  }
}

/**
 * The server's answer to what was sent. Those changes stop waiting, whatever became of them. One
 * that changed nothing, and whose purpose the ledger doesn't already serve, didn't stick (someone
 * took its name, or took the person out of the ledger, while this phone had no signal): it goes
 * on the list the screen reads, once (two tabs open on one ledger are both told).
 */
export function answered(h: Held, sent: Sent[], a: Pushed): Held {
  const ids = new Set(sent.map((s) => s.id));
  const listed = new Set(h.lost.map((s) => s.id));
  const lost = sent.filter((s, i) => a.took[i] === "nothing" && !listed.has(s.id) && !holds(a.ledger, s.change));
  return { ...heard(h, a), waiting: h.waiting.filter((s) => !ids.has(s.id)), lost: [...h.lost, ...lost].slice(-LOST_MOST) };
}

/** The screen has said so. */
export const dismiss = (h: Held, id: string): Held => (h.lost.some((s) => s.id === id) ? { ...h, lost: h.lost.filter((s) => s.id !== id) } : h);
