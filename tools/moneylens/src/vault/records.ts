/**
 * What is inside a chunk, and how two copies of one chunk become one (VAULT-4).
 *
 * A chunk holds up to a few hundred records: transactions of one account, or the accounts, rules
 * and settings. Its contents are JSON, sealed by crypto.ts under the chunk's id and the type
 * "records". The server sees the sealed blob and nothing in it (VAULT-1): not which account, not
 * how many records, not what kind.
 *
 *   { "v": 1, "group": "...", "n": 3, "rev": "<id>", "history": ["<id>", ...],
 *     "records": { "<record id>": { "k": "<kind>", "t": <ms>, "d": { ...fields } } } }
 *
 * - `group` says what the chunk is for ("book", or one account's transactions), so that a device
 *   puts the next record of that group in a chunk that already holds its neighbours. It decides
 *   nothing else: a record is found by its id, wherever it lives, and it never moves.
 * - `n` counts the versions of this chunk: 1 when it is made, one more each time it is sealed
 *   from the copy before. `rev` names this version; `history` is `rev` and then the versions it
 *   was made from, newest first. The server's version numbers say which copy is newer, and the
 *   server could say anything. These say it inside the sealed part: a copy with a smaller `n` is
 *   an older one whatever number it comes with, and a copy a device sent is part of what came
 *   back if its name is in the history, which is what makes sending the same change twice
 *   harmless (sync.ts).
 * - `t` is when the record was last changed, on the clock of the device that changed it. It is
 *   looked at in one case only: two devices changed the same field of the same record.
 *
 * Merging (`merge3`) takes the copy both sides started from, this device's copy and the server's,
 * and goes record by record, then field by field. A change made on one side only is kept. Two
 * changes to different fields of one record are both kept. Two different changes to the same
 * field: the later one wins, and the caller is told. A record removed on one side is removed,
 * whatever the other side did to it, and the caller is told if a change went with it. The result
 * does not depend on which of the two devices does the merging.
 */
import { isId } from "../core/ids";
import { MAX_CHUNK_BYTES, isNewer, open, seal, type OpenVault } from "./crypto";

/** The version of what is inside a chunk. A reader that meets a larger number must not guess. */
export const CONTENT_VERSION = 1;
/** The type every chunk of records is sealed under. */
export const CHUNK_TYPE = "records";
/** The most one record may take in a chunk, as JSON with its id, in bytes. */
export const MAX_ENTRY_BYTES = 4096;
/** A chunk with this many records takes no new ones. With MAX_ENTRY_BYTES, one device cannot build a chunk that is too large to seal. */
export const MAX_ENTRIES = 240;
/** A device does not grow its copy of a chunk past this. A merge may, up to MAX_CHUNK_BYTES. */
export const SOFT_CHUNK_BYTES = 512 * 1024;
/** How many versions back a chunk remembers. */
export const HISTORY = 16;

const MAX_GROUP = 64;
const MAX_DEPTH = 8;

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** A record as the app sees it: its id and its fields. Never changed in place. */
export type Value = { readonly id: string; readonly [field: string]: Json };

/** A record as a chunk keeps it. `size` is what it takes in the chunk, worked out, never stored. */
export type Entry = { readonly kind: string; readonly at: number; readonly value: Value; readonly size: number };

export type Records = ReadonlyMap<string, Entry>;

export type Content = { readonly group: string; readonly n: number; readonly rev: string; readonly history: readonly string[]; readonly records: Records };

const utf8 = new TextEncoder();

export const isKind = (s: unknown): s is string => typeof s === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(s);
export const isGroup = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= MAX_GROUP;
const isStamp = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isPlain = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

/** Is this something JSON keeps exactly? No `undefined`, no number JSON would turn into null, no key that could reach a prototype. */
export function isJson(x: unknown, depth = 0): x is Json {
  if (x === null || typeof x === "boolean" || typeof x === "string") return true;
  if (typeof x === "number") return Number.isFinite(x);
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(x)) {
    // a hole in an array would come back as null
    for (let i = 0; i < x.length; i++) if (!(i in x) || !isJson(x[i], depth + 1)) return false;
    return true;
  }
  if (!isPlain(x)) return false;
  for (const key of Object.keys(x)) if (key === "__proto__" || !isJson(x[key], depth + 1)) return false;
  return true;
}

/** JSON with the keys of every object in order, so that two equal values give the same text. */
export function canonical(x: Json): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  const o = x as { readonly [key: string]: Json };
  return `{${Object.keys(o)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(o[key]!)}`)
    .join(",")}}`;
}

function frozen<T>(x: T): T {
  if (typeof x === "object" && x !== null && !Object.isFrozen(x)) {
    for (const key of Object.keys(x)) frozen((x as Record<string, unknown>)[key]);
    Object.freeze(x);
  }
  return x;
}

/** A field of a record, or undefined when it has none. Never something inherited ("constructor"). */
const field = (value: Value, name: string): Json | undefined => (Object.hasOwn(value, name) ? value[name] : undefined);

const withoutId = (value: Value): { [key: string]: Json } => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id"));

const entryJson = (id: string, kind: string, at: number, value: Value): string => `${JSON.stringify(id)}:${JSON.stringify({ k: kind, t: at, d: withoutId(value) })}`;

/**
 * Makes the entry for a record. Null when it cannot be kept: an id that isn't one, a kind that
 * isn't one, a value JSON would change, or more than one record may take.
 */
export function entryOf(kind: string, at: number, value: Value, own = false): Entry | null {
  if (!isKind(kind) || !isStamp(at) || !isPlain(value) || !isId(value.id) || !isJson(value)) return null;
  // `own`: the value was just made here and nobody else holds it, so it need not be copied
  const copy = frozen(own ? value : (JSON.parse(JSON.stringify(value)) as Value));
  const size = utf8.encode(entryJson(copy.id, kind, at, copy)).length + 1;
  return size > MAX_ENTRY_BYTES ? null : Object.freeze({ kind, at, value: copy, size });
}

/** The bytes of a chunk's contents. */
export function encode(content: Content): Uint8Array {
  const records: string[] = [];
  for (const [id, entry] of content.records) records.push(entryJson(id, entry.kind, entry.at, entry.value));
  return utf8.encode(`{"v":${CONTENT_VERSION},"group":${JSON.stringify(content.group)},"n":${content.n},"rev":${JSON.stringify(content.rev)},"history":${JSON.stringify(content.history)},"records":{${records.join(",")}}}`);
}

export type Decoded = { ok: true; content: Content } | { ok: false; why: "newer" | "malformed" };

/** Reads a chunk's contents back. Everything is checked: what a chunk holds came from storage. */
export function decode(bytes: Uint8Array): Decoded {
  const bad: Decoded = { ok: false, why: "malformed" };
  let x: unknown;
  try {
    x = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return bad;
  }
  if (!isPlain(x) || typeof x.v !== "number" || !Number.isInteger(x.v) || x.v < 1) return bad;
  if (x.v > CONTENT_VERSION) return { ok: false, why: "newer" };
  if (Object.keys(x).length !== 6 || !isGroup(x.group) || !isStamp(x.n) || x.n < 1 || !isId(x.rev) || !Array.isArray(x.history) || !isPlain(x.records)) return bad;
  const history = x.history as unknown[];
  // the history is as long as the chunk is old, up to what it keeps
  if (history.length !== Math.min(x.n, HISTORY) || history[0] !== x.rev || !history.every(isId) || new Set(history).size !== history.length) return bad;
  const records = new Map<string, Entry>();
  for (const [id, e] of Object.entries(x.records)) {
    if (!isPlain(e) || Object.keys(e).length !== 3 || !isPlain(e.d) || Object.hasOwn(e.d, "id")) return bad;
    const entry = entryOf(e.k as string, e.t as number, { id, ...(e.d as { [key: string]: Json }) }, true);
    if (!entry) return bad;
    records.set(id, entry);
  }
  return { ok: true, content: { group: x.group, n: x.n, rev: x.rev, history: Object.freeze(history as string[]), records } };
}

/** Seals a chunk's contents under its id. Null when they are too large for one chunk. */
export async function sealContent(vault: OpenVault, id: string, content: Content): Promise<Uint8Array | null> {
  const bytes = encode(content);
  return bytes.length > MAX_CHUNK_BYTES ? null : seal(vault, { id, type: CHUNK_TYPE }, bytes);
}

export type Opened = { ok: true; content: Content } | { ok: false; why: "unreadable" | "newer" | "malformed" };

/**
 * Opens a sealed chunk of records. "unreadable": it does not open under this vault's key and this
 * id (changed, cut, another chunk's, another vault's). "newer": it says it was written by a later
 * version of the app. That word is a hint for what to tell the person, not something to act on:
 * a blob that does not open is not used, whatever it says of itself.
 */
export async function openContent(vault: OpenVault, id: string, blob: Uint8Array): Promise<Opened> {
  const plain = await open(vault, { id, type: CHUNK_TYPE }, blob);
  if (!plain) return { ok: false, why: isNewer(blob) ? "newer" : "unreadable" };
  return decode(plain);
}

const sameJson = (a: Json | undefined, b: Json | undefined): boolean => a === b || (a !== undefined && b !== undefined && canonical(a) === canonical(b));

/** The same record? What it is and what it says; not when it was last touched. */
export const sameEntry = (a: Entry | undefined, b: Entry | undefined): boolean => a === b || (a !== undefined && b !== undefined && a.kind === b.kind && canonical(a.value) === canonical(b.value));

/** Do two sets of records differ in anything but the times? */
export function differs(a: Records, b: Records | undefined): boolean {
  if (a === b) return false;
  if (!b) return a.size > 0;
  if (a.size !== b.size) return true;
  for (const [id, entry] of a) if (!sameEntry(entry, b.get(id))) return true;
  return false;
}

/**
 * Something a merge could not keep, or had to settle. `removed-there`: this device changed a
 * record that had been removed elsewhere; the record stays removed. `removed-here`: the reverse.
 * `fields`: both sides changed the same fields; `winner` is whose values were kept, the later
 * change. `kind`: both sides changed what kind of record it is, differently. `doubled`: the same
 * record was found in more than one chunk, and was merged into one (sync.ts).
 */
export type Clash =
  | { id: string; what: "removed-there" }
  | { id: string; what: "removed-here" }
  | { id: string; what: "fields"; fields: string[]; winner: "here" | "there" }
  | { id: string; what: "kind"; winner: "here" | "there" }
  | { id: string; what: "doubled" };

export type Merged = {
  records: Map<string, Entry>;
  /** Is there something in the result that the other side does not have yet? */
  ahead: boolean;
  clashes: Clash[];
};

/**
 * Merges this device's copy with the other side's. `base` is the copy both started from;
 * without one, a record on either side is taken as new there, and nothing counts as removed.
 */
export function merge3(base: Records | undefined, here: Records, there: Records): Merged {
  const records = new Map<string, Entry>();
  const clashes: Clash[] = [];
  let ahead = false;
  // A record only the base has was removed on both sides.
  for (const id of new Set([...there.keys(), ...here.keys()])) {
    const from = base?.get(id);
    const mine = here.get(id);
    const theirs = there.get(id);
    let kept: Entry | undefined;
    if (sameEntry(mine, from)) kept = theirs;
    else if (sameEntry(theirs, from)) kept = mine;
    // both changed it, to the same thing: that, with the later of the two times
    else if (sameEntry(mine, theirs)) kept = mine && theirs && mine.at > theirs.at ? mine : theirs;
    else if (!mine || !theirs) clashes.push({ id, what: mine ? "removed-there" : "removed-here" });
    else kept = mergeFields(id, from, mine, theirs, clashes);
    if (kept) records.set(id, kept);
    if (!sameEntry(kept, theirs)) ahead = true;
  }
  return { records, ahead, clashes };
}

/** Both sides changed one record, differently: field by field. */
function mergeFields(id: string, from: Entry | undefined, mine: Entry, theirs: Entry, clashes: Clash[]): Entry {
  // The later change wins a field both changed. On the same millisecond, an order that both devices work out alike.
  const hereWins = mine.at !== theirs.at ? mine.at > theirs.at : `${mine.kind} ${canonical(mine.value)}` > `${theirs.kind} ${canonical(theirs.value)}`;
  const fought: string[] = [];
  const fields: [string, Json][] = [["id", id]];
  for (const name of new Set([...Object.keys(theirs.value), ...Object.keys(mine.value)])) {
    if (name === "id") continue;
    const was = from ? field(from.value, name) : undefined;
    const here = field(mine.value, name);
    const there = field(theirs.value, name);
    let value: Json | undefined;
    if (sameJson(here, was)) value = there;
    else if (sameJson(there, was)) value = here;
    else if (sameJson(here, there)) value = there;
    else {
      value = hereWins ? here : there;
      fought.push(name);
    }
    if (value !== undefined) fields.push([name, value]);
  }
  const winner = hereWins ? "here" : "there";
  // the kind, by the same rules as a field
  let kind = theirs.kind;
  if (mine.kind !== theirs.kind && theirs.kind === from?.kind) kind = mine.kind;
  else if (mine.kind !== theirs.kind && mine.kind !== from?.kind) {
    if (hereWins) kind = mine.kind;
    clashes.push({ id, what: "kind", winner });
  }
  const merged = entryOf(kind, Math.max(mine.at, theirs.at), Object.fromEntries(fields) as Value, true);
  if (merged) {
    if (fought.length) clashes.push({ id, what: "fields", fields: fought.sort(), winner });
    return merged;
  }
  // Two versions that each fit can merge into one that does not (each side filled another field). Then the later version is kept whole.
  const differing = [...new Set([...Object.keys(theirs.value), ...Object.keys(mine.value)])].filter((name) => name !== "id" && !sameJson(field(mine.value, name), field(theirs.value, name)));
  clashes.push({ id, what: "fields", fields: differing.sort(), winner });
  return hereWins ? mine : theirs;
}

/** Two copies of one record with no copy they both started from (the same record found in two chunks): every field either has, and the later copy's value where they differ. */
export const mergeTwo = (id: string, one: Entry, other: Entry, clashes: Clash[]): Entry => mergeFields(id, undefined, one, other, clashes);
