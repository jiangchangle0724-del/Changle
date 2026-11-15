/**
 * Reading what comes back, from the phone's own storage and from the network. Neither is trusted
 * to be whole: storage gets damaged, and a hotel's sign-in page will answer for anyone. So each of
 * these gives back the thing in its right shape, with whatever isn't that shape left out, or null
 * when it isn't that thing at all. Nothing here throws. (Whether an entry's sums are sound is the
 * core's business: it skips the ones that aren't.)
 */
import { parseSent, type Sent, type Took } from "./changes";
import type { Entry, Ledger, Member, Split } from "./core";
import type { Logged } from "./history";
import type { Held, Pushed, Snapshot } from "./sync";

export const isText = (x: unknown): x is string => typeof x === "string";
export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** The number of a ledger's last change: a whole number, from 0. */
const isSeq = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
/** A key as phones make them (the server's own rule, tools/split/src/room/protocol.ts). */
const KEY = /^[A-Za-z0-9_-]{22,128}$/;
/** A changle.ca account's id, as the rooms server makes them ("u" and twelve letters and digits), with room to spare. */
export const ACCT = /^[A-Za-z0-9_-]{1,64}$/;
/** A ledger's id, as phones make them and the server takes them. */
const LEDGER_ID = /^[A-Za-z0-9_-]{6,64}$/;
/** A person's id in a ledger, as the server takes one for "who they are" (its MEMBER_RE). */
const MEMBER = /^[A-Za-z0-9_-]{1,64}$/;

function isSplit(x: unknown): x is Split {
  if (!isRecord(x)) return false;
  if (x.how === "equal") return Array.isArray(x.among) && x.among.every(isText);
  if (x.how === "shares") return isRecord(x.shares) && Object.values(x.shares).every(isCount);
  if (x.how === "exact") return isRecord(x.amounts) && Object.values(x.amounts).every(isCount);
  return false;
}

function isEntry(x: unknown): x is Entry {
  if (!isRecord(x) || !isText(x.id) || !isCount(x.at) || !isCount(x.amount)) return false;
  if (x.gone !== undefined && !isCount(x.gone)) return false;
  // (receipt photos: a list of ids, or none)
  if (x.files !== undefined && !(Array.isArray(x.files) && x.files.every(isText))) return false;
  // (tip and tax: numbers, or none)
  if ((x.tip !== undefined && !isCount(x.tip)) || (x.tax !== undefined && !isCount(x.tax))) return false;
  if (x.kind === "transfer") return isText(x.from) && isText(x.to);
  return x.kind === "expense" && isText(x.payer) && isText(x.note) && isCount(x.rot) && isSplit(x.split);
}

const isMember = (x: unknown): x is Member => isRecord(x) && isText(x.id) && isText(x.name);

/** A ledger, with anything that isn't the shape of a member or an entry left out; null when it isn't a ledger, or has nobody in it. */
export function asLedger(x: unknown): Ledger | null {
  if (!isRecord(x) || !isText(x.id) || !isText(x.name) || !isText(x.currency) || !Array.isArray(x.members) || !Array.isArray(x.entries)) return null;
  const members = x.members.filter(isMember);
  if (!members.length) return null;
  const ledger: Ledger = { id: x.id, name: x.name, currency: x.currency, members, entries: x.entries.filter(isEntry) };
  if (isCount(x.locked)) ledger.locked = x.locked;
  return ledger;
}

/** The server saying where a ledger stands. */
export function asSnapshot(x: unknown): Snapshot | null {
  if (!isRecord(x) || !isSeq(x.seq)) return null;
  const ledger = asLedger(x.ledger);
  return ledger && { seq: x.seq, ledger };
}

const TOOK: readonly unknown[] = ["new", "seen", "nothing"] satisfies Took[];

/** The server's answer to `sent` changes: where the ledger stands, and what became of each one. */
export function asPushed(x: unknown, sent: number): Pushed | null {
  const snapshot = asSnapshot(x);
  if (!snapshot || !isRecord(x) || !Array.isArray(x.took) || x.took.length !== sent || !x.took.every((t) => TOOK.includes(t))) return null;
  return { ...snapshot, took: x.took as Took[] };
}

/** The ledger's record after some change, as the server answers (tools/split/src/room/protocol.ts, Since). */
export type Since = { seq: number; changes: Logged[] };

/**
 * The server's record, read from whatever arrived: each line a change that counted (read as any
 * change is, so nothing else rides in) or the ledger locked or opened. A line that is neither is
 * left out; an answer that isn't a record is none.
 */
export function asSince(x: unknown): Since | null {
  if (!isRecord(x) || !isSeq(x.seq) || !Array.isArray(x.changes)) return null;
  const changes = x.changes.flatMap((l): Logged[] => {
    if (!isRecord(l) || !isSeq(l.seq) || !isSeq(l.at)) return [];
    if (typeof l.lock === "boolean") return [{ seq: l.seq, at: l.at, lock: l.lock }];
    const sent = parseSent(l.sent);
    return sent ? [{ seq: l.seq, at: l.at, sent }] : [];
  });
  return { seq: x.seq, changes };
}

/**
 * One of a changle.ca account's ledgers, as the server keeps it ("my ledgers",
 * tools/split/src/room/account.ts): the key that opens it, the owner's key for one the account
 * started, and which person in it the account is.
 */
export type Mine = { id: string; key: string; owner?: string; me?: string; at: number };

/** The server's list of my ledgers; null when what came isn't one. Any one in it that isn't a ledger's is left out. */
export function asMine(x: unknown): Mine[] | null {
  if (!isRecord(x) || !Array.isArray(x.ledgers)) return null;
  return x.ledgers.flatMap((m: unknown): Mine[] => {
    if (!isRecord(m) || !isText(m.id) || !LEDGER_ID.test(m.id) || !isText(m.key) || !KEY.test(m.key) || !isSeq(m.at)) return [];
    const mine: Mine = { id: m.id, key: m.key, at: m.at };
    if (isText(m.owner) && KEY.test(m.owner) && m.owner !== m.key) mine.owner = m.owner;
    if (isText(m.me) && MEMBER.test(m.me)) mine.me = m.me;
    return [mine];
  });
}

/** The server saying it is done (`{ ok: true }`); null when it isn't that. */
export const asDone = (x: unknown): true | null => (isRecord(x) && x.ok === true ? true : null);

/** Someone on changle.ca as the screens show them: their account, name, and photo (`av`: its version, 0 for none; `ac`: the colour of their letter). */
export type Person = { id: string; name: string; av: number; ac?: number };
const asPerson = (x: unknown): Person | null => {
  if (!isRecord(x) || !isText(x.id) || !ACCT.test(x.id) || !isText(x.name)) return null;
  const person: Person = { id: x.id, name: x.name, av: isSeq(x.av) ? x.av : 0 };
  if (isSeq(x.ac)) person.ac = x.ac;
  return person;
};

/** The signed-in account's friends, from the site's own list (`GET /api/friends`, its `friends`); null when what came isn't that list. Anyone in it who isn't a person is left out. */
export function asFriends(x: unknown): Person[] | null {
  if (!isRecord(x) || !Array.isArray(x.friends)) return null;
  return x.friends.flatMap((f: unknown) => asPerson(f) ?? []);
}

/**
 * An invitation from a friend, waiting for the signed-in account (tools/split/src/room/account.ts,
 * Invite): to which ledger, with the key that opens it and its name when it was sent; who sent it;
 * the person in the ledger it is for, when they said; and when.
 */
export type Invitation = { ledger: string; key: string; name: string; from: Person; member?: string; at: number };

/** The invitations waiting, as the server lists them; null when what came isn't that list. Any that isn't an invitation is left out. */
export function asInvitations(x: unknown): Invitation[] | null {
  if (!isRecord(x) || !Array.isArray(x.invites)) return null;
  return x.invites.flatMap((i: unknown): Invitation[] => {
    const from = isRecord(i) ? asPerson(i.from) : null;
    if (!isRecord(i) || !from || !isText(i.ledger) || !LEDGER_ID.test(i.ledger) || !isText(i.key) || !KEY.test(i.key) || !isText(i.name) || !isSeq(i.at)) return [];
    const invitation: Invitation = { ledger: i.ledger, key: i.key, name: i.name, from, at: i.at };
    if (isText(i.member) && MEMBER.test(i.member)) invitation.member = i.member;
    return [invitation];
  });
}

/** What was read off a receipt (tools/split/src/server/read.ts, Read): the total as digits with a dot, its currency when it could be told, the shop, and the tip and tax in the total. */
export type Reading = { total: string; currency: string | null; merchant: string | null; tip: string | null; tax: string | null };
/** The server's answer to reading a receipt: what was read, or nothing (`read` null); null when the answer isn't that. */
/** A sum as a reading writes one: digits, and a dot before at most two more. */
const SUM = /^\d{1,10}(\.\d{1,2})?$/;
export function asReadReply(x: unknown): { read: Reading | null } | null {
  if (!isRecord(x) || !("read" in x)) return null;
  if (x.read === null) return { read: null };
  const r = x.read;
  if (!isRecord(r) || !isText(r.total) || !SUM.test(r.total)) return null;
  const currency = isText(r.currency) && /^[A-Z]{3}$/.test(r.currency) ? r.currency : null;
  const merchant = isText(r.merchant) && r.merchant.trim() ? r.merchant.trim().slice(0, 40) : null;
  // (written as the total is, or none: a server from before them says neither)
  const part = (x: unknown) => (isText(x) && SUM.test(x) ? x : null);
  return { read: { total: r.total, currency, merchant, tip: part(r.tip), tax: part(r.tax) } };
}

/** What came of inviting a friend: an invitation now waits for them, the same one already did, or the ledger is theirs already. */
export type InviteOutcome = "sent" | "again" | "in";
/** The server's answer to an invitation (`{ invite }`); null when it isn't one. */
export const asInviteSent = (x: unknown): InviteOutcome | null => (isRecord(x) && (x.invite === "sent" || x.invite === "again" || x.invite === "in") ? x.invite : null);

const asChanges = (x: unknown): Sent[] => (Array.isArray(x) ? x.map(parseSent).filter((s): s is Sent => s !== null) : []);

/**
 * One ledger as the phone kept it. A change that has lost its shape is dropped, not kept waiting:
 * the server refuses a whole request with one such thing in it, and nothing after it would ever go.
 */
export function asHeld(x: unknown): Held | null {
  if (!isRecord(x) || !isText(x.key) || !KEY.test(x.key) || typeof x.made !== "boolean" || !isSeq(x.seq)) return null;
  const server = asLedger(x.server);
  if (!server) return null;
  const held: Held = { key: x.key, made: x.made, seq: x.seq, server, waiting: asChanges(x.waiting), lost: asChanges(x.lost) };
  // (the owner's key, and a key being changed to: each only when it is one, and not the key itself)
  if (isText(x.owner) && KEY.test(x.owner) && x.owner !== x.key) held.owner = x.owner;
  if (held.owner && isText(x.next) && KEY.test(x.next) && x.next !== x.key && x.next !== x.owner) held.next = x.next;
  // (the account it is kept in: an id as the site's accounts make them)
  if (isText(x.acct) && ACCT.test(x.acct)) held.acct = x.acct;
  return held;
}
