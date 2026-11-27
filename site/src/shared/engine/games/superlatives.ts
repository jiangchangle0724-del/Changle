import { DEFAULT_PACKS, deckFor, isPack, TITLES } from "../../../data/superlatives";
import type { T } from "../../../i18n";
import type { SuperView } from "../../protocol";
import { byPenalty, clean, t, type Api, type GameDef } from "../api";

/**
 * Superlatives: one award a round. Everyone votes (not for themselves); whoever gets the
 * most votes takes the award and drinks. After the last round, an awards ceremony.
 * It opens on the host's setup: which packs of titles are in play, how many awards, and the way
 * a round goes: the vote, or "paranoia" (偷偷问): one person alone reads the title and names
 * someone out loud; the one named drinks to see what it was, or stays curious. The one named
 * asks the next one. The ceremony shows every title at the end, seen or not.
 */
export type SuperMode = "vote" | "whisper";
type S = {
  phase: "setup" | "vote" | "reveal" | "ceremony" | "ask" | "dare" | "peek";
  round: number;
  total: number;
  /** the vote, or paranoia (a game from before has none: the vote) */
  mode?: SuperMode;
  /** paranoia: who reads the title this round, whom they named, and whether the one named paid to see it */
  asker?: string | null;
  named?: string | null;
  seen?: boolean | null;
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
  /** how often each voter voted for the winner: the mind reader of the night */
  hits: Record<string, number>;
  /** the same person winning award after award (a tie breaks it) */
  streak: { id: string; n: number } | null;
  /** when the moment's stamp lands (the winner's sip, the ceremony's toast); `stamped` once it has */
  stampAt: number;
  stamped: boolean;
};

const VOTE_MS = 45_000;
/** paranoia: an asker who sits on the title this long hands it to the next seat */
const ASK_MS = 60_000;
/** paranoia: the one named has this long to pay or pass (then they pass) */
const DARE_MS = 45_000;
/** paranoia: the sip of the one who paid lands this soon after */
export const PEEK_MS = 600;
const ROUNDS = 8;
/** what a title looks like to someone who isn't to see it */
export const HIDDEN: T = { zh: "？？？", en: "???" };
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

/** The seat after `from` (the first seat when `from` is gone or last). */
function seatAfter(api: Api, from: string | null | undefined): string | null {
  const ids = api.ids();
  if (!ids.length) return null;
  const i = from ? ids.indexOf(from) : -1;
  return ids[(i + 1) % ids.length];
}

/** Paranoia: a title for `asker` alone to read. */
function openAsk(s: S, api: Api, asker: string | null | undefined) {
  api.clear("dare");
  s.phase = "ask";
  s.asker = asker && api.has(asker) ? asker : seatAfter(api, asker);
  s.named = null;
  s.seen = null;
  s.ballot += 1;
  s.votes = {};
  s.counts = null;
  s.winners = [];
  s.endsAt = api.now + ASK_MS;
  api.timer("ask", s.endsAt);
}

/** Paranoia: the next round (or the ceremony after the last), the one named asking. */
function nextRound(s: S, api: Api, asker: string | null | undefined) {
  if (s.round >= s.total) {
    s.phase = "ceremony";
    api.fx("win");
    stampLater(s, api, TOAST_MS);
    return;
  }
  s.round += 1;
  draw(s, api);
  if (s.mode === "whisper") openAsk(s, api, asker);
  else openVote(s, api);
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
  // (paranoia: the sip buys the title; the stamp doesn't say it, the one who paid reads it on their phone)
  if (s.phase === "peek" && s.seen && s.named) api.penalty([s.named], "sip", t("偷偷问：喝一口看题", "Paranoia: a sip to see it"));
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
  s.hits ??= {};
  for (const [voter, target] of Object.entries(s.votes)) if (s.winners.includes(target)) s.hits[voter] = (s.hits[voter] ?? 0) + 1;
  const one = s.winners.length === 1 ? s.winners[0] : null;
  s.streak = one ? { id: one, n: s.streak?.id === one ? s.streak.n + 1 : 1 } : null;
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
    return { phase: "setup", round: 1, total: ROUNDS, packs: [...DEFAULT_PACKS], mode: "vote", asker: null, named: null, seen: null, deck: [], title: TITLES[0], custom: false, ballot: 0, votes: {}, endsAt: 0, counts: null, winners: [], awards: {}, hits: {}, streak: null, stampAt: 0, stamped: true };
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
        if (g.mode === "vote" || g.mode === "whisper") s.mode = g.mode;
        return;
      }
      case "start": {
        if (!host || s.phase !== "setup") {
          api.quiet();
          return;
        }
        s.deck = api.shuffle(deckFor(s.packs));
        draw(s, api);
        if (s.mode === "whisper") openAsk(s, api, pid);
        else openVote(s, api);
        return;
      }
      case "name": {
        // paranoia: the asker names someone (not themselves) out loud; the title goes on that shelf
        const target = String(g.target ?? "");
        if (s.phase !== "ask" || pid !== s.asker || target === pid || !api.has(target)) return;
        api.clear("ask");
        s.named = target;
        (s.awards[target] ??= []).push(s.title);
        s.phase = "dare";
        s.endsAt = api.now + DARE_MS;
        api.timer("dare", s.endsAt);
        return;
      }
      case "peek": {
        // paranoia: the one named pays a sip to see the title, or passes
        if (s.phase !== "dare" || pid !== s.named) return;
        api.clear("dare");
        s.seen = !!g.yes;
        s.phase = "peek";
        if (s.seen) stampLater(s, api, PEEK_MS);
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
        // (paranoia: the asker swaps their own title; the host can too)
        if (s.phase === "ask" ? !host && pid !== s.asker : !host || s.phase !== "vote") return;
        draw(s, api);
        if (s.phase === "ask") openAsk(s, api, s.asker);
        else openVote(s, api);
        return;
      }
      case "custom": {
        const text = clean(g.text, 30);
        if (!text || (s.phase === "ask" ? !host && pid !== s.asker : !host || s.phase !== "vote")) return;
        s.title = t(text, text);
        s.custom = true;
        if (s.phase === "ask") openAsk(s, api, s.asker);
        else openVote(s, api);
        return;
      }
      case "next": {
        if (!host || (s.phase !== "reveal" && s.phase !== "peek")) return;
        if (stampPending(s, api)) {
          api.quiet();
          return;
        }
        // (the alarm running a touch late: the stamp lands before the next moment, not on it)
        stampNow(s, api);
        nextRound(s, api, s.named ?? s.asker ?? pid);
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
        if (s.mode === "whisper") openAsk(s, api, s.named ?? pid);
        else openVote(s, api);
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "vote" && s.phase === "vote") reveal(s, api);
    if (key === "stamp") stampNow(s, api);
    // paranoia: an asker who sat on the title hands it to the next seat; one named who didn't answer passes
    if (key === "ask" && s.phase === "ask") openAsk(s, api, seatAfter(api, s.asker));
    if (key === "dare" && s.phase === "dare") {
      s.seen = false;
      s.phase = "peek";
    }
  },

  leave(s, pid, api) {
    delete s.votes[pid];
    for (const [voter, target] of Object.entries(s.votes)) if (target === pid) delete s.votes[voter];
    if (s.phase === "vote" && Object.keys(s.votes).length && everyoneVoted(s, api)) reveal(s, api);
    // paranoia: the asker leaving hands the title on; the one named leaving passes on it
    if (s.phase === "ask" && pid === s.asker) openAsk(s, api, seatAfter(api, pid));
    if (s.phase === "dare" && pid === s.named) {
      api.clear("dare");
      s.seen = false;
      s.phase = "peek";
    }
  },

  view(s, pid): SuperView {
    // paranoia: the title is the asker's alone until the one named pays to see it (a big screen never does)
    const whisper = s.mode === "whisper";
    const reads = pid === s.asker || (s.phase === "peek" && !!s.seen && pid === s.named);
    const hidden = whisper && (s.phase === "ask" || s.phase === "dare" || s.phase === "peek") && !reads;
    return {
      id: "superlatives",
      phase: s.phase,
      round: s.round,
      total: s.total,
      packs: s.packs ?? [],
      mode: s.mode ?? "vote",
      asker: s.asker ?? null,
      named: s.named ?? null,
      seen: s.seen ?? null,
      title: hidden ? HIDDEN : s.title,
      custom: s.custom,
      ballot: s.ballot,
      endsAt: s.endsAt,
      stampAt: s.stamped === false ? s.stampAt : 0,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      counts: s.phase === "vote" ? null : s.counts,
      winners: s.phase === "vote" ? [] : s.winners,
      awards: s.awards,
      hits: s.hits ?? {},
      streak: s.phase === "reveal" ? (s.streak?.n ?? 0) : 0,
    };
  },
};
