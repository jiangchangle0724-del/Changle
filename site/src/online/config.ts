import { CODE_ALPHABET, CODE_RE } from "../shared/protocol";

/** Where the room server lives. Set VITE_ROOMS_URL at build time for a local server (ws://127.0.0.1:8787). */
const ENV = ((import.meta.env.VITE_ROOMS_URL as string | undefined) ?? "").trim();
export const ROOMS_URL = (ENV || "wss://rooms.changle.ca").replace(/\/$/, "");

export const wsUrl = (code: string) => `${ROOMS_URL.replace(/^http/, "ws")}/room/${code}/ws`;
export const infoUrl = (code: string) => `${ROOMS_URL.replace(/^ws/, "http")}/room/${code}/info`;
/** A game's big, rarely changing data (the DJ booth's song list). */
export const dataUrl = (code: string) => `${ROOMS_URL.replace(/^ws/, "http")}/room/${code}/data`;
/** The DJ booth's Lyria stream for a table, asked for by one of its big screens (`sid`). */
export const lyriaUrl = (code: string, sid: string) => `${ROOMS_URL.replace(/^http/, "ws")}/room/${code}/lyria?sid=${encodeURIComponent(sid)}`;

export type RoomInfo = { exists: boolean; seated: number; online: number; host: string; game: string | null; full: boolean };

export async function fetchInfo(code: string, signal?: AbortSignal): Promise<RoomInfo> {
  const res = await fetch(infoUrl(code), { signal, cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as RoomInfo;
}

export function newCode(): string {
  const out: string[] = [];
  const buf = new Uint32Array(4);
  try {
    crypto.getRandomValues(buf);
  } catch {
    for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  for (let i = 0; i < 4; i++) out.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
  return out.join("");
}

/** What a person types: lower case, spaces, the letter O for zero. Keep only what codes are made of. */
export function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .split("")
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, 4);
}

export const isCode = (c: string) => CODE_RE.test(c);

export function inviteLink(code: string) {
  return `${window.location.origin}/t/${code}`;
}

/* ---------- this phone ---------- */

const PID = "lazysusan.pid";
const NAME = "lazysusan.name";
const LAST = "lazysusan.lastRoom";
const INTENT = "lazysusan.intent";

function read(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(store: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* private window: the seat lasts as long as the tab */
  }
}

let memoryPid: string | null = null;
/** One id per phone, kept across reloads, so a dropped phone gets its own seat back. */
export function phoneId(): string {
  const saved = read(globalThis.localStorage, PID);
  if (saved) return saved;
  if (!memoryPid) {
    const r = new Uint32Array(2);
    try {
      crypto.getRandomValues(r);
    } catch {
      r[0] = Math.floor(Math.random() * 1e9);
      r[1] = Date.now();
    }
    memoryPid = `p${r[0].toString(36)}${r[1].toString(36)}`.slice(0, 20);
  }
  write(globalThis.localStorage, PID, memoryPid);
  return memoryPid;
}

/** A big screen's own id, separate from the phone id on the same browser. */
export function screenId(): string {
  const key = "changle.screen";
  const saved = read(globalThis.localStorage, key);
  if (saved && /^tv-[a-z0-9]{6,24}$/.test(saved)) return saved;
  let r = "";
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    r = a[0].toString(36) + a[1].toString(36);
  } catch {
    r = Math.floor(Math.random() * 1e12).toString(36) + Date.now().toString(36);
  }
  const id = `tv-${r}`.slice(0, 20);
  write(globalThis.localStorage, key, id);
  return id;
}

export const savedName = () => read(globalThis.localStorage, NAME) ?? "";
export const saveName = (n: string) => write(globalThis.localStorage, NAME, n.trim().slice(0, 14));
export const lastRoom = () => read(globalThis.localStorage, LAST) ?? "";
export const saveLastRoom = (code: string | null) => write(globalThis.localStorage, LAST, code);

/** What the person asked for on the way in: open a new table (maybe with a game queued), or sit at an existing one. */
export type Intent = { code: string; create: boolean; name: string; game?: string };
export function setIntent(i: Intent) {
  write(globalThis.sessionStorage, INTENT, JSON.stringify(i));
}
export function readIntent(code: string): Intent | null {
  const raw = read(globalThis.sessionStorage, INTENT);
  if (!raw) return null;
  try {
    const i = JSON.parse(raw) as Intent;
    return i && i.code === code ? i : null;
  } catch {
    return null;
  }
}
export const clearIntent = () => write(globalThis.sessionStorage, INTENT, null);

export const QUEUE = "changle.queue";

/** Remember which game to put up first when this phone opens a new table. */
export function queueGame(code: string, game: string) {
  write(globalThis.sessionStorage, QUEUE, JSON.stringify({ code, game }));
}
