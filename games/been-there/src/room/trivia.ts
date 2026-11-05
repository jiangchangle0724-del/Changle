// The waiting teams' quiz (抢答): which question comes next. The questions themselves are plain data in
// triviaBank.ts. Only the room imports these (the server, and the one-phone demo that runs the room in
// the page), and the server's list of sources for the credits page: phones never hold the answers.
import { CITIES } from "../engine";
import { SEEN_KEEP } from "./protocol";
import { TRIVIA, type TriviaQuestion } from "./triviaBank";

export { SEEN_KEEP, TRIVIA, type TriviaQuestion };

export const TRIVIA_BY_ID: ReadonlyMap<string, TriviaQuestion> = new Map(TRIVIA.map((q) => [q.id, q]));

/** What a question's id looks like: the city's id, a dash, two or three digits ("cairo-01"). */
export const TRIVIA_ID = /^[a-z]{2,20}-\d{2,3}$/;

/**
 * The 22 questions from before they had ids, in their old order: rooms and saves from then counted
 * them by their place in that list.
 */
export const LEGACY_ORDER = [
  "cairo-01",
  "capetown-01",
  "buenosaires-01",
  "mexicocity-01",
  "rio-01",
  "istanbul-01",
  "mumbai-01",
  "dubai-01",
  "lasvegas-01",
  "vancouver-01",
  "newyork-01",
  "tokyo-01",
  "beijing-01",
  "shanghai-01",
  "bangkok-01",
  "sydney-01",
  "singapore-01",
  "venice-01",
  "paris-01",
  "london-01",
  "seoul-01",
  "hongkong-01",
];

export interface PickOptions {
  /** Asked already this game: never again. */
  asked: readonly string[];
  /** Cities the team on turn could land on with this throw (its arrival card would give the answer away). */
  near: ReadonlySet<string>;
  /** The question ids each phone the question is for has seen in earlier games. */
  seen: readonly (readonly string[])[];
  /** Numbers in [0, 1). */
  random: () => number;
  /** Tests only: another bank. */
  bank?: readonly TriviaQuestion[];
}

/**
 * The next question's id, or null once every question has been asked this game. Never one asked
 * already; then, where there's a choice: not about a city the team on turn could land on, one the
 * fewest of the phones have seen before, about a city asked about least so far this game.
 */
export function pickTrivia(o: PickOptions): string | null {
  const bank = o.bank ?? TRIVIA;
  const asked = new Set(o.asked);
  const fresh = bank.filter((q) => !asked.has(q.id));
  if (!fresh.length) return null;
  const seen = o.seen.map((ids) => new Set(ids));
  const cityOf = new Map(bank.map((q) => [q.id, q.city]));
  const perCity = new Map<string, number>();
  for (const id of o.asked) {
    const city = cityOf.get(id) ?? id.replace(/-\d+$/, "");
    perCity.set(city, (perCity.get(city) ?? 0) + 1);
  }
  const score = (q: TriviaQuestion) => [o.near.has(q.city) ? 1 : 0, seen.filter((s) => s.has(q.id)).length, perCity.get(q.city) ?? 0];
  let best: number[] | null = null;
  let pool: TriviaQuestion[] = [];
  for (const q of fresh) {
    const s = score(q);
    const cmp = best ? compare(s, best) : -1;
    if (cmp < 0) {
      best = s;
      pool = [q];
    } else if (cmp === 0) pool.push(q);
  }
  return pool[Math.floor(o.random() * pool.length)].id;
}

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/** Every question's source, grouped by city in board order, each listed once (the credits page). */
export function triviaSources(bank: readonly TriviaQuestion[] = TRIVIA): { city: string; sources: string[] }[] {
  return CITIES.map((c) => ({ city: c.id, sources: [...new Set(bank.filter((q) => q.city === c.id).map((q) => q.source))] })).filter((x) => x.sources.length);
}

/** A list of question ids a phone sent: only things that look like ids, each once, the newest SEEN_KEEP. */
export function cleanSeen(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out: string[] = [];
  const have = new Set<string>();
  for (const id of ids.slice(-SEEN_KEEP * 2)) {
    if (typeof id !== "string" || !TRIVIA_ID.test(id) || have.has(id)) continue;
    have.add(id);
    out.push(id);
  }
  return out.slice(-SEEN_KEEP);
}
