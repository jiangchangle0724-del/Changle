import { guessMatches, NOTES } from "../../../data/postit";
import type { T } from "../../../i18n";
import type { PostitReply, PostitView } from "../../protocol";
import { clean, range, t, type Api, type GameDef } from "../api";

/**
 * Post-it Note (Who Am I?). Everyone writes the note for the player after them (or lets the
 * deck pick). Every phone shows everyone's forehead except your own. On your turn, ask a
 * yes-or-no question (out loud, or typed), the table answers on their phones, then guess or
 * pass. A wrong guess costs a sip; whoever is last to work it out drinks the glass.
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

function startPlay(s: S, api: Api) {
  api.clear("write");
  for (const pid of s.order) if (!s.notes[pid]) s.notes[pid] = fromDeck(s, api, writerFor(s, pid));
  s.phase = "play";
  s.turn = s.order[0];
  s.asking = null;
  s.replies = {};
  s.guess = null;
  api.fx("start");
}

const unsolved = (s: S) => s.order.filter((pid) => !s.solved.includes(pid));

function nextTurn(s: S, api: Api) {
  const left = unsolved(s);
  if (left.length <= 1) {
    s.phase = "end";
    api.fx("win");
    if (left.length === 1) api.penalty(left, "full", t("额头便利贴：最后一个猜出来", "Post-it: last one to get it"), { delay: 1800 });
    return;
  }
  // round the play order from whoever just went (still in the order even if they've just left)
  const at = s.order.indexOf(s.turn);
  for (let k = 1; k <= s.order.length; k++) {
    const p = s.order[(at + k) % s.order.length];
    if (p !== s.turn && left.includes(p)) {
      s.turn = p;
      break;
    }
  }
  s.asking = null;
  s.replies = {};
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
        if (s.phase !== "play" || pid !== s.turn) return;
        s.asking = clean(g.text, 80) || null;
        s.replies = {};
        return;
      }
      case "reply": {
        const r = g.r;
        if (s.phase !== "play" || pid === s.turn || (r !== "yes" && r !== "no" && r !== "maybe")) return;
        s.replies[pid] = r;
        return;
      }
      case "guess": {
        const text = clean(g.text, 40);
        const mine = s.notes[pid];
        if (s.phase !== "play" || pid !== s.turn || !text || !mine) return;
        const ok = guessMatches(text, mine.note, mine.alias);
        s.tries[pid] = (s.tries[pid] ?? 0) + 1;
        s.guess = { by: pid, text, ok, at: api.now };
        if (ok) {
          s.solved.push(pid);
          api.fx("correct", pid);
          nextTurn(s, api);
        } else {
          api.fx("wrong", pid);
          api.penalty([pid], "sip", t("额头便利贴：猜错了", "Post-it: wrong guess"), { delay: 900 });
          nextTurn(s, api);
        }
        return;
      }
      case "accept": {
        // the host can count a near miss ("the monkey king guy") as right
        const last = s.guess;
        if (!host || s.phase !== "play" || !last || last.ok || s.solved.includes(last.by) || api.now - last.at > 60_000) return;
        s.solved.push(last.by);
        s.guess = { ...last, ok: true };
        api.fx("correct", last.by);
        if (s.turn === last.by) nextTurn(s, api);
        else if (unsolved(s).length <= 1) nextTurn(s, api);
        return;
      }
      case "pass": {
        if (s.phase !== "play" || (pid !== s.turn && !host)) return;
        s.guess = null;
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
        });
        api.timer("write", s.endsAt);
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "write" && s.phase === "write") startPlay(s, api);
  },

  leave(s, pid, api) {
    if (!s.order.includes(pid)) return;
    const wasTurn = s.turn === pid;
    if (s.phase === "write") {
      // rebuild the chain without them; whoever wrote for them now writes for the next one
      s.order = s.order.filter((p) => p !== pid);
      delete s.notes[pid];
      if (s.order.length && s.order.every((p) => s.notes[p])) startPlay(s, api);
      return;
    }
    if (wasTurn) nextTurn(s, api);
    s.order = s.order.filter((p) => p !== pid);
    delete s.replies[pid];
    if (s.phase === "play" && unsolved(s).length <= 1) nextTurn(s, api);
  },

  view(s, pid): PostitView {
    const reveal = s.phase === "end";
    const notes: Record<string, T | null> = {};
    const mineToWrite = s.phase === "write" ? targetOf(s, pid) : null;
    for (const p of s.order) {
      const w = s.notes[p];
      // while writing, you only see the note you wrote; after that, everyone's but your own
      const hidden = s.phase === "write" ? p !== mineToWrite : p === pid && !reveal && !s.solved.includes(pid);
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
      asking: s.asking,
      replies: s.replies,
      guess: s.guess,
      solved: s.solved,
      tries: s.tries,
    };
  },
};
