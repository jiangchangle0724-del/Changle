/**
 * What 一本正经 tells the server, and what each phone remembers: a round's outcome for the card's
 * numbers, a card a player flags, the numbers to show at the reveal, and the cards this phone has
 * already played (so the next game deals others first). The server side is worker/straightface.ts.
 * Nothing here may stop the game: every call swallows its own failure.
 */
import { api } from "../../lib/api";

export type Reason = "wrong" | "easy" | "unfit" | "other";
export const REASONS: Reason[] = ["wrong", "easy", "unfit", "other"];

/** A round was scored with this card: the judge fooled or not, at a table of `players`. */
export function sendRound(card: string, fooled: boolean, players: number) {
  void api("/sf/round", { body: { card, fooled, players } }).catch(() => {});
}

/** A player says this card is off. Resolves false when it didn't go through. */
export async function sendReport(card: string, reason: Reason, note: string, lang: "zh" | "en"): Promise<boolean> {
  try {
    await api("/sf/report", { body: { card, reason, note, lang } });
    return true;
  } catch {
    return false;
  }
}

/** Rounds played and judges fooled, per card id (once a session; empty when it can't be had). */
let stats: Promise<Record<string, [number, number]>> | null = null;
export function cardStats(): Promise<Record<string, [number, number]>> {
  stats ??= api<{ cards: Record<string, [number, number]> }>("/sf/stats")
    .then((r) => r.cards ?? {})
    .catch(() => {
      stats = null;
      return {};
    });
  return stats;
}

const SEEN = "changle.sf.seen";
/** How many played cards a phone remembers (the most recent). */
export const SEEN_MAX = 300;

/** The cards this phone has played, most recent last. */
export function seenCards(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-SEEN_MAX) : [];
  } catch {
    return [];
  }
}

export function markSeen(card: string) {
  try {
    const list = seenCards().filter((x) => x !== card);
    list.push(card);
    localStorage.setItem(SEEN, JSON.stringify(list.slice(-SEEN_MAX)));
  } catch {
    /* private mode: the next game may repeat a card */
  }
}
