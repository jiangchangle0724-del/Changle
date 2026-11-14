/**
 * Reading what comes back, from the phone's own storage and from the network. Neither is trusted
 * to be whole: storage gets damaged, and a hotel's sign-in page will answer for anyone. So each of
 * these gives back the thing in its right shape, with whatever isn't that shape left out, or null
 * when it isn't that thing at all. Nothing here throws. (Whether an entry's sums are sound is the
 * core's business: it skips the ones that aren't.)
 */
import { parseSent, type Sent, type Took } from "./changes";
import type { Entry, Ledger, Member, Split } from "./core";
import type { Held, Pushed, Snapshot } from "./sync";

export const isText = (x: unknown): x is string => typeof x === "string";
export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** The number of a ledger's last change: a whole number, from 0. */
const isSeq = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
/** A key as phones make them (the server's own rule, tools/split/src/room/protocol.ts). */
const KEY = /^[A-Za-z0-9_-]{22,128}$/;

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
  return held;
}
