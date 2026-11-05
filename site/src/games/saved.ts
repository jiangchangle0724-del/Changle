import type { GameId } from "./registry";

/**
 * A game's progress, kept on this phone (UI plan: 中途离开). A game that keeps one writes it as it
 * goes; a reload, a crash, or the phone closing the page loses nothing, and opening the game again
 * asks 这局还在，回来继续？ (Resume.tsx). It is only for the same people at the table, for 12 hours,
 * and for the same version of that game's progress (a game that changes what it keeps bumps it).
 */
export type SavedGame<D = unknown> = {
  /** the game's own version of what it keeps */
  v: number;
  /** when it was last written (ms) */
  at: number;
  /** the table it belongs to: tonight's people, ids and names */
  table: string;
  data: D;
  /** the shell's count of penalties so far, by name (the people row's dots, the tally) */
  dots?: Record<string, number>;
};

const KEEP_MS = 12 * 3600_000;
const key = (id: GameId) => `changle.game.${id}`;

/** Tonight's people as one string: a game kept for other people isn't offered. */
export const tableOf = (players: { id: string; name: string }[]) => players.map((p) => `${p.id}:${p.name}`).join("|");

function read(id: GameId): SavedGame | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as SavedGame) : null;
  } catch {
    return null;
  }
}

/** This game's progress for these people, if there is one to go back to. */
export function readSaved<D>(id: GameId, v: number, table: string): SavedGame<D> | null {
  const s = read(id);
  if (!s || s.v !== v || s.table !== table || !(Date.now() - s.at < KEEP_MS)) return null;
  return s as SavedGame<D>;
}

/** the shell's latest penalty count per game, for a game that starts keeping only after it */
const latestDots = new Map<GameId, Record<string, number>>();

/** Keep the game's progress, with the shell's penalty count so far. */
export function writeSaved<D>(id: GameId, s: Omit<SavedGame<D>, "at" | "dots">) {
  try {
    const before = read(id);
    const dots = latestDots.get(id) ?? (before && before.table === s.table ? before.dots : undefined);
    localStorage.setItem(key(id), JSON.stringify({ ...s, at: Date.now(), dots }));
  } catch {
    // private browsing, or full: the game still plays, it just can't come back after a reload
  }
}

/** The shell's penalty count, kept with the game's progress (now, or when the game starts keeping). */
export function writeSavedDots(id: GameId, dots: Record<string, number>) {
  latestDots.set(id, dots);
  try {
    const s = read(id);
    if (s) localStorage.setItem(key(id), JSON.stringify({ ...s, dots }));
  } catch {
    // as above
  }
}

export function clearSaved(id: GameId) {
  latestDots.delete(id);
  try {
    localStorage.removeItem(key(id));
  } catch {
    // as above
  }
}
