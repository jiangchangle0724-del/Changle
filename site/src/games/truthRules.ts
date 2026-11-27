import type { Prompt } from "../data/truthDare";
import { shuffle } from "../lib/random";

/**
 * Who a fair bottle may land on, after the open-source game Dare Me (whose spin skips anyone picked
 * more often than the table's average): never the one spinning, nobody away from the table, and
 * nobody picked two times more than whoever has been picked least. The one spinning is the one it
 * picked last time, so it never picks the same person twice in a row. It still surprises (someone
 * can come up again before everyone has had a turn), but nobody sits out all night. When that leaves
 * no one (a table of one, everyone away): anyone but the spinner.
 */
export function fairSeats(
  ids: readonly string[],
  o: {
    spinner?: string | null;
    picked?: Readonly<Record<string, number>>;
    away?: (id: string) => boolean;
  },
): string[] {
  const times = (id: string) => o.picked?.[id] ?? 0;
  const here = ids.filter((id) => id !== o.spinner && !o.away?.(id));
  if (here.length) {
    const least = Math.min(...here.map(times));
    return here.filter((id) => times(id) <= least + 1);
  }
  const others = ids.filter((id) => id !== o.spinner);
  return others.length ? others : [...ids];
}

// in ems, measured on the ring's bold type: a Chinese character is one, a Latin letter a little over half
const wide = (c: string) => (c.codePointAt(0) ?? 0) >= 0x2e80;
const widthOf = (chars: string[]) => chars.reduce((w, c) => w + (wide(c) ? 1 : 0.58), 0);

/**
 * A name in its circle on the ring: as big as fits, smaller for a long one, cut short with … only
 * when even the smallest size won't hold it. `room` and the sizes are in the ring's own units.
 */
export function fitName(name: string, base: number, room = 42, min = 8.5): { text: string; size: number } {
  const chars = [...name.trim()];
  const full = widthOf(chars);
  if (full * base <= room) return { text: name.trim(), size: base };
  if (full * min <= room) return { text: name.trim(), size: Math.floor((room / full) * 10) / 10 };
  let cut = chars.length;
  while (cut > 1 && (widthOf(chars.slice(0, cut)) + 0.8) * min > room) cut--;
  return { text: chars.slice(0, cut).join("") + "…", size: min };
}

/* ---------- what one phone keeps between games ---------- */

export type OwnCard = { id: string; k: "truth" | "dare"; text: string };
export const OWN_MAX = 40;
export const OWN_TEXT = 60;
const OWN_KEY = "changle.truth.own.v1";
const SEEN_KEY = "changle.truth.seen.v1";

/** The table's own cards on this phone (kept for the next game too). */
export function readOwn(): OwnCard[] {
  try {
    const list = JSON.parse(localStorage.getItem(OWN_KEY) ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((c): c is OwnCard => !!c && typeof c === "object" && typeof c.id === "string" && typeof c.text === "string" && (c.k === "truth" || c.k === "dare"))
      .slice(0, OWN_MAX);
  } catch {
    return [];
  }
}

export function writeOwn(list: OwnCard[]) {
  try {
    localStorage.setItem(OWN_KEY, JSON.stringify(list.slice(0, OWN_MAX)));
  } catch {
    /* private mode or full: the cards last for this game only */
  }
}

type Seen = { truth: string[]; dare: string[] };

function readSeen(): Seen {
  try {
    const s = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Partial<Seen>;
    return {
      truth: Array.isArray(s.truth) ? s.truth : [],
      dare: Array.isArray(s.dare) ? s.dare : [],
    };
  } catch {
    return { truth: [], dare: [] };
  }
}

/** A card this phone has dealt: the next games deal the others first. */
export function markSeen(kind: "truth" | "dare", card: Prompt) {
  try {
    const seen = readSeen();
    if (!seen[kind].includes(card.zh)) seen[kind].push(card.zh);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* nothing kept: the next game shuffles all of them again */
  }
}

/**
 * The order to deal `cards` in, for `Deck.restore` (places in the list; it deals from the end): the
 * ones this phone hasn't dealt in earlier games come first, so a table that plays every week doesn't
 * keep meeting the same cards. Once every card has come up, the phone forgets them and starts over.
 */
export function freshFirst(kind: "truth" | "dare", cards: readonly Prompt[]): number[] {
  const seen = new Set(readSeen()[kind]);
  const places = cards.map((_, i) => i);
  const fresh = places.filter((i) => !seen.has(cards[i].zh));
  if (!fresh.length) {
    try {
      const all = readSeen();
      const mine = new Set(cards.map((c) => c.zh));
      all[kind] = all[kind].filter((zh) => !mine.has(zh));
      localStorage.setItem(SEEN_KEY, JSON.stringify(all));
    } catch {
      /* as above */
    }
    return shuffle(places);
  }
  return [...shuffle(places.filter((i) => seen.has(cards[i].zh))), ...shuffle(fresh)];
}
