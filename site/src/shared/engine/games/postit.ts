import { guessMatches, NOTES } from "../../../data/postit";
import type { T } from "../../../i18n";
import type { PostitReply, PostitView } from "../../protocol";
import { clean, range, t, type Api, type GameDef } from "../api";

/**
 * Post-it Note (Who Am I?). Everyone writes the note for the player after them (or lets the
 * deck pick). Every phone shows everyone's forehead except your own. On your turn, ask a
 * yes-or-no question (out loud, or typed), the table answers on their phones, then guess or
 * pass. A wrong guess costs a sip; whoever is last to work it out drinks the glass.
 *
 * Everyone gets the same number of turns: when one player is left and the others have had one go
 * more, that player has a last chance before the glass. The first to ask moves on a seat each game.
 * Someone who sits down mid-game is dealt a note from the deck and plays from there.
 */

type Written = { note: T; alias: string[]; by: string };

type S = {
  phase: "write" | "play" | "end";
  endsAt: number;
  order: string[];
  /** note for each player, written by the one before them */
  notes: Record<string, Written | null>;
  turn: string;
  asking: string | null;
  replies: Record<string, PostitReply>;
  guess: { by: string; text: string; ok: boolean; at: number } | null;
  solved: string[];
  tries: Record<string, number>;
  deck: number[];
  /** turns each player has had (a guess or a pass ends one). Not kept by games begun before 2026-11: read with turnsOf */
  turns?: Record<string, number>;
  /** the one left, on their last chance */
  final?: string | null;
  /** games played at this table before this one: who asks first moves on a seat each game */
  round?: number;
  /** at the end: who drinks the glass (null: nobody). Not kept by games that ended before 2026-11 */
  last?: string | null;
};

const WRITE_MS = 75_000;

function writerFor(s: S, target: string) {
  const i = s.order.indexOf(target);
  return s.order[(i - 1 + s.order.length) % s.order.length];
}
function targetOf(s: S, writer: string) {
  const i = s.order.indexOf(writer);
  return i < 0 ? null : s.order[(i + 1) % s.order.length];
}

function fromDeck(s: S, api: Api, by: string): Written {
  if (!s.deck.length) s.deck = api.shuffle(range(NOTES.length));
  const note = NOTES[s.deck.pop()!];
  return { note: note.t, alias: note.alias ?? [], by };
}

const unsolved = (s: S) => s.order.filter((pid) => !s.solved.includes(pid));
const turnsOf = (s: S, pid: string) => s.turns?.[pid] ?? 0;
/** A turn is over (a guess or a pass). */
function took(s: S, pid: string) {
  s.turns = { ...s.turns, [pid]: turnsOf(s, pid) + 1 };
}

function startPlay(s: S, api: Api) {
  api.clear("write");
  for (const pid of s.order) if (!s.notes[pid]) s.notes[pid] = fromDeck(s, api, writerFor(s, pid));
  s.phase = "play";
  s.asking = null;
  s.replies = {};
  s.guess = null;
  s.final = null;
  // (one player left at the table: nothing to play)
  if (s.order.length < 2) return finish(s, api, null);
  s.turn = s.order[(s.round ?? 0) % s.order.length];
  api.fx("start");
}

/** The game is over. `last`: whoever never got theirs, and drinks the glass. */
function finish(s: S, api: Api, last: string | null) {
  s.phase = "end";
  s.final = null;
  s.last = last;
  api.fx("win");
  if (last) api.penalty([last], "full", t("额头便利贴：最后一个没猜出来", "Post-it: the last one still guessing"), { delay: 1800 });
}

/** The turn goes to the next player still guessing, round the order from whoever has it now. */
function passOn(s: S) {
  const left = unsolved(s);
  // (whoever has it now is still in the order, even if they are just leaving)
  const at = s.order.indexOf(s.turn);
  for (let k = 1; k <= s.order.length; k++) {
    const p = s.order[(at + k) % s.order.length];
    if (p !== s.turn && left.includes(p)) {
      s.turn = p;
      break;
    }
  }
  s.final = null;
  s.asking = null;
  s.replies = {};
}

/**
 * One player (or nobody) is still guessing. Nobody: everyone has theirs, the game ends and no one
 * drinks the glass. One: the game ends on them, unless they are owed a last chance. `owed` says
 * so outright (the others left, rather than got there first).
 */
function settle(s: S, api: Api, owed = false) {
  const last = unsolved(s)[0];
  const done = s.order.filter((pid) => s.solved.includes(pid));
  // (nobody got theirs first: the rest went home, and nobody lost)
  if (!last || !done.length) return finish(s, api, null);
  if (s.final !== last && (owed || turnsOf(s, last) < Math.max(...done.map((pid) => turnsOf(s, pid))))) {
    s.final = last;
    // (already their turn: the question they asked and its answers stay)
    if (s.turn !== last) {
      s.turn = last;
      s.asking = null;
      s.replies = {};
    }
    return;
  }
  finish(s, api, last);
}

/** After a turn: on to the next player still guessing, or to how the game ends. */
function nextTurn(s: S, api: Api) {
  if (unsolved(s).length > 1) passOn(s);
  else settle(s, api);
}

export const postit: GameDef<S> = {
  id: "postit",
  min: 2,
  init(api) {
    const order = api.ids();
    const s: S = {
      phase: "write",
      endsAt: api.now + WRITE_MS,
      order,
      notes: Object.fromEntries(order.map((pid) => [pid, null])),
      turn: order[0],
      asking: null,
      replies: {},
      guess: null,
      solved: [],
      tries: {},
      deck: api.shuffle(range(NOTES.length)),
      turns: {},
      final: null,
      round: 0,
    };
    api.timer("write", s.endsAt);
    return s;
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "write": {
        const target = targetOf(s, pid);
        const text = clean(g.text, 24);
        if (s.phase !== "write" || !target || !text) return;
        s.notes[target] = { note: t(text, text), alias: [], by: pid };
        if (s.order.every((p) => s.notes[p])) startPlay(s, api);
        return;
      }
      case "random": {
        const target = targetOf(s, pid);
        if (s.phase !== "write" || !target) return;
        s.notes[target] = fromDeck(s, api, pid);
        if (s.order.every((p) => s.notes[p])) startPlay(s, api);
        return;
      }
      case "begin": {
        if (!host || s.phase !== "write") return;
        startPlay(s, api);
        return;
      }
      case "ask": {
        const text = clean(g.text, 80);
        // (nothing typed: a second tap on send, after the box emptied. The question on the table stays)
        if (s.phase !== "play" || pid !== s.turn || !text) return api.quiet();
        s.asking = text;
        s.replies = {};
        return;
      }
      case "reply": {
        const r = g.r;
        // (players with a note only: someone just watching, host or not, doesn't answer)
        if (s.phase !== "play" || pid === s.turn || (r !== "yes" && r !== "no" && r !== "maybe") || !api.has(pid) || !s.order.includes(pid)) return api.quiet();
        s.replies[pid] = r;
        return;
      }
      case "guess": {
        const text = clean(g.text, 40);
        const mine = s.notes[pid];
        if (s.phase !== "play" || pid !== s.turn || !text || !mine) return;
        const ok = guessMatches(text, mine.note, mine.alias);
        const lastChance = s.final === pid;
        s.tries[pid] = (s.tries[pid] ?? 0) + 1;
        took(s, pid);
        s.guess = { by: pid, text, ok, at: api.now };
        if (ok) {
          s.solved.push(pid);
          api.fx("correct", pid);
        } else {
          api.fx("wrong", pid);
          // (a last chance missed is the glass, not a sip and then the glass)
          if (!lastChance) api.penalty([pid], "sip", t("额头便利贴：猜错了", "Post-it: wrong guess"), { delay: 900 });
        }
        nextTurn(s, api);
        return;
      }
      case "accept": {
        // the host can count a near miss ("the monkey king guy") as right, while the game is on
        const last = s.guess;
        if (!host || s.phase !== "play" || !last || last.ok || s.solved.includes(last.by) || !s.order.includes(last.by) || api.now - last.at > 60_000) return;
        s.solved.push(last.by);
        s.guess = { ...last, ok: true };
        api.fx("correct", last.by);
        if (s.turn === last.by || unsolved(s).length <= 1) nextTurn(s, api);
        return;
      }
      case "pass": {
        if (s.phase !== "play" || (pid !== s.turn && !host)) return;
        s.guess = null;
        took(s, s.turn);
        nextTurn(s, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        const order = api.ids();
        Object.assign(s, {
          phase: "write",
          endsAt: api.now + WRITE_MS,
          order,
          notes: Object.fromEntries(order.map((p) => [p, null])),
          turn: order[0],
          asking: null,
          replies: {},
          guess: null,
          solved: [],
          tries: {},
          turns: {},
          final: null,
          last: null,
          round: (s.round ?? 0) + 1,
        });
        api.timer("write", s.endsAt);
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "write" && s.phase === "write") startPlay(s, api);
  },

  join(s, pid, api) {
    // someone sat down (or stopped just watching) with the game under way: they play from here
    if (s.order.includes(pid) || s.phase === "end") return;
    // (back after leaving: a new note, and nothing carried over)
    s.solved = s.solved.filter((p) => p !== pid);
    delete s.tries[pid];
    delete s.replies[pid];
    // they have had as many turns as whoever has had fewest: next round the table, they get theirs
    s.turns = { ...s.turns, [pid]: s.order.length ? Math.min(...s.order.map((p) => turnsOf(s, p))) : 0 };
    const before = s.order[s.order.length - 1];
    s.order.push(pid);
    if (s.phase === "write") {
      // on the end of the chain: the last writer now writes for them, and they write for the first
      s.notes[pid] = null;
      return;
    }
    s.notes[pid] = fromDeck(s, api, before ?? pid);
    // (two are still guessing now: nobody is on a last chance)
    s.final = null;
  },

  leave(s, pid, api) {
    if (!s.order.includes(pid)) return;
    if (s.phase === "write") {
      // rebuild the chain without them; whoever wrote for them now writes for the next one
      s.order = s.order.filter((p) => p !== pid);
      delete s.notes[pid];
      if (s.order.length && s.order.every((p) => s.notes[p])) startPlay(s, api);
      return;
    }
    const wasGuessing = !s.solved.includes(pid);
    if (s.phase === "play" && s.turn === pid && unsolved(s).some((p) => p !== pid)) passOn(s);
    s.order = s.order.filter((p) => p !== pid);
    delete s.replies[pid];
    if (s.final === pid) s.final = null;
    if (s.phase !== "play" || unsolved(s).length > 1) return;
    // one left guessing because another went, not because they got there first: a last chance is
    // owed. (When it was someone with their note who left, whoever is on a last chance carries on,
    // and with nobody left who got theirs the game just ends: settle sees to both.)
    if (wasGuessing || !s.order.some((p) => s.solved.includes(p)) || !unsolved(s).length) settle(s, api, true);
  },

  view(s, pid): PostitView {
    const reveal = s.phase === "end";
    const notes: Record<string, T | null> = {};
    const mineToWrite = s.phase === "write" ? targetOf(s, pid) : null;
    for (const p of s.order) {
      const w = s.notes[p];
      // while writing, you only see the note you wrote; after that, everyone's but your own
      // a watcher (the big screen) is not at the table: it sees a note only once it is guessed
      const watcher = !s.order.includes(pid);
      const hidden = s.phase === "write" ? p !== mineToWrite : watcher ? !reveal && !s.solved.includes(p) : p === pid && !reveal && !s.solved.includes(pid);
      notes[p] = w && !hidden ? w.note : null;
    }
    return {
      id: "postit",
      phase: s.phase,
      endsAt: s.endsAt,
      order: s.order,
      myTarget: s.phase === "write" ? targetOf(s, pid) : null,
      written: s.order.filter((p) => !!s.notes[p]),
      notes,
      turn: s.turn,
      final: s.phase === "play" && !!s.final && s.final === s.turn,
      ...(s.phase === "end" && s.last !== undefined ? { last: s.last } : {}),
      asking: s.asking,
      replies: s.replies,
      guess: s.guess,
      // (only those still at the table: someone who got theirs and went home is off the list)
      solved: s.solved.filter((p) => s.order.includes(p)),
      tries: s.tries,
    };
  },
};
