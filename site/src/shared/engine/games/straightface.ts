import { CARDS, PACKS } from "../../../data/straightface";
import { awards, createGame, DEFAULT_OPTIONS, foolCounts, GameError, MAX_PLAYERS, MIN_PLAYERS, nextJudge, privateView, publicView, reduce, removePlayer, type Deps } from "../../straightface/engine";
import type { GameEvent, GameState, Level, NetSetup, PublicView, StraightFaceView } from "../../straightface/types";
import { intIn, t, type Api, type GameDef } from "../api";

/**
 * 一本正经 · In All Seriousness online: every phone its own. The rules are the one-phone game's pure
 * engine (src/shared/straightface) in its online mode: everyone reads their part at once, everyone
 * bets at once. This file only says who may send what, keeps the host's choices before the deal,
 * hands the room the penalties, and builds each phone's view: its own part (`privateView`) and what
 * the table may see (`publicView`), never anyone else's.
 *
 * The server knows ids, not names: the engine's players are named by their ids and each screen words
 * the reveal itself (`roundLines`), with the names the table shows.
 */
type S = {
  setup: NetSetup;
  /** the game, from the deal on */
  g: GameState | null;
  /** when the current step began (a phase, a speaker): the phones' soft clocks count from it */
  stepAt: number;
  /** this round's master bluffer has picked: whom (once per round) */
  picked: { round: number; target: string } | null;
  /** cards the table has played before (every phone hands in its own): the deal takes others first */
  seen: string[];
};

const deps: Deps = { cards: CARDS };

/** Penalty notes: what happened, never the penalty itself (a table with its own penalty reads them too). */
const NOTE = {
  fooled: t("一本正经：裁判看走眼", "In All Seriousness: the judge was fooled"),
  caught: t("一本正经：瞎编被疑点抓包", "In All Seriousness: tagged and caught bluffing"),
  master: t("一本正经：大忽悠点了你", "In All Seriousness: the master bluffer picked you"),
};
/** The fooled and the caught take theirs once every phone has shown who was honest. */
const VERDICT_DELAY = 4200;

const LEVELS: Level[] = [1, 2, 3];
const CARD_IDS = new Set(CARDS.map((c) => c.id));
/** How many played cards a table remembers (the phones each send their most recent 300). */
const SEEN_MAX = 900;

/** Cards added to what the table has seen, the newest kept. */
function remember(seen: string[], ids: unknown[]): string[] {
  const add = ids.filter((x): x is string => typeof x === "string" && CARD_IDS.has(x));
  const keep = seen.filter((x) => !add.includes(x));
  return [...keep, ...new Set(add)].slice(-SEEN_MAX);
}

/** One event through the rules; false when they refuse it (a late tap, a double tap, out of turn). */
function step(s: S, ev: GameEvent, api: Api): boolean {
  if (!s.g) return false;
  try {
    const before = s.g;
    s.g = reduce(before, ev, deps);
    if (s.g.phase !== before.phase || s.g.current?.speakerIdx !== before.current?.speakerIdx || s.g.current?.index !== before.current?.index) s.stepAt = api.now;
    return true;
  } catch (e) {
    if (e instanceof GameError) return false;
    throw e;
  }
}

/** The round's master bluffer while they still have someone to pick. */
function masterOf(s: S): string | null {
  const g = s.g;
  const r = g?.current;
  if (!g || !r || g.phase !== "reveal" || !r.result) return null;
  const m = r.result.penalties.find((p) => p.why === "master")?.playerId ?? null;
  if (!m || !g.players.some((p) => p.id === m)) return null;
  return s.picked?.round === r.index ? null : m;
}

/** The reveal as the table sees it, minus the server's wording (ids, and drinking lines). */
function tableView(g: GameState): PublicView {
  const v = publicView(g, deps);
  return v.reveal ? { ...v, reveal: { ...v.reveal, result: { ...v.reveal.result, preLines: [], lines: [], penalties: [] } } } : v;
}

export const straightface: GameDef<S> = {
  id: "straightface",
  min: MIN_PLAYERS,

  init(api) {
    return { setup: { packs: null, level: 2, seeds: true, bets: true }, g: null, stepAt: api.now, picked: null, seen: [] };
  },

  act(s, pid, a, api) {
    const host = api.isHost(pid);
    const g = s.g;
    const r = g?.current ?? null;
    const judge = r?.judgeId ?? null;
    const playing = !!g && g.players.some((p) => p.id === pid);
    const refuse = () => api.quiet();
    switch (a.x) {
      case "config": {
        // the host's choices: everything before the deal, the next round's difficulty between rounds
        if (!host) return refuse();
        const level = intIn(a.level, 1, 3) as Level | null;
        if (level !== null && LEVELS.includes(level) && (!g || g.phase === "between" || g.phase === "lobby")) s.setup.level = level;
        if (g) return;
        if (Array.isArray(a.packs)) {
          const packs = [...new Set(a.packs.map(String))].filter((p) => (PACKS as readonly string[]).includes(p));
          if (packs.length) s.setup.packs = packs;
        }
        if (typeof a.seeds === "boolean") s.setup.seeds = a.seeds;
        if (typeof a.bets === "boolean") s.setup.bets = a.bets;
        return;
      }
      case "seen": {
        // a phone hands in the cards it has played; nobody else hears of it until the deal
        if (g || !Array.isArray(a.ids)) return refuse();
        s.seen = remember(s.seen ?? [], a.ids.slice(0, 400));
        return refuse();
      }
      case "deal": {
        const ids = api.ids();
        if (!host || g || ids.length < MIN_PLAYERS || ids.length > MAX_PLAYERS) return refuse();
        const packs = s.setup.packs ?? [];
        const all = PACKS.every((p) => packs.includes(p));
        const game = createGame(
          ids.map((id, seat) => ({ id, name: id, seat })),
          { ...DEFAULT_OPTIONS, mode: "online", bluffSeeds: s.setup.seeds, sideBets: s.setup.bets, penalties: true, packs: all ? [] : packs },
          api.int(0x7fffffff) + 1,
        );
        try {
          // cards this table has played before come last (the engine falls back to them when a pack runs dry)
          s.g = reduce({ ...game, usedCardIds: [...(s.seen ?? [])] }, { type: "START_ROUND", level: s.setup.level }, deps);
        } catch (e) {
          if (e instanceof GameError) return refuse();
          throw e;
        }
        s.picked = null;
        s.stepAt = api.now;
        return;
      }
      case "peeked": {
        if (!g || !playing || !step(s, { type: "PEEKED", playerId: pid }, api)) return refuse();
        return;
      }
      case "force": {
        // the host starts the explanations without waiting for everyone's "got it" (their part stays on their phone)
        if (!host || !g || g.phase !== "peek") return refuse();
        for (const id of [...(r?.peekQueue ?? [])]) step(s, { type: "PEEKED", playerId: id }, api);
        return;
      }
      case "next": {
        // the next speaker: the judge, the one speaking (done), or the host; `at` is the speaker it was
        // pressed for, so two presses at once move on once
        if (!g || !r || g.phase !== "explain" || a.at !== r.speakerIdx) return refuse();
        const speaking = r.speakerIdx >= 0 ? r.speakOrder[r.speakerIdx] : null;
        if (pid !== judge && !host && pid !== speaking) return refuse();
        if (!step(s, { type: "NEXT_SPEAKER" }, api)) return refuse();
        return;
      }
      case "tag": {
        if (!g || !step(s, { type: "TAG_SUSPECT", byPlayerId: pid, targetId: String(a.target ?? "") }, api)) return refuse();
        return;
      }
      case "bet": {
        if (!g || !playing || !step(s, { type: "BET", playerId: pid, targetId: String(a.target ?? "") }, api)) return refuse();
        return;
      }
      case "close": {
        // stop waiting for the last bets: the judge, or the host
        if (!g || !judge || (pid !== judge && !host) || !step(s, { type: "CLOSE_BETS", byPlayerId: judge }, api)) return refuse();
        return;
      }
      case "accuse": {
        if (!g || !step(s, { type: "ACCUSE", byPlayerId: pid, targetId: String(a.target ?? "") }, api)) return refuse();
        const res = s.g?.current?.result;
        for (const p of res?.penalties ?? []) {
          if (p.why === "fooled") api.penalty([p.playerId], "sip", NOTE.fooled, { delay: VERDICT_DELAY });
          if (p.why === "caught") api.penalty([p.playerId], "sip", NOTE.caught, { delay: VERDICT_DELAY });
        }
        return;
      }
      case "pick": {
        // the bluffer who fooled the judge picks someone at the table, once
        const target = String(a.target ?? "");
        const m = masterOf(s);
        if (!g || !r || !m || pid !== m || target === pid || !g.players.some((p) => p.id === target)) return refuse();
        s.picked = { round: r.index, target };
        api.penalty([target], "sip", NOTE.master);
        return;
      }
      case "round": {
        // done with the reveal: the host or the judge; while the master bluffer still has to pick, only the host
        if (!g || !r || g.phase !== "reveal" || (!host && pid !== judge) || (masterOf(s) && !host)) return refuse();
        if (!step(s, { type: "NEXT_ROUND" }, api)) return refuse();
        return;
      }
      case "start": {
        // the next round: the host, or whoever judges it
        if (!g || (g.phase !== "between" && g.phase !== "lobby") || (!host && pid !== nextJudge(g))) return refuse();
        if (!step(s, { type: "START_ROUND", level: s.setup.level }, api)) return refuse();
        return;
      }
      case "again": {
        if (!host || !g || g.phase !== "finished") return refuse();
        s.seen = remember(s.seen ?? [], g.rounds.map((r) => r.cardId));
        s.g = null;
        s.picked = null;
        s.stepAt = api.now;
        return;
      }
    }
    refuse();
  },

  leave(s, pid, api) {
    if (!s.g) return;
    const before = s.g;
    s.g = removePlayer(before, pid);
    if (s.g !== before && (s.g.phase !== before.phase || s.g.current?.speakerIdx !== before.current?.speakerIdx)) s.stepAt = api.now;
  },

  view(s, pid): StraightFaceView {
    const g = s.g;
    const r = g?.current ?? null;
    const revealed = !!g && !!r?.accusedId && (g.phase === "reveal" || g.phase === "between" || g.phase === "finished");
    return {
      id: "straightface",
      phase: g ? g.phase : "setup",
      setup: s.setup,
      players: g ? g.players.map((p) => p.id) : [],
      table: g ? tableView(g) : null,
      // a big screen, a seat that only watches, someone who sat down after the deal: nobody's part
      me: g && g.players.some((p) => p.id === pid) ? privateView(g, pid, deps) : null,
      stepAt: s.stepAt,
      nextJudge: g && (g.phase === "between" || g.phase === "lobby") ? nextJudge(g) : null,
      cardId: revealed && r ? r.cardId : null,
      facts: revealed && r && r.accusedId ? { judgeId: r.judgeId, honestId: r.honestId, accusedId: r.accusedId, suspectId: r.suspectId, bets: r.bets, level: r.level } : null,
      master: masterOf(s),
      picked: g && r && s.picked?.round === r.index && revealed ? s.picked.target : null,
      fooled: g ? foolCounts(g) : {},
      learned:
        g?.phase === "finished"
          ? g.rounds.flatMap((rd) => {
              const c = CARDS.find((x) => x.id === rd.cardId);
              return c ? [{ term: c.term, definition: c.definition }] : [];
            })
          : null,
      awards: g?.phase === "finished" ? awards(g) : null,
    };
  },
};
