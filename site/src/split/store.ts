/**
 * What this phone keeps of 两清's ledgers. A ledger lives on the server; the phone keeps a copy of
 * each one it has opened, with the key that opens it and whatever it has recorded that the server
 * hasn't answered for yet (sync.ts says what is in that copy). So a ledger opens at once, with or
 * without a signal, and what was recorded with none is still there tomorrow.
 *
 * One record under one key in the phone's own storage: every ledger held, and which member "you"
 * are in each. Every change is written back at once. Another tab open on the same ledger hears
 * about it and redraws; and a write always starts from what is kept at that moment, so two tabs
 * don't write over each other's work.
 */
import { useSyncExternalStore } from "react";
import type { Ledger } from "./core";
import { asHeld, isRecord, isText } from "./shape";
import { shown, type Held } from "./sync";

const KEY = "changle.split.v2";
/**
 * Where the first sample kept its ledgers, on the phone and nowhere else. They are not carried
 * over (decided 2026-11-13, docs/briefs/split.md): the old record comes off the phone.
 */
const SAMPLE_KEY = "changle.split.v1";

export type Saved = {
  /** newest first */
  held: Held[];
  /** ledger id → the member this phone's owner is */
  me: Record<string, string>;
};

/** What the screens read: every ledger as it is shown (the server's, with what is waiting made on top), beside what is held of it. */
export type View = Saved & { ledgers: Ledger[] };

const NOTHING: Saved = { held: [], me: {} };

/** What a saved record holds, however it has been damaged: never throws, never returns half a ledger. */
export function parseSaved(raw: string | null): Saved {
  try {
    const p: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(p)) return NOTHING;
    const held = (Array.isArray(p.held) ? p.held : []).map(asHeld).filter((h): h is Held => h !== null);
    const me = isRecord(p.me) ? Object.fromEntries(Object.entries(p.me).filter((e): e is [string, string] => isText(e[1]))) : {};
    return { held, me };
  } catch {
    return NOTHING;
  }
}

let state: Saved | null = null;
/** the record as this page last read or wrote it, to tell when another tab has written since */
let lastRaw: string | null = null;
let view: View | null = null;
/** false once a write has failed (a private window, or storage that is full): the page says so */
let kept = true;
const listeners = new Set<() => void>();

function read(): Saved {
  try {
    lastRaw = localStorage.getItem(KEY);
  } catch {
    kept = false;
    return NOTHING;
  }
  try {
    localStorage.removeItem(SAMPLE_KEY);
  } catch {
    // a browser that won't let go of it: it is never read again either way
  }
  return parseSaved(lastRaw);
}

/** What is kept, as this page last knew it. */
const current = (): Saved => (state ??= read());

/**
 * What is kept at this moment, to write from. Another tab may have written since this page last
 * looked (it is told, but a moment later): then the record is read again first.
 */
function fresh(): Saved {
  const now = current();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === lastRaw) return now;
    lastRaw = raw;
    view = null;
    return (state = parseSaved(raw));
  } catch {
    return now;
  }
}

function commit(next: Saved) {
  state = next;
  view = null;
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);
    lastRaw = raw;
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
      view = null;
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** A ledger as shown is worked out once for each state it is held in, so a screen that hasn't changed isn't drawn again. */
const shownOnce = new WeakMap<Held, Ledger>();
function look(h: Held): Ledger {
  let l = shownOnce.get(h);
  if (!l) shownOnce.set(h, (l = shown(h)));
  return l;
}

function seen(): View {
  if (!view) {
    const s = current();
    view = { ...s, ledgers: s.held.map(look) };
  }
  return view;
}

/** Every ledger on this phone, and who you are in each; redraws when any of it changes. */
export const useSaved = () => useSyncExternalStore(subscribe, seen);

/** Did the last write reach the phone's storage? */
export const isKept = () => kept;

/**
 * Random bytes written in letters, digits, - and _, beginning and ending with a letter or a digit.
 * (An invitation link ends with one of these, and a chat app that turns addresses into links
 * leaves a last - or _ out of the link: so none ends in one.)
 */
function random(bytes: number): string {
  for (;;) {
    let s = "";
    for (const b of crypto.getRandomValues(new Uint8Array(bytes))) s += String.fromCharCode(b);
    const text = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (/^[A-Za-z0-9].*[A-Za-z0-9]$/.test(text)) return text;
  }
}

/** An id nobody can guess and no two phones will make alike: 22 letters and digits. */
export const newId = () => random(16);

/** The key that opens a ledger: 43 letters and digits. The phone makes it; the server keeps only its fingerprint. */
export const newKey = () => random(32);

/** Every ledger this phone holds, newest first. */
export const everyHeld = (): Held[] => current().held;

/** What this phone holds of one ledger; null when it isn't on this phone. */
export const heldOf = (id: string): Held | null => current().held.find((h) => h.server.id === id) ?? null;

/**
 * A ledger newly held goes on top of the list; `me` is which of its members this phone's owner is
 * (not known yet for one opened from an invitation: its page asks).
 */
export function keepHeld(h: Held, me?: string) {
  const s = fresh();
  // (one the phone holds already stays as it is, with whatever it has waiting to be sent)
  if (s.held.some((x) => x.server.id === h.server.id)) return;
  const { [h.server.id]: _stale, ...others } = s.me;
  commit({ held: [h, ...s.held], me: me ? { ...others, [h.server.id]: me } : others });
}

/** What the phone holds of one ledger changes (sync.ts says how). A change that leaves it as it was writes nothing. */
export function write(id: string, how: (h: Held) => Held) {
  const s = fresh();
  const before = s.held.find((h) => h.server.id === id);
  if (!before) return;
  const after = how(before);
  if (after !== before) commit({ ...s, held: s.held.map((h) => (h === before ? after : h)) });
}

/** Which member of this ledger this phone's owner is; undefined when that isn't known (yet). */
export const meOf = (id: string): string | undefined => current().me[id];

/** Which member of this ledger this phone's owner is. */
export function setMe(id: string, member: string) {
  const s = fresh();
  commit({ ...s, me: { ...s.me, [id]: member } });
}

/** A ledger taken off this phone, with its key and whatever was still waiting to be sent. */
export function dropHeld(id: string) {
  const s = fresh();
  const { [id]: _mine, ...me } = s.me;
  commit({ held: s.held.filter((h) => h.server.id !== id), me });
}
