// The beats a room keeps of the dance being danced, and what it works out from them: the floor
// together (the combo bar on the TV) and the results. Pure. The phones do the scoring
// (party-base's scoreBeats, against the beat as the room hears it); the room only counts.
import { WINDOW_MS, summarize, type BeatScore, type Difficulty } from "../../../party-base/src/index";
import { COMBO_FULL, COMBO_QUORUM, type Floor, type PlayerResult, type Results } from "../shared/protocol";

/** A beat a phone hasn't sent (not yet, or its player wasn't dancing then). */
export const UNSEEN = 9999;

/**
 * Each dancer's beats, by dance beat: how far the move was from the beat in ms (negative: early),
 * null for no move near it, or UNSEEN. And the names they danced under, for the results of
 * someone who has left since.
 */
export interface Scores {
  names: Record<string, string>;
  offs: Record<string, (number | null)[]>;
}

export const emptyScores = (): Scores => ({ names: {}, offs: {} });

/** A phone that is this many beats behind the newest beat sent isn't dancing now. */
const LAG_BEATS = 8;

/** The furthest a move can be from its beat and still be a move (party-base's scoreBeats). */
const movedWindow = (d: Difficulty) => Math.min(300, WINDOW_MS[d] * 2);
const seen = (o: number | null | undefined): o is number | null => o !== undefined && o !== UNSEEN;
const isHit = (o: number | null | undefined, d: Difficulty) => typeof o === "number" && o !== UNSEEN && Math.abs(o) <= WINDOW_MS[d];
/** One past the last beat this dancer has sent. */
function seenThrough(row: readonly (number | null)[]): number {
  for (let b = row.length - 1; b >= 0; b--) if (row[b] !== UNSEEN) return b + 1;
  return 0;
}

/** A phone's beats `from`, `from + 1`, …: kept, over whatever it sent for them before. False: not beats of this dance. */
export function addBeats(s: Scores, playerId: string, name: string, from: number, offs: readonly unknown[], total: number, difficulty: Difficulty): boolean {
  if (!Number.isInteger(from) || from < 0 || offs.length < 1 || from + offs.length > total) return false;
  // (the room lets no such id in; a record keyed by "__proto__" or "toString" would go wrong)
  if (playerId in Object.prototype) return false;
  const limit = movedWindow(difficulty);
  let row = Object.hasOwn(s.offs, playerId) ? s.offs[playerId] : undefined;
  if (!row || row.length !== total) row = s.offs[playerId] = new Array<number | null>(total).fill(UNSEEN);
  s.names[playerId] = name;
  for (let i = 0; i < offs.length; i++) {
    const o = offs[i];
    row[from + i] = typeof o === "number" && Number.isFinite(o) && Math.abs(o) <= limit ? Math.round(o) : null;
  }
  return true;
}

/** 这一段再来: the beats from `fromBeat` on are danced again. */
export function clearFrom(s: Scores, fromBeat: number): void {
  for (const row of Object.values(s.offs)) for (let b = Math.max(0, fromBeat); b < row.length; b++) row[b] = UNSEEN;
}

/**
 * The floor together. A beat counts when most of those who danced it hit it (COMBO_QUORUM, the
 * rule of party-base's groupStreak; with everyone sending every beat the streak is the same
 * number). Beats are counted once every phone still dancing has sent them (`all`: every beat,
 * for the results), so a phone that stopped holds nothing up.
 */
export function floorOf(s: Scores, difficulty: Difficulty, all = false): Floor {
  const rows = Object.entries(s.offs);
  const through = rows.map(([, row]) => seenThrough(row));
  const newest = Math.max(0, ...through);
  const active = rows.filter((_, i) => through[i]! > 0 && through[i]! >= newest - LAG_BEATS);
  const settled = all ? newest : active.length ? Math.min(...active.map(([, row]) => seenThrough(row))) : 0;
  let streak = 0;
  let best = 0;
  let bursts = 0;
  for (let b = 0; b < settled; b++) {
    let dancers = 0;
    let hits = 0;
    for (const [, row] of rows) {
      const o = row[b];
      if (!seen(o)) continue;
      dancers++;
      if (isHit(o, difficulty)) hits++;
    }
    if (dancers > 0 && hits / dancers >= COMBO_QUORUM) {
      streak++;
      if (streak % COMBO_FULL === 0) bursts++;
      if (streak > best) best = streak;
    } else streak = 0;
  }
  const levels: Record<string, number> = {};
  for (const [id, row] of active) {
    let n = 0;
    let hits = 0;
    for (let b = seenThrough(row) - 1; b >= 0 && n < 8; b--) {
      const o = row[b];
      if (!seen(o)) continue;
      n++;
      if (isHit(o, difficulty)) hits++;
    }
    levels[id] = n ? hits / n : 0;
  }
  return { streak, best, bursts, dancers: active.length, levels };
}

/**
 * The results of a dance: everyone who sent a beat (`order`: the room's players as they joined;
 * dancers who have left since come after), each through party-base's summarize() over the whole
 * dance (a beat not sent is a beat not moved), the three awards, and the floor's numbers.
 */
export function resultsOf(s: Scores, order: readonly string[], routineId: string, difficulty: Difficulty, total: number): Results {
  const ids = [...order.filter((id) => Object.hasOwn(s.offs, id)), ...Object.keys(s.offs).filter((id) => !order.includes(id))];
  const players: PlayerResult[] = [];
  const moved: number[] = [];
  const hits: number[] = [];
  for (const id of ids) {
    const row = s.offs[id]!;
    if (!row.some((o) => o !== UNSEEN)) continue;
    const beats: BeatScore[] = [];
    let run = 0;
    let best = 0;
    for (let b = 0; b < total; b++) {
      const o = row[b];
      const off = seen(o) ? o : null;
      const hit = isHit(o, difficulty);
      beats.push({ beat: b, moved: off !== null, offsetMs: off, hit });
      run = hit ? run + 1 : 0;
      if (run > best) best = run;
    }
    const sum = summarize(beats, difficulty);
    players.push({ id, name: s.names[id] ?? "", participation: sum.participation, hitRate: sum.hitRate, movedRate: sum.movedRate, meanAbsOffsetMs: Number.isFinite(sum.meanAbsOffsetMs) ? Math.round(sum.meanAbsOffsetMs) : null, bestStreak: best });
    moved.push(beats.filter((x) => x.moved).length);
    hits.push(beats.filter((x) => x.hit).length);
  }
  const floor = floorOf(s, difficulty, true);
  return {
    routineId,
    difficulty,
    beats: total,
    players,
    awards: awards(players, moved, hits, total),
    bestStreak: floor.best,
    bursts: floor.bursts,
    together: players.length ? Math.round((100 * players.reduce((a, p) => a + p.movedRate, 0)) / players.length) : 0,
  };
}

/**
 * 最稳 (closest to the beat, among those who hit a quarter of the dance when anyone did), 最嗨 (the
 * longest run of beats hit), 最努力 (the most beats moved). One each while there are dancers
 * without one; a tie goes to whoever joined first. Nobody who never moved gets one.
 */
function awards(players: PlayerResult[], moved: number[], hits: number[], total: number): Results["awards"] {
  const taken = new Set<string>();
  const pick = (score: (i: number) => number | null): string | null => {
    const can = players.flatMap((p, i) => {
      const v = score(i);
      return v === null ? [] : [{ id: p.id, v }];
    });
    const pool = can.some((x) => !taken.has(x.id)) ? can.filter((x) => !taken.has(x.id)) : can;
    let top = pool[0];
    for (const x of pool) if (x.v > top!.v) top = x;
    if (!top) return null;
    taken.add(top.id);
    return top.id;
  };
  const enough = Math.max(4, Math.ceil(total / 4));
  const anyEnough = hits.some((h) => h >= enough);
  return {
    steady: pick((i) => (players[i]!.meanAbsOffsetMs === null || (anyEnough && hits[i]! < enough) ? null : -players[i]!.meanAbsOffsetMs!)),
    hype: pick((i) => (players[i]!.bestStreak > 0 ? players[i]!.bestStreak : null)),
    effort: pick((i) => (moved[i]! > 0 ? moved[i]! : null)),
  };
}
