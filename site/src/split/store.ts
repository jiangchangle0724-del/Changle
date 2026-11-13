/**
 * Where 两清's ledgers are kept for now: this phone's own storage, and nowhere else. (The server,
 * and with it sharing a ledger by a link, is the next stage; then this file becomes the phone's copy
 * of what the server holds.)
 *
 * One record under one key: every ledger on this phone, and which member "you" are in each. Every
 * change goes through ops.ts and is written back at once. Another tab open on the same ledger hears
 * about it and redraws.
 */
import { useSyncExternalStore } from "react";
import type { Entry, Ledger, Member, Split } from "./core";

const KEY = "changle.split.v1";

export type Saved = {
  /** newest first */
  ledgers: Ledger[];
  /** ledger id → the member this phone's owner is */
  me: Record<string, string>;
};

const isText = (x: unknown): x is string => typeof x === "string";
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function saneSplit(x: unknown): x is Split {
  if (!isRecord(x)) return false;
  if (x.how === "equal") return Array.isArray(x.among) && x.among.every(isText);
  if (x.how === "shares") return isRecord(x.shares) && Object.values(x.shares).every(isCount);
  if (x.how === "exact") return isRecord(x.amounts) && Object.values(x.amounts).every(isCount);
  return false;
}

/** Is this the shape of an entry? (Whether its sums are sound is the core's business: it skips the ones that aren't.) */
function saneEntry(x: unknown): x is Entry {
  if (!isRecord(x) || !isText(x.id) || !isCount(x.at) || !isCount(x.amount)) return false;
  if (x.gone !== undefined && !isCount(x.gone)) return false;
  if (x.kind === "transfer") return isText(x.from) && isText(x.to);
  return x.kind === "expense" && isText(x.payer) && isText(x.note) && isCount(x.rot) && saneSplit(x.split);
}

const saneMember = (x: unknown): x is Member => isRecord(x) && isText(x.id) && isText(x.name);

/** A ledger as it was saved, with anything that isn't the shape of a member or an entry left out; null when it isn't a ledger at all. */
function saneLedger(x: unknown): Ledger | null {
  if (!isRecord(x) || !isText(x.id) || !isText(x.name) || !isText(x.currency) || !Array.isArray(x.members) || !Array.isArray(x.entries)) return null;
  return { id: x.id, name: x.name, currency: x.currency, members: x.members.filter(saneMember), entries: x.entries.filter(saneEntry) };
}

/** What a saved record holds, however it has been damaged: never throws, never returns half a ledger. */
export function parseSaved(raw: string | null): Saved {
  try {
    const p: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(p)) return { ledgers: [], me: {} };
    const ledgers = (Array.isArray(p.ledgers) ? p.ledgers : []).map(saneLedger).filter((l): l is Ledger => l !== null && l.members.length > 0);
    const me = isRecord(p.me) ? Object.fromEntries(Object.entries(p.me).filter((e): e is [string, string] => isText(e[1]))) : {};
    return { ledgers, me };
  } catch {
    return { ledgers: [], me: {} };
  }
}

let state: Saved | null = null;
/** false once a write has failed (a private window, or storage that is full): the page says so */
let kept = true;
const listeners = new Set<() => void>();

function read(): Saved {
  try {
    return parseSaved(localStorage.getItem(KEY));
  } catch {
    kept = false;
    return { ledgers: [], me: {} };
  }
}

function current(): Saved {
  return (state ??= read());
}

function commit(next: Saved) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    kept = true;
  } catch {
    kept = false;
  }
  for (const l of listeners) l();
}

let listening = false;
function subscribe(listener: () => void) {
  listeners.add(listener);
  // another tab changed the ledgers: read them again, once, and tell every screen
  if (!listening) {
    listening = true;
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY && e.key !== null) return;
      state = read();
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Every ledger on this phone, and who you are in each; redraws when any of it changes. */
export const useSaved = () => useSyncExternalStore(subscribe, current);

/** Did the last write reach the phone's storage? */
export const isKept = () => kept;

/** An id nobody can guess and no two phones will make alike: 22 letters and digits. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new ledger goes on top of the list; `me` is which of its members this phone's owner is. */
export function keepLedger(l: Ledger, me: string) {
  const s = current();
  commit({ ledgers: [l, ...s.ledgers.filter((x) => x.id !== l.id)], me: { ...s.me, [l.id]: me } });
}

/** One ledger changed (ops.ts says how). A change that leaves the ledger as it was writes nothing. */
export function change(id: string, how: (l: Ledger) => Ledger) {
  const s = current();
  const before = s.ledgers.find((l) => l.id === id);
  if (!before) return;
  const after = how(before);
  if (after !== before) commit({ ...s, ledgers: s.ledgers.map((l) => (l.id === id ? after : l)) });
}

/** Which member of this ledger this phone's owner is. */
export function setMe(id: string, member: string) {
  const s = current();
  commit({ ...s, me: { ...s.me, [id]: member } });
}

/** A ledger gone from this phone, for good. */
export function dropLedger(id: string) {
  const s = current();
  const { [id]: _mine, ...me } = s.me;
  commit({ ledgers: s.ledgers.filter((l) => l.id !== id), me });
}
