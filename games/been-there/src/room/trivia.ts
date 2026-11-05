// The waiting teams' quiz (抢答): which question a landing brings. The questions themselves are plain
// data in triviaBank.ts. Only the room imports these (the server, and the one-phone demo that runs the
// room in the page), and the server's list of sources for the credits page: phones never hold the answers.
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

const RULE_SOURCE: ReadonlyMap<string, string> = new Map(CITIES.map((c) => [c.id, c.source]));

/**
 * Whether a city's arrival card answers this question: the one taken from the page the city's rule
 * comes from. Its fact is the 真实事实 a big screen prints on the card when a team lands there.
 */
export const onArrivalCard = (q: TriviaQuestion) => RULE_SOURCE.get(q.city) === q.source;

export interface PickOptions {
  /** The city a team has just landed on: the question is about it. */
  city: string;
  /** Asked already this game: never again. */
  asked: readonly string[];
  /** A big screen is on, with the city's arrival card up: not the question that card answers. */
  cardShown: boolean;
  /** The question ids each phone the question is for has seen in earlier games. */
  seen: readonly (readonly string[])[];
  /** Numbers in [0, 1). */
  random: () => number;
  /** Tests only: another bank. */
  bank?: readonly TriviaQuestion[];
}

/**
 * A question about `city`, or null when this game has none left to ask about it. Never one asked
 * already this game, nor, with the arrival card up on a big screen, the one that card answers; where
 * there's a choice, one the fewest of the phones have seen before.
 */
export function pickTrivia(o: PickOptions): string | null {
  const asked = new Set(o.asked);
  const fresh = (o.bank ?? TRIVIA).filter((q) => q.city === o.city && !asked.has(q.id) && !(o.cardShown && onArrivalCard(q)));
  if (!fresh.length) return null;
  const seen = o.seen.map((ids) => new Set(ids));
  const times = (q: TriviaQuestion) => seen.filter((s) => s.has(q.id)).length;
  const least = Math.min(...fresh.map(times));
  const pool = fresh.filter((q) => times(q) === least);
  return pool[Math.floor(o.random() * pool.length)].id;
}

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
