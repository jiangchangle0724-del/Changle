/**
 * The way from a table into a game that has a stage of its own (一起跳 at changle.ca/party, 抓紧了 at
 * changle.ca/hang-on) and back, shared by the two. Each game lives on its own Worker on the same
 * site, so it shares this phone's storage: the host's phone opens a room there and hands its code
 * to the table; every phone goes there as a player with its name and language, and the big screen
 * (or a phone that only watches) opens the game's stage. Each game's own details (where its pages
 * are, how a room is opened) are in its `link.ts`: `../dance/link.ts`, `../hangon/link.ts`.
 */
import type { LucideIcon } from "lucide-react";
import type { T } from "../../i18n";

export type Lang = "zh" | "en";

export type Opened = { code: string; phone?: boolean } | { error: string };

/** What a game needs to know to be opened from the table. */
export type OpenAsk = {
  /** this table's number */
  table: string;
  /** a big screen is at the table (a TV on /tv, or a phone that only watches): the game's stage goes there */
  screen: boolean;
};

/** Which phone is going, for the address it goes to. */
export type Going = {
  /** the table's host */
  host: boolean;
  /** the room was opened phones-only (抓紧了 with no big screen): the host's phone is the stage and plays too */
  phone: boolean;
};

/** The table's hand-off to one such game. */
export type StageLink = {
  id: "dance" | "hangon";
  icon: LucideIcon;
  /** who it's for, on its card */
  who: T;
  /** how it goes, in its 「怎么玩」 */
  rules: T[];
  /** what the game calls its big screen (舞台, 大屏) */
  stageName: T;
  /** what the stage is, on a phone that only watches and on the TV */
  stageLead: T;
  /** The host's phone opens a room there for this table (`phone` when it opened a phones-only one). */
  open: (ask: OpenAsk) => Promise<Opened>;
  /** Where a phone plays. */
  phoneUrl: (code: string, table: string, going: Going) => string;
  /** Where the stage is (the big screen's page). */
  stageUrl: (code: string, table: string) => string;
  /** What the game should know about this phone before it gets there (its name, its language, the room). */
  handOff: (code: string, name: string, lang: Lang, sound: boolean) => void;
  /**
   * How a game is going, from its server: null while its server has no such answer (then the table
   * can't tell on its own, and the host ends the game here when everyone is back).
   */
  phase: ((code: string) => Promise<"lobby" | "playing" | "over" | "gone" | null>) | null;
  /** the table's host joins first and the others follow a moment later (where the game's host is whoever joins first) */
  hostFirst: boolean;
};

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the game asks again
  }
}

function session(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // no session storage: every visit counts as the first
  }
  return null;
}

/** Each phone (and the big screen) goes into a game by itself once; after that (it came back to the table) it asks. */
export const wentTo = (id: string, code: string, screen = false) => session(`${id}.went${screen ? ".tv" : ""}`) === code;
export const markWent = (id: string, code: string, screen = false) => void session(`${id}.went${screen ? ".tv" : ""}`, code);

/**
 * The game sent this page back because the game is over (`sessionStorage["<id>.over"]` = the code,
 * set by the game's page before it comes back to the table; read once). Neither game sets it yet.
 */
export function cameBackFromEnd(id: string, code: string, screen = false): boolean {
  const key = `${id}.over${screen ? ".tv" : ""}`;
  if (session(key) !== code) return false;
  session(key, null);
  return true;
}

/** A room opened over HTTP: the code the server gave, or why not. */
export async function openRoom(url: string, body: unknown, codeRe: RegExp): Promise<Opened> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { code?: unknown; error?: unknown };
    if (response.ok && typeof data.code === "string" && codeRe.test(data.code.toUpperCase())) return { code: data.code.toUpperCase() };
    return { error: typeof data.error === "string" ? data.error : "busy" };
  } catch {
    return { error: "offline" };
  }
}
