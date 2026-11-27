import { ADULT_PAIRS, WORD_PAIRS, type WordPair } from "../../../data/undercover";
import type { UcRole, UndercoverView } from "../../protocol";
import type { T } from "../../../i18n";
import { clean, intIn, range, t, type Api, type GameDef } from "../api";

type Phase = UndercoverView["phase"];
type S = {
  phase: Phase;
  uc: number;
  /** the host set the number of undercovers by hand; until then it follows the table's size */
  touched?: boolean;
  blank: boolean;
  round: number;
  pair: number | null;
  /** the pairs this table has had since the game was opened, so a night deals each once before any comes round again */
  used?: number[];
  /** 成人档: the host chose the grown-ups' words for the next deal */
  adult?: boolean;
  /** which bank `pair` points into: "adult" for ADULT_PAIRS, anything else WORD_PAIRS */
  bank?: "adult";
  /** the adult pairs this table has had tonight, kept apart from the everyday ones */
  usedAdult?: number[];
  flip: boolean;
  roles: Record<string, UcRole>;
  alive: string[];
  ready: string[];
  order: string[];
  speaker: number;
  endsAt: number;
  desc: Record<string, string>;
  /**
   * every round already voted on, oldest first (pk: a run-off): the typed lines, so the table can
   * look back at who said what, and once counted who voted for whom and who went (复盘 at the end)
   */
  said?: Said[];
  votes: Record<string, string>;
  lastVotes: Record<string, string> | null;
  out: { pid: string; role: UcRole } | null;
  tie: boolean;
  /**
   * 平票加赛: the players tied at the top of a vote. From that reveal to the end of their run-off they
   * describe once more and everyone else votes between them; a second tie and nobody goes this round.
   */
  pk?: string[];
  /** the blank was voted out and had one guess at the civilians' word (the Undercover app's Mr. White) */
  guess?: { text: string; right: boolean } | null;
  /** 换一组词: how many times the host has dealt a fresh pair before anyone spoke */
  redeals?: number;
  winner: "civ" | "uc" | "blank" | null;
};

type Said = UndercoverView["said"][number];

const TALK_MS = 40_000;
const VOTE_MS = 60_000;
const GUESS_MS = 45_000;
/** 换一组词 at most this many times a game (someone doesn't know the word, or the table had it lately) */
export const MAX_REDEALS = 3;

const flat = (x: string) => x.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

/**
 * Whether a typed line gives the word away: the word itself, in Chinese or English (忌爆字, the
 * table's oldest rule). The phone checks before sending and the rules check again.
 */
export function saysWord(text: string, w: T | null | undefined): boolean {
  if (!w) return false;
  const zh = flat(w.zh);
  if (zh && flat(text).includes(zh)) return true;
  const en = w.en.trim().toLowerCase();
  if (!en) return false;
  const pat = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${pat}(e?s)?($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** Whether a line was already typed this game, give or take spaces and marks (忌跟描: say something new). */
export function saidBefore(text: string, lines: string[]): boolean {
  const x = flat(text);
  return !!x && lines.some((l) => flat(l) === x);
}

/** Every line typed this game so far, but the speaker's own line this turn (they can retype it). */
function linesSoFar(s: S, pid: string) {
  return [...(s.said ?? []).flatMap((r) => Object.values(r.desc)), ...Object.entries(s.desc).filter(([id]) => id !== pid).map(([, l]) => l)];
}

/** The blank's guess is right when it is the civilians' word in either language, give or take spaces, marks and a plural. */
export function sameWord(guess: string, w: T): boolean {
  const g = flat(guess);
  if (!g) return false;
  const en = flat(w.en);
  return g === flat(w.zh) || g === en || g === `${en}s` || g === `${en}es` || `${g}s` === en;
}

/** How many players may sit on the undercover side (undercovers and the blank) at a table of n. */
export function maxSide(n: number) {
  return Math.max(1, Math.floor((n - 1) / 3));
}

/** The most undercovers a table of n takes: the top of the + button, one phone or online. */
export function maxUc(n: number) {
  return Math.min(3, maxSide(n));
}

/** Undercovers dealt unless the host says otherwise: one up to six at the table, two up to nine, three from ten. */
export function defaultUc(n: number) {
  return Math.min(n >= 10 ? 3 : n >= 7 ? 2 : 1, maxUc(n));
}

function fit(s: S, n: number) {
  const side = maxSide(n);
  s.uc = Math.max(1, Math.min(3, s.uc, side));
  if (s.blank && s.uc + 1 > side) s.blank = false;
}

/** The table changed size before the deal: the count follows it until the host has set one. */
function fitTable(s: S, n: number) {
  if (!s.touched) s.uc = defaultUc(n);
  fit(s, n);
}

/** A pair the table hasn't had tonight; once every pair has been dealt, the bank starts over. */
function dealPair(s: S, api: Api) {
  const adult = !!s.adult;
  const bank = adult ? ADULT_PAIRS : WORD_PAIRS;
  const used = ((adult ? s.usedAdult : s.used) ?? []).filter((i) => i >= 0 && i < bank.length);
  const fresh = range(bank.length).filter((i) => !used.includes(i));
  const pool = fresh.length ? fresh : range(bank.length);
  const pair = pool[api.int(pool.length)];
  const next = [...(fresh.length ? used : []), pair];
  if (adult) s.usedAdult = next;
  else s.used = next;
  s.bank = adult ? "adult" : undefined;
  return pair;
}

/** The pair dealt this game, from whichever bank it came from. */
function dealtPair(s: S): WordPair | null {
  if (s.pair === null) return null;
  return (s.bank === "adult" ? ADULT_PAIRS : WORD_PAIRS)[s.pair] ?? null;
}

/** Who votes: everyone still in, except the players in a run-off when anyone else is left to judge them. */
function voters(s: S) {
  const rest = s.pk?.length ? s.alive.filter((id) => !s.pk!.includes(id)) : [];
  return rest.length ? rest : s.alive;
}

/** Who can be voted for: the run-off's players during one, otherwise everyone still in. */
function candidates(s: S) {
  return s.pk?.length ? s.alive.filter((id) => s.pk!.includes(id)) : s.alive;
}

function startTalk(s: S, api: Api) {
  const who = candidates(s);
  // anyone may open the round but the blank, who has no word to start from (the Undercover app's rule)
  const can = range(who.length).filter((i) => s.roles[who[i]] !== "blank");
  const pool = can.length ? can : range(Math.max(1, who.length));
  const start = pool[api.int(pool.length)];
  s.order = [...who.slice(start), ...who.slice(0, start)];
  s.speaker = 0;
  s.desc = {};
  s.endsAt = api.now + TALK_MS;
  s.phase = "talk";
  api.timer("talk", s.endsAt);
}

function startVote(s: S, api: Api) {
  // the round's lines are kept for the rest of the game (the talk screen shows them under each name)
  (s.said ??= []).push({ round: s.round, ...(s.pk?.length ? { pk: true } : {}), desc: { ...s.desc } });
  s.phase = "vote";
  s.votes = {};
  s.endsAt = api.now + VOTE_MS;
  api.clear("talk");
  api.timer("vote", s.endsAt);
}

function advanceSpeaker(s: S, api: Api) {
  s.speaker += 1;
  while (s.speaker < s.order.length && !s.alive.includes(s.order[s.speaker])) s.speaker += 1;
  if (s.speaker >= s.order.length) {
    startVote(s, api);
    return;
  }
  s.endsAt = api.now + TALK_MS;
  api.timer("talk", s.endsAt);
}

function checkWinner(s: S) {
  const side = s.alive.filter((id) => s.roles[id] && s.roles[id] !== "civ").length;
  const civ = s.alive.filter((id) => s.roles[id] === "civ").length;
  if (side === 0) s.winner = "civ";
  else if (side >= civ) s.winner = "uc";
}

function tally(s: S, api: Api) {
  api.clear("vote");
  const who = voters(s);
  const can = candidates(s);
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(s.votes)) if (who.includes(voter) && can.includes(target)) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = max > 0 ? can.filter((id) => counts[id] === max) : [];
  const runoff = !!s.pk?.length;
  s.lastVotes = { ...s.votes };
  s.tie = top.length !== 1;
  s.out = null;
  s.guess = null;
  // the round's entry in the record gets its votes and who went
  const entry = s.said?.at(-1);
  if (entry && entry.round === s.round && !!entry.pk === runoff) {
    entry.votes = Object.fromEntries(Object.entries(s.votes).filter(([voter, target]) => who.includes(voter) && can.includes(target)));
    entry.out = top.length === 1 ? top[0] : null;
  }
  // a tie at the top goes to a run-off, once (卧底法官助手's rule); a second tie, or no votes at all, and nobody goes
  s.pk = s.tie && !runoff && top.length > 1 ? top : undefined;
  if (!s.tie) {
    const pid = top[0];
    s.out = { pid, role: s.roles[pid] ?? "civ" };
    s.alive = s.alive.filter((id) => id !== pid);
    if (s.out.role === "blank") {
      // one last chance before the role is read out in full: the blank guesses the civilians' word
      s.phase = "guess";
      s.endsAt = api.now + GUESS_MS;
      api.timer("guess", s.endsAt);
      api.fx("reveal", pid);
      return;
    }
    checkWinner(s);
  }
  s.phase = "reveal";
  api.fx("reveal", s.out?.pid);
}

/** The blank's guess is in (or time ran out): right, and the blank wins alone; wrong, and the game goes on without them. */
function endGuess(s: S, api: Api, text: string) {
  api.clear("guess");
  const civ = words(s)?.civ;
  const right = !!civ && sameWord(text, civ);
  s.guess = { text, right };
  if (right) s.winner = "blank";
  else checkWinner(s);
  s.phase = "reveal";
  api.fx(right ? "win" : "reveal", s.out?.pid);
}

/** Roles and a pair for everyone at the table: the start of a game, or 换一组词 before anyone spoke. */
function deal(s: S, api: Api) {
  const ids = api.shuffle(api.ids());
  s.roles = {};
  ids.forEach((id, i) => {
    s.roles[id] = i < s.uc ? "uc" : i < s.uc + (s.blank ? 1 : 0) ? "blank" : "civ";
  });
  s.pair = dealPair(s, api);
  s.flip = api.rand() < 0.5;
  s.alive = api.ids();
  s.ready = [];
  s.round = 1;
  s.votes = {};
  s.lastVotes = null;
  s.out = null;
  s.tie = false;
  s.pk = undefined;
  s.guess = null;
  s.redeals = 0;
  s.winner = null;
  s.desc = {};
  s.said = [];
  s.phase = "word";
  api.fx("card");
}

/** The word a player was dealt: none for the blank or someone who sat down after the deal. */
function wordOf(s: S, pid: string): T | null {
  const w = words(s);
  const role = s.roles[pid];
  if (!w || !role || role === "blank") return null;
  return role === "uc" ? w.uc : w.civ;
}

function words(s: S) {
  const p = dealtPair(s);
  if (!p) return null;
  return s.flip ? { civ: p.b, uc: p.a } : { civ: p.a, uc: p.b };
}

const WIN_CIV = t("谁是卧底：卧底被揪出来了", "Undercover: the undercover was caught");
const WIN_UC = t("谁是卧底：卧底赢了", "Undercover: the undercover side wins");
const WIN_BLANK = t("谁是卧底：白板猜中了平民的词", "Undercover: the blank guessed the civilians' word");

/** The game is decided: the end screen, and the losing side's penalty (whoever of them is still at the table). */
function finish(s: S, api: Api) {
  s.phase = "end";
  // a blank who guessed the word wins alone: everyone else loses, the undercovers too
  const losers = Object.keys(s.roles).filter((id) => (s.winner === "civ" ? s.roles[id] !== "civ" : s.winner === "blank" ? s.roles[id] !== "blank" : s.roles[id] === "civ"));
  api.penalty(losers, "sip", s.winner === "civ" ? WIN_CIV : s.winner === "blank" ? WIN_BLANK : WIN_UC);
  api.fx("win");
}

export const undercover: GameDef<S> = {
  id: "undercover",
  min: 4,
  init(api) {
    const n = api.ids().length;
    const s: S = {
      phase: "setup",
      uc: defaultUc(n),
      blank: false,
      round: 0,
      pair: null,
      flip: false,
      roles: {},
      alive: [],
      ready: [],
      order: [],
      speaker: 0,
      endsAt: 0,
      desc: {},
      votes: {},
      lastVotes: null,
      out: null,
      tie: false,
      winner: null,
    };
    fit(s, n);
    return s;
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    const n = api.ids().length;
    switch (g.x) {
      case "config": {
        if (!host || s.phase !== "setup") return;
        const uc = intIn(g.uc, 1, 3);
        if (uc !== null) {
          s.uc = uc;
          s.touched = true;
        }
        if (typeof g.blank === "boolean") s.blank = g.blank;
        if (typeof g.adult === "boolean") s.adult = g.adult;
        fit(s, n);
        return;
      }
      case "redeal": {
        // 换一组词: before anyone has spoken, the host can deal a fresh pair (and fresh roles) a few
        // times; the tap carries the count it saw, so one arriving twice deals once
        if (!host || s.phase !== "word" || (s.redeals ?? 0) >= MAX_REDEALS || g.n !== (s.redeals ?? 0)) return;
        const redeals = (s.redeals ?? 0) + 1;
        deal(s, api);
        s.redeals = redeals;
        return;
      }
      case "deal": {
        if (!host || (s.phase !== "setup" && s.phase !== "end") || n < 4) return;
        fitTable(s, n);
        deal(s, api);
        return;
      }
      case "ready": {
        if (s.phase !== "word" || !s.alive.includes(pid) || s.ready.includes(pid)) return;
        s.ready.push(pid);
        if (s.alive.every((id) => s.ready.includes(id))) startTalk(s, api);
        return;
      }
      case "force": {
        if (!host) return;
        // the tap says which screen it was made on: the same tap arriving twice (a double tap, or
        // taps queued while the host's line was down) moves the table on once, not three times
        if (typeof g.phase === "string" && g.phase !== s.phase) return;
        if (s.phase === "word") startTalk(s, api);
        else if (s.phase === "talk") startVote(s, api);
        else if (s.phase === "vote") tally(s, api);
        else if (s.phase === "guess") endGuess(s, api, "");
        return;
      }
      case "desc": {
        if (s.phase !== "talk" || s.order[s.speaker] !== pid) return;
        const text = clean(g.text, 30);
        if (text && !saysWord(text, wordOf(s, pid)) && !saidBefore(text, linesSoFar(s, pid))) s.desc[pid] = text;
        return;
      }
      case "done": {
        if (s.phase !== "talk" || (s.order[s.speaker] !== pid && !host)) return;
        // the tap names the speaker it was for: a second one for the same speaker skips nobody
        if (typeof g.speaker === "number" && g.speaker !== s.speaker) return;
        if (typeof g.round === "number" && g.round !== s.round) return;
        advanceSpeaker(s, api);
        return;
      }
      case "vote": {
        const target = String(g.target ?? "");
        if (s.phase !== "vote" || !voters(s).includes(pid) || !candidates(s).includes(target) || target === pid) return;
        s.votes[pid] = target;
        if (voters(s).every((id) => s.votes[id])) tally(s, api);
        return;
      }
      case "guess": {
        if (s.phase !== "guess" || s.out?.pid !== pid) return;
        const text = clean(g.text, 20);
        if (text) endGuess(s, api, text);
        return;
      }
      case "guessOk": {
        // the phone only takes the exact word; the table can count a near miss (土豆 for 马铃薯)
        if (!host || s.phase !== "reveal" || !s.guess?.text || s.guess.right) return;
        s.guess.right = true;
        s.winner = "blank";
        api.fx("win");
        return;
      }
      case "next": {
        if (!host || s.phase !== "reveal") return;
        if (s.winner) {
          finish(s, api);
          return;
        }
        // a run-off is the same round once more, between the tied players
        if (!s.pk?.length) s.round += 1;
        startTalk(s, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        s.phase = "setup";
        fitTable(s, n);
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "talk" && s.phase === "talk") advanceSpeaker(s, api);
    if (key === "vote" && s.phase === "vote") tally(s, api);
    if (key === "guess" && s.phase === "guess") endGuess(s, api, "");
  },

  join(s, _pid, api) {
    // before the deal, the number of undercovers follows the table's size
    if (s.phase === "setup" || s.phase === "end") fitTable(s, api.ids().length);
  },

  leave(s, pid, api) {
    if (s.phase === "setup" || s.phase === "end") {
      fitTable(s, api.ids().length);
      return;
    }
    s.alive = s.alive.filter((id) => id !== pid);
    s.ready = s.ready.filter((id) => id !== pid);
    delete s.votes[pid];
    for (const [v, target] of Object.entries(s.votes)) if (target === pid) delete s.votes[v];
    // a run-off that loses a player down to one is no run-off: everyone votes as usual
    if (s.pk) {
      s.pk = s.pk.filter((id) => id !== pid && s.alive.includes(id));
      if (s.pk.length < 2) s.pk = undefined;
    }
    // the guess decides first; whoever else left is counted when it is in
    if (s.phase === "guess") {
      if (s.out?.pid === pid) endGuess(s, api, "");
      return;
    }
    if (s.phase === "talk" && s.order[s.speaker] === pid) advanceSpeaker(s, api);
    if (s.phase === "word" && s.alive.length && s.alive.every((id) => s.ready.includes(id))) startTalk(s, api);
    if (s.phase === "vote" && s.alive.length && voters(s).every((id) => s.votes[id])) tally(s, api);
    if (s.winner) return;
    checkWinner(s);
    // the leaving decided it (the only undercover walked off, or the civilians are down to as many
    // as the other side): nothing left to describe or vote on, so the end screen comes now, with
    // nobody voted out this time; a leave during a reveal waits for the host's tap as usual
    if (s.winner && s.phase !== "reveal") {
      api.clear("talk");
      api.clear("vote");
      s.votes = {};
      s.lastVotes = null;
      s.out = null;
      s.tie = false;
      s.pk = undefined;
      finish(s, api);
    }
  },

  view(s, pid, api): UndercoverView {
    const w = words(s);
    const role = s.roles[pid];
    const inPlay = s.phase !== "setup" && !!role;
    const ended = s.phase === "end";
    const revealing = s.phase === "reveal" || s.phase === "guess" || ended;
    return {
      id: "undercover",
      phase: s.phase,
      uc: s.uc,
      blank: s.blank,
      adult: !!s.adult,
      maxSide: maxSide(api.ids().length),
      round: s.round,
      inGame: Object.keys(s.roles),
      alive: s.alive,
      ready: s.ready,
      order: s.order,
      speaker: s.speaker,
      endsAt: s.endsAt,
      desc: s.desc,
      said: s.said ?? [],
      pk: s.pk ?? [],
      voters: voters(s),
      guess: revealing ? (s.guess ?? null) : null,
      redeals: s.redeals ?? 0,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      votes: revealing ? s.lastVotes : null,
      out: revealing ? s.out : null,
      tie: s.tie,
      winner: revealing ? s.winner : null,
      myWord: inPlay ? wordOf(s, pid) : null,
      isBlank: inPlay && role === "blank",
      roles: ended ? s.roles : null,
      pair: ended ? w : null,
    };
  },
};
