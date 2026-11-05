// What this phone remembers: who it is (to get back to the same seat), name, language, sound, and the
// quiz questions it has been asked.
import { SEEN_KEEP, type Lang } from "../room/protocol";

const memory = new Map<string, string>();
function get(k: string): string | null {
  try {
    return localStorage.getItem(k) ?? memory.get(k) ?? null;
  } catch {
    return memory.get(k) ?? null;
  }
}
function set(k: string, v: string) {
  memory.set(k, v);
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: keep it for this visit only
  }
}

function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  if (typeof globalThis.crypto?.getRandomValues === "function") crypto.getRandomValues(a);
  else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This device's id and secret key. The key proves to the server that the seat is ours after a reconnect. */
export function identity(scope = "") {
  let cid = get(`bt.cid${scope}`);
  let key = get(`bt.key${scope}`);
  if (!cid || !key) {
    cid = randomId(12);
    key = randomId(24);
    set(`bt.cid${scope}`, cid);
    set(`bt.key${scope}`, key);
  }
  return { cid, key };
}

const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const prefs = {
  get name() {
    return get("bt.name") ?? "";
  },
  set name(v: string) {
    set("bt.name", v);
  },
  get lang(): Lang {
    const v = get("bt.lang");
    if (v === "zh" || v === "en") return v;
    return typeof navigator !== "undefined" && /^zh/i.test(navigator.language) ? "zh" : navigator?.language ? "en" : "zh";
  },
  set lang(v: Lang) {
    set("bt.lang", v);
  },
  get muted() {
    return get("bt.muted") === "1";
  },
  set muted(v: boolean) {
    set("bt.muted", v ? "1" : "0");
  },
  get reduced() {
    const v = get("bt.reduced");
    return v === null ? prefersReduced() : v === "1";
  },
  set reduced(v: boolean) {
    set("bt.reduced", v ? "1" : "0");
  },
  /** Buzz on your turn, the dice and money (where the phone can vibrate). On unless turned off. */
  get haptics() {
    return get("bt.haptics") !== "0";
  },
  set haptics(v: boolean) {
    set("bt.haptics", v ? "1" : "0");
  },
  /** Play the team's own moves from behind its token (first-person). On unless turned off. */
  get ride() {
    return get("bt.ride") !== "0";
  },
  set ride(v: boolean) {
    set("bt.ride", v ? "1" : "0");
  },
  /** The speed test's readout (frame times, tap to screen). Off unless turned on. */
  get speed() {
    return get("bt.speed") === "1";
  },
  set speed(v: boolean) {
    set("bt.speed", v ? "1" : "0");
  },
  /** Shake the phone to roll (where it can feel motion). On unless turned off. */
  get shake() {
    return get("bt.shake") !== "0";
  },
  set shake(v: boolean) {
    set("bt.shake", v ? "1" : "0");
  },
};

const SEEN = "bt.seenTrivia";

/**
 * The waiting teams' questions this phone has been asked (their ids, oldest first, the newest
 * SEEN_KEEP). It sends them when it joins a room, which then asks it ones it hasn't seen first.
 */
export function seenTrivia(): string[] {
  try {
    const list: unknown = JSON.parse(get(SEEN) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(-SEEN_KEEP) : [];
  } catch {
    return [];
  }
}

/** This phone has been asked question `id`. */
export function rememberTrivia(id: string) {
  const list = seenTrivia().filter((x) => x !== id);
  list.push(id);
  set(SEEN, JSON.stringify(list.slice(-SEEN_KEEP)));
}
