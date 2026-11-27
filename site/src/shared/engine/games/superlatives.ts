import { DEFAULT_PACKS, deckFor, isPack, TITLES } from "../../../data/superlatives";
import type { T } from "../../../i18n";
import type { SuperView } from "../../protocol";
import { byPenalty, clean, t, type Api, type GameDef } from "../api";

/**
 * Superlatives: one award a round. Everyone votes (not for themselves); whoever gets the
 * most votes takes the award and drinks. After the last round, an awards ceremony.
 * It opens on the host's setup: which packs of titles are in play, how many awards.
 */
type S = {
  phase: "setup" | "vote" | "reveal" | "ceremony";
  round: number;
  total: number;
  /** the packs in play (a game from before the packs has none: every title) */
  packs: string[];
  deck: number[];
  title: T;
  custom: boolean;
  /** counts up at every new ballot (a new round, a title skipped or written): a vote names the ballot it was cast on */
  ballot: number;
  votes: Record<string, string>;
  endsAt: number;
  counts: Record<string, number> | null;
  winners: string[];
  awards: Record<string, T[]>;
  /** when the moment's stamp lands (the winner's sip, the ceremony's toast); `stamped` once it has */
  stampAt: number;
  stamped: boolean;
};

const VOTE_MS = 45_000;
const ROUNDS = 8;
/** how many awards a night can be set to */
export const TOTALS = [5, 8, 12];
/** the drum roll plays out, then the winner's stamp */
export const STAMP_MS = 2600;
/** the trophies come out, then the whole table's toast */
export const TOAST_MS = 3200;

function draw(s: S, api: Api) {
  if (!s.deck.length) s.deck = api.shuffle(deckFor(s.packs ?? []));
  s.title = TITLES[s.deck.pop()!];
  s.custom = false;
}

function openVote(s: S, api: Api) {
  s.phase = "vote";
  s.ballot += 1;
  s.votes = {};
  s.counts = null;
  s.winners = [];
  s.endsAt = api.now + VOTE_MS;
  api.timer("vote", s.endsAt);
}

/**
 * The moment's stamp, `ms` from now, as a timer of the game's own: the game knows whether it has
 * landed, so the host can't move on under it (it used to be a delayed penalty the game couldn't see,
 * and a quick "next" put the last award's stamp on top of the next award's ballot).
 */
function stampLater(s: S, api: Api, ms: number) {
  s.stampAt = api.now + ms;
  s.stamped = false;
  api.timer("stamp", s.stampAt);
}

function stampNow(s: S, api: Api) {
  api.clear("stamp");
  // (a game saved before the stamp was the game's own has neither field: nothing to land)
  if (s.stamped !== false) return;
  s.stamped = true;
  if (s.phase === "reveal") api.penalty(s.winners, "sip", s.title);
  if (s.phase === "ceremony") api.penalty(api.ids(), "everyone", byPenalty(api, t("颁奖典礼，全场干杯", "Awards night: everyone drinks"), t("颁奖典礼，全场一起来", "Awards night: everyone joins in")));
}

/** The stamp is still on its way: the host's button waits for it (NetSuper), and so does the game. */
const stampPending = (s: S, api: Api) => s.stamped === false && api.now < s.stampAt;

function reveal(s: S, api: Api) {
  api.clear("vote");
  const counts: Record<string, number> = {};
  for (const target of Object.values(s.votes)) if (api.has(target)) counts[target] = (counts[target] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  if (top === 0) {
    // nobody voted: draw another title and keep going
    draw(s, api);
    openVote(s, api);
    return;
  }
  s.counts = counts;
  s.winners = Object.keys(counts).filter((pid) => counts[pid] === top);
  for (const w of s.winners) (s.awards[w] ??= []).push(s.title);
  s.phase = "reveal";
  api.fx("award", s.winners[0]);
  stampLater(s, api, STAMP_MS);
}

function everyoneVoted(s: S, api: Api) {
  const ids = api.ids();
  return ids.length > 1 && ids.every((pid) => s.votes[pid] !== undefined);
}

export const superlatives: GameDef<S> = {
  id: "superlatives",
  min: 3,
  init() {
    // (the deck is dealt when the host starts, from the packs picked by then)
    return { phase: "setup", round: 1, total: ROUNDS, packs: [...DEFAULT_PACKS], deck: [], title: TITLES[0], custom: false, ballot: 0, votes: {}, endsAt: 0, counts: null, winners: [], awards: {}, stampAt: 0, stamped: true };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "config": {
        // the host's setup: the packs in play (at least one), how many awards
        if (!host || s.phase !== "setup") {
          api.quiet();
          return;
        }
        if (Array.isArray(g.packs)) {
          const packs = [...new Set(g.packs.filter(isPack))];
          if (packs.length) s.packs = packs;
        }
        if (typeof g.total === "number" && TOTALS.includes(g.total)) s.total = g.total;
        return;
      }
      case "start": {
        if (!host || s.phase !== "setup") {
          api.quiet();
          return;
        }
        s.deck = api.shuffle(deckFor(s.packs));
        draw(s, api);
        openVote(s, api);
        return;
      }
      case "vote": {
        const target = String(g.target ?? "");
        // (players vote for players: someone just watching does neither, host or not)
        if (s.phase !== "vote" || target === pid || !api.has(target) || !api.has(pid)) return;
        // a vote cast on an older ballot (a phone that came back a moment ago and still showed the
        // last award, or a title the host had just swapped) is not a vote on this one
        if (g.ballot !== undefined && g.ballot !== s.ballot) {
          api.quiet();
          return;
        }
        s.votes[pid] = target;
        if (everyoneVoted(s, api)) reveal(s, api);
        return;
      }
      case "reveal": {
        if (!host || s.phase !== "vote" || !Object.keys(s.votes).length) return;
        reveal(s, api);
        return;
      }
      case "skip": {
        if (!host || s.phase !== "vote") return;
        draw(s, api);
        openVote(s, api);
        return;
      }
      case "custom": {
        const text = clean(g.text, 30);
        if (!host || s.phase !== "vote" || !text) return;
        s.title = t(text, text);
        s.custom = true;
        openVote(s, api);
        return;
      }
      case "next": {
        if (!host || s.phase !== "reveal") return;
        if (stampPending(s, api)) {
          api.quiet();
          return;
        }
        // (the alarm running a touch late: the stamp lands before the next moment, not on it)
        stampNow(s, api);
        if (s.round >= s.total) {
          s.phase = "ceremony";
          api.fx("win");
          stampLater(s, api, TOAST_MS);
          return;
        }
        s.round += 1;
        draw(s, api);
        openVote(s, api);
        return;
      }
      case "more": {
        // a few more rounds after the ceremony, keeping the trophies
        if (!host || s.phase !== "ceremony") return;
        if (stampPending(s, api)) {
          api.quiet();
          return;
        }
        stampNow(s, api);
        s.total += 5;
        s.round += 1;
        draw(s, api);
        openVote(s, api);
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "vote" && s.phase === "vote") reveal(s, api);
    if (key === "stamp") stampNow(s, api);
  },

  leave(s, pid, api) {
    delete s.votes[pid];
    for (const [voter, target] of Object.entries(s.votes)) if (target === pid) delete s.votes[voter];
    if (s.phase === "vote" && Object.keys(s.votes).length && everyoneVoted(s, api)) reveal(s, api);
  },

  view(s, pid): SuperView {
    return {
      id: "superlatives",
      phase: s.phase,
      round: s.round,
      total: s.total,
      packs: s.packs ?? [],
      title: s.title,
      custom: s.custom,
      ballot: s.ballot,
      endsAt: s.endsAt,
      stampAt: s.stamped === false ? s.stampAt : 0,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      counts: s.phase === "vote" ? null : s.counts,
      winners: s.phase === "vote" ? [] : s.winners,
      awards: s.awards,
    };
  },
};
