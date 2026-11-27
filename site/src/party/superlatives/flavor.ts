import type { T } from "../../i18n";

/**
 * The line under a winner: what the vote said beyond the name. A tie, the same person again and
 * again (the table's cue to spread the awards around, as the card game's "someone else" rule has
 * it), every vote on one person, or a single vote in it. One line at most, in this order.
 */
export type Flavor = { kind: "tie" | "streak" | "unanimous" | "close"; text: T };

/** awards in a row before the table is nudged to pick someone else */
export const STREAK_NUDGE = 3;

export function flavorOf({ winners, counts, voted, streak, name }: { winners: string[]; counts: Record<string, number>; voted: string[]; streak: number; name: (id: string) => string }): Flavor | null {
  if (winners.length > 1) return { kind: "tie", text: { zh: "平票，一起拿", en: "A tie: they share it" } };
  const w = winners[0];
  if (!w) return null;
  if (streak >= STREAK_NUDGE) return { kind: "streak", text: { zh: `${name(w)} 连拿 ${streak} 个奖了，下一个换个人？`, en: `${streak} in a row for ${name(w)}. Someone else next?` } };
  // every vote but the winner's own (nobody votes for themselves) went to the winner
  const top = counts[w] ?? 0;
  const others = voted.length - (voted.includes(w) ? 1 : 0);
  if (others >= 2 && top === others) return { kind: "unanimous", text: { zh: "全票通过！", en: "Unanimous!" } };
  const sorted = Object.values(counts).sort((a, b) => b - a);
  if (sorted.length > 1 && sorted[0] - sorted[1] === 1) return { kind: "close", text: { zh: "一票险胜", en: "Won by a single vote" } };
  return null;
}

/** The winner's moment, every time. */
export const SPEECH: T = { zh: "请发表获奖感言", en: "Acceptance speech, please" };

/**
 * The mind reader of the night: whoever voted with the room most often (a vote for the winner is
 * a hit). Nobody, if nobody hit once; several, if they tie.
 */
export function mindReader(hits: Record<string, number>, of: number): { ids: string[]; hits: number; of: number } | null {
  const best = Math.max(0, ...Object.values(hits));
  if (best < 1 || of < 1) return null;
  return { ids: Object.keys(hits).filter((id) => hits[id] === best), hits: best, of };
}

/** The mind reader's line. */
export const mindLine = (names: string[], hits: number, of: number): T => ({
  zh: `读心术奖：${names.join("、")}，${of} 个奖猜中 ${hits} 个`,
  en: `Mind reader: ${names.join(", ")}, called ${hits} of ${of}`,
});
