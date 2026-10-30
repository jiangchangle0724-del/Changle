import { TITLES } from "../../../data/superlatives";
import type { T } from "../../../i18n";
import type { SuperView } from "../../protocol";
import { clean, range, t, type Api, type GameDef } from "../api";

/**
 * Superlatives: one award a round. Everyone votes (not for themselves); whoever gets the
 * most votes takes the award and drinks. After the last round, an awards ceremony.
 */
type S = {
  phase: "vote" | "reveal" | "ceremony";
  round: number;
  total: number;
  deck: number[];
  title: T;
  custom: boolean;
  votes: Record<string, string>;
  endsAt: number;
  counts: Record<string, number> | null;
  winners: string[];
  awards: Record<string, T[]>;
};

const VOTE_MS = 45_000;
const ROUNDS = 8;

function draw(s: S, api: Api) {
  if (!s.deck.length) s.deck = api.shuffle(range(TITLES.length));
  s.title = TITLES[s.deck.pop()!];
  s.custom = false;
}

function openVote(s: S, api: Api) {
  s.phase = "vote";
  s.votes = {};
  s.counts = null;
  s.winners = [];
  s.endsAt = api.now + VOTE_MS;
  api.timer("vote", s.endsAt);
}

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
  api.penalty(s.winners, "sip", s.title, { delay: 2600 });
}

function everyoneVoted(s: S, api: Api) {
  const ids = api.ids();
  return ids.length > 1 && ids.every((pid) => s.votes[pid] !== undefined);
}

export const superlatives: GameDef<S> = {
  id: "superlatives",
  min: 3,
  init(api) {
    const s: S = { phase: "vote", round: 1, total: ROUNDS, deck: api.shuffle(range(TITLES.length)), title: TITLES[0], custom: false, votes: {}, endsAt: 0, counts: null, winners: [], awards: {} };
    draw(s, api);
    openVote(s, api);
    return s;
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "vote": {
        const target = String(g.target ?? "");
        if (s.phase !== "vote" || target === pid || !api.has(target)) return;
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
        if (s.round >= s.total) {
          s.phase = "ceremony";
          api.fx("win");
          api.penalty(api.ids(), "everyone", t("颁奖典礼，全场干杯", "Awards night: everyone drinks"), { delay: 3200 });
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
      title: s.title,
      custom: s.custom,
      endsAt: s.endsAt,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      counts: s.phase === "vote" ? null : s.counts,
      winners: s.phase === "vote" ? [] : s.winners,
      awards: s.awards,
    };
  },
};
