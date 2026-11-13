import { PUNCH_FINAL, PUNCH_PROMPTS, PUNCH_SAFETY } from "../../../data/punchline";
import type { T } from "../../../i18n";
import type { PunchMatch, PunchView } from "../../protocol";
import {
  countWriters,
  FINAL_RESULT_MS,
  FINAL_VOTE_MS,
  FINAL_VOTES,
  FINAL_WRITE_MS,
  finalPoints,
  headToHeadPoints,
  MAX_WRITERS,
  nextWriters,
  presentMs,
  RESULT_MS,
  ROUNDS,
  SCORES_MS,
  VOTE_MS,
  WRITE_MS,
} from "../../punchline";
import { byPenalty, clean, range, t, type Api, type GameDef } from "../api";

/**
 * Punchline (a Quiplash-style game), staged as a show. Rounds 1 and 2: every prompt goes to two
 * writers, every writer gets two prompts. Each matchup is presented (prompt, then the two
 * answers), everyone else votes (the audience too), then the votes, the names and the points
 * are revealed. The last round: one prompt, everyone answers, everyone picks up to three.
 * Up to eight people write; anyone else at the table is the audience, and writes first when the
 * table plays again. Losing a head-to-head costs a sip (two if it was a clean sweep); last place
 * drinks a full glass at the end.
 */

type Match = {
  prompt: T;
  authors: string[];
  answers: string[];
  safety: boolean[];
  /** display order: order[slot] is the author index shown in that slot */
  order: number[];
  /** voter -> the slots they picked (one in a head-to-head, up to three in the final) */
  votes: Record<string, number[]>;
  counts: number[];
  points: number[];
  /** author index of a clean sweep */
  sweep: number | null;
  forfeit: boolean;
  done: boolean;
};

type S = {
  phase: PunchView["phase"];
  round: number;
  rounds: number;
  /** who writes this game, in seat order */
  players: string[];
  /** games each player has written at this table, this one included (missing in a game saved before it was counted) */
  written?: Record<string, number>;
  matches: Match[];
  cur: number;
  phaseAt: number;
  endsAt: number;
  /** counts every change of phase: a host's tap names the step it was made on */
  step: number;
  scores: Record<string, number>;
  /** scores when this round started: the board races from these */
  before: Record<string, number>;
  /** the three piles (prompts, final prompts, stock answers) last across 再来一局 */
  deck: number[];
  finalDeck: number[];
  safetyDeck: number[];
  /** each pile's latest cards, newest last (missing in a game saved before piles remembered them) */
  latest?: Partial<Record<Pile, number[]>>;
  winners: string[] | null;
  last: string[] | null;
};

type Pile = "deck" | "finalDeck" | "safetyDeck";

/** A pile remembers two whole games' head-to-heads at a full table: the last game and this one so far. */
const REMEMBER = 2 * MAX_WRITERS * (ROUNDS - 1);

const isFinal = (s: S) => s.round >= s.rounds;
const writersHere = (s: S, api: Api) => s.players.filter((pid) => api.has(pid));

/**
 * Deal `n` cards from one of the game's piles, from its end. When the pile runs short, its next
 * pass goes under what's left: a shuffle of every other card, with the ones dealt lately at the
 * bottom. So nothing comes twice in a game, and a table that plays again doesn't get the prompts
 * it just had.
 */
function deal(s: S, pile: Pile, size: number, n: number, api: Api): number[] {
  const deck = s[pile];
  const latest = ((s.latest ??= {})[pile] ??= []);
  // a pile saved before its content changed may still hold cards that are gone
  for (let i = deck.length - 1; i >= 0; i--) if (deck[i] >= size) deck.splice(i, 1);
  const keep = Math.min(REMEMBER, Math.floor(size / 2));
  while (deck.length < n && size > 0) {
    const left = new Set(deck);
    const lately = latest.filter((c) => c < size && !left.has(c));
    const rest = range(size).filter((c) => !left.has(c) && !lately.includes(c));
    const pass = [...api.shuffle(lately), ...api.shuffle(rest)];
    // a pile smaller than one deal: repeats can't be helped
    if (!pass.length) pass.push(...api.shuffle(range(size)));
    deck.unshift(...pass);
  }
  const out = range(Math.min(n, deck.length)).map(() => deck.pop()!);
  latest.push(...out);
  latest.splice(0, Math.max(0, latest.length - keep));
  return out;
}

function setPhase(s: S, phase: S["phase"], ms: number, timer: string, api: Api) {
  s.step = (s.step ?? 0) + 1;
  s.phase = phase;
  s.phaseAt = api.now;
  s.endsAt = api.now + ms;
  api.timer(timer, s.endsAt);
}

function startRound(s: S, api: Api) {
  const writers = api.shuffle(writersHere(s, api));
  s.cur = 0;
  s.before = { ...s.scores };
  if (!isFinal(s)) {
    const n = writers.length;
    const cards = deal(s, "deck", PUNCH_PROMPTS.length, n, api);
    s.matches = range(n).map((k) => blankMatch(PUNCH_PROMPTS[cards[k]], [writers[k], writers[(k + 1) % n]], api));
    setPhase(s, "write", WRITE_MS, "write", api);
  } else {
    s.matches = [blankMatch(PUNCH_FINAL[deal(s, "finalDeck", PUNCH_FINAL.length, 1, api)[0]], writers, api)];
    setPhase(s, "write", FINAL_WRITE_MS, "write", api);
  }
}

function blankMatch(prompt: T, authors: string[], api: Api): Match {
  return {
    prompt,
    authors,
    answers: authors.map(() => ""),
    safety: authors.map(() => false),
    order: api.shuffle(range(authors.length)),
    votes: {},
    counts: authors.map(() => 0),
    points: authors.map(() => 0),
    sweep: null,
    forfeit: false,
    done: false,
  };
}

function allWritten(s: S, api: Api) {
  return s.matches.every((m) => m.answers.every((a, i) => a || !api.has(m.authors[i])));
}

/** Who may vote on this matchup: everyone at the table but its writers (the final: everyone). */
function voters(s: S, m: Match, api: Api) {
  return api.ids().filter((pid) => isFinal(s) || !m.authors.includes(pid));
}

/** The slots a voter may pick: answered, and not their own. */
function choices(m: Match, pid: string) {
  return m.order.map((ai, slot) => ({ ai, slot })).filter(({ ai }) => m.answers[ai] && m.authors[ai] !== pid);
}

const allowance = (s: S, m: Match, pid: string) => (isFinal(s) ? Math.min(FINAL_VOTES, choices(m, pid).length) : 1);

/** Present matchup `i` (or the next one worth presenting), or end the round. */
function present(s: S, i: number, api: Api) {
  api.clear("write");
  api.clear("next");
  while (i < s.matches.length) {
    const m = s.matches[i];
    const filled = m.answers.filter(Boolean).length;
    if (filled === 0) {
      m.done = true;
      i++;
      continue;
    }
    if (!isFinal(s) && filled === 1) {
      // one of the two left it blank: the other takes it without a vote
      s.cur = i;
      settle(s, api, true);
      return;
    }
    break;
  }
  if (i >= s.matches.length) return endRound(s, api);
  s.cur = i;
  const m = s.matches[i];
  setPhase(s, "present", presentMs(m.answers.length, isFinal(s)), "present", api);
}

function openVote(s: S, api: Api) {
  api.clear("present");
  setPhase(s, "vote", isFinal(s) ? FINAL_VOTE_MS : VOTE_MS, "vote", api);
}

function settle(s: S, api: Api, forfeit = false) {
  api.clear("vote");
  api.clear("present");
  const m = s.matches[s.cur];
  const counts = m.authors.map(() => 0);
  for (const slots of Object.values(m.votes)) for (const slot of slots) counts[m.order[slot]] += 1;
  m.counts = counts;
  m.forfeit = forfeit;
  if (isFinal(s)) {
    m.points = finalPoints(counts, m.safety);
  } else if (forfeit) {
    const winner = m.answers.findIndex(Boolean);
    m.points = m.authors.map((_, i) => (i === winner ? (m.safety[i] ? 250 : 500) * s.round : 0));
    const blank = 1 - winner;
    if (api.has(m.authors[blank])) api.penalty([m.authors[blank]], "two", t("神回复：交了白卷", "Punchline: left it blank"), { delay: 1500 });
  } else {
    const r = headToHeadPoints(counts, s.round, m.safety);
    m.points = r.points;
    m.sweep = r.sweep >= 0 ? r.sweep : null;
    if (r.winner >= 0) {
      const loser = 1 - r.winner;
      if (api.has(m.authors[loser]))
        api.penalty(
          [m.authors[loser]],
          r.sweep >= 0 ? "two" : "sip",
          r.sweep >= 0 ? t("神回复：一票都没有", "Punchline: not a single vote") : byPenalty(api, t("神回复：票少的喝", "Punchline: fewer votes drinks"), t("神回复：票少的受罚", "Punchline: fewer votes takes the penalty")),
          { delay: 5200 },
        );
    }
  }
  m.authors.forEach((pid, i) => {
    s.scores[pid] = (s.scores[pid] ?? 0) + m.points[i];
  });
  m.done = true;
  setPhase(s, "result", isFinal(s) ? FINAL_RESULT_MS : RESULT_MS, "next", api);
}

function endRound(s: S, api: Api) {
  api.clear("next");
  if (isFinal(s)) {
    s.step = (s.step ?? 0) + 1;
    s.phase = "end";
    s.phaseAt = api.now;
    s.endsAt = 0;
    const ids = writersHere(s, api);
    const vals = ids.map((pid) => s.scores[pid] ?? 0);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    s.winners = ids.filter((pid) => (s.scores[pid] ?? 0) === hi);
    s.last = lo < hi ? ids.filter((pid) => (s.scores[pid] ?? 0) === lo) : [];
    if (s.last.length) api.penalty(s.last, "full", t("神回复：最后一名", "Punchline: last place"), { delay: 6500 });
    return;
  }
  setPhase(s, "scores", SCORES_MS, "next", api);
}

function advance(s: S, api: Api) {
  if (s.phase === "result") present(s, s.cur + 1, api);
  else if (s.phase === "scores") {
    s.round += 1;
    startRound(s, api);
  }
}

function checkVotes(s: S, api: Api) {
  if (s.phase !== "vote") return;
  const m = s.matches[s.cur];
  const v = voters(s, m, api);
  if (v.length && v.every((pid) => (m.votes[pid]?.length ?? 0) >= allowance(s, m, pid))) settle(s, api);
}

/** A new game; 再来一局 passes the one that just ended, and the new game deals on from its piles. */
function newGame(api: Api, prev?: S): S {
  // past eight at the table, whoever only watched the last game writes this one
  const written = prev ? (prev.written ?? countWriters({}, prev.players)) : {};
  const players = nextWriters(api.ids(), prev?.players ?? null, written);
  const s: S = {
    phase: "write",
    round: 1,
    rounds: ROUNDS,
    players,
    written: countWriters(written, players),
    matches: [],
    cur: 0,
    phaseAt: api.now,
    endsAt: 0,
    step: 0,
    scores: Object.fromEntries(players.map((pid) => [pid, 0])),
    before: {},
    deck: prev?.deck ?? api.shuffle(range(PUNCH_PROMPTS.length)),
    finalDeck: prev?.finalDeck ?? api.shuffle(range(PUNCH_FINAL.length)),
    safetyDeck: prev?.safetyDeck ?? api.shuffle(range(PUNCH_SAFETY.length)),
    latest: prev?.latest ?? {},
    winners: null,
    last: null,
  };
  startRound(s, api);
  return s;
}

export const punchline: GameDef<S> = {
  id: "punchline",
  min: 3,
  init(api) {
    return newGame(api);
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "answer": {
        if (s.phase !== "write") return;
        const m = s.matches[Number(g.k)];
        if (!m) return;
        const idx = m.authors.indexOf(pid);
        if (idx < 0) return;
        let text = clean(g.text, 80);
        const safety = g.safety === true;
        if (safety) {
          // "give me one": a stock answer, worth half
          const quip = PUNCH_SAFETY[deal(s, "safetyDeck", PUNCH_SAFETY.length, 1, api)[0]];
          text = g.lang === "en" ? quip.en : quip.zh;
        }
        if (!text) return;
        m.answers[idx] = text;
        m.safety[idx] = safety;
        if (allWritten(s, api)) present(s, 0, api);
        return;
      }
      case "vote": {
        if (s.phase !== "vote") return;
        const m = s.matches[s.cur];
        const slot = Number(g.slot);
        if (!Number.isInteger(slot) || !voters(s, m, api).includes(pid)) return;
        if (!choices(m, pid).some((c) => c.slot === slot)) return;
        if (!isFinal(s)) m.votes[pid] = [slot];
        else {
          // the last round: tap to add a pick, tap again to take it back, up to three
          const mine = m.votes[pid] ?? [];
          if (mine.includes(slot)) m.votes[pid] = mine.filter((x) => x !== slot);
          else if (mine.length < allowance(s, m, pid)) m.votes[pid] = [...mine, slot];
          else return;
        }
        checkVotes(s, api);
        return;
      }
      case "next": {
        // the host keeps the show moving; a tap names the moment it was made for, so a double
        // tap (or one that crosses the automatic step) can't skip a whole phase
        if (!host) return;
        if (g.step !== undefined && Number(g.step) !== s.step) return;
        if (s.phase === "write") present(s, 0, api);
        else if (s.phase === "present") openVote(s, api);
        else if (s.phase === "vote") settle(s, api);
        else advance(s, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        if (g.step !== undefined && Number(g.step) !== s.step) return;
        Object.assign(s, newGame(api, s));
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "write" && s.phase === "write") present(s, 0, api);
    else if (key === "present" && s.phase === "present") openVote(s, api);
    else if (key === "vote" && s.phase === "vote") settle(s, api);
    else if (key === "next" && (s.phase === "result" || s.phase === "scores")) advance(s, api);
  },

  leave(s, _pid, api) {
    if (s.phase === "write" && allWritten(s, api)) present(s, 0, api);
    else checkVotes(s, api);
  },

  view(s, pid, api): PunchView {
    const ids = api.ids();
    const writing =
      s.phase === "write" ? s.players.filter((p) => api.has(p) && s.matches.some((m) => m.authors.includes(p) && !m.answers[m.authors.indexOf(p)])) : [];
    let match: PunchMatch | null = null;
    const m = s.matches[s.cur];
    if (m && (s.phase === "present" || s.phase === "vote" || s.phase === "result")) {
      const shown = s.phase === "result";
      const mineAuthor = m.authors.indexOf(pid);
      const v = voters(s, m, api);
      match = {
        k: s.cur,
        n: s.cur + 1,
        of: s.matches.length,
        final: isFinal(s),
        prompt: m.prompt,
        answers: m.order.map((ai, slot) => {
          const who = shown ? Object.entries(m.votes).filter(([, slots]) => slots.includes(slot)).map(([voter]) => voter) : null;
          return {
            text: m.answers[ai],
            by: shown ? m.authors[ai] : null,
            votes: shown ? m.counts[ai] : null,
            voters: who,
            points: shown ? m.points[ai] : null,
            safety: shown ? m.safety[ai] : null,
          };
        }),
        canVote: s.phase === "vote" && v.includes(pid) && allowance(s, m, pid) > 0,
        maxVotes: v.includes(pid) ? allowance(s, m, pid) : 0,
        myVotes: m.votes[pid] ?? [],
        mine: mineAuthor >= 0 ? m.order.indexOf(mineAuthor) : null,
        voted: Object.keys(m.votes).filter((p) => (m.votes[p]?.length ?? 0) > 0),
        voters: v.length,
        sweep: shown && m.sweep !== null ? m.order.indexOf(m.sweep) : null,
        forfeit: shown && m.forfeit,
      };
    }
    return {
      id: "punchline",
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      phaseAt: s.phaseAt,
      endsAt: s.endsAt,
      step: s.step ?? 0,
      players: s.players.filter((p) => api.has(p)),
      audience: ids.filter((p) => !s.players.includes(p)),
      mine:
        s.phase === "write"
          ? s.matches.flatMap((mm, k) => {
              const i = mm.authors.indexOf(pid);
              return i >= 0 ? [{ k, prompt: mm.prompt, done: !!mm.answers[i], text: mm.answers[i], safety: mm.safety[i] }] : [];
            })
          : [],
      writing,
      match,
      scores: s.scores,
      before: s.before,
      winners: s.winners,
      last: s.last,
    };
  },
};
