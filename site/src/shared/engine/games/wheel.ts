import { DEFAULT_SLICES, sliceLabel } from "../../../data/wheel";
import { DARES, TRUTHS } from "../../../data/truthDare";
import type { WheelSliceKind, WheelSliceView, WheelView } from "../../protocol";
import { clean, intIn, num, range, type Api, type GameDef } from "../api";

type S = {
  turn: string;
  slices: WheelSliceView[];
  phase: WheelView["phase"];
  result: number | null;
  revealAt: number;
  prompt: number | null;
  promptKind: "truth" | "dare" | null;
  tDeck: number[];
  dDeck: number[];
};

const KINDS: WheelSliceKind[] = ["drink", "safe", "truth", "dare", "again", "custom"];

function defaults(): WheelSliceView[] {
  return DEFAULT_SLICES.map((s) => ({ id: s.id, label: { ...s.label }, kind: s.kind }));
}

function apply(s: S, api: Api) {
  if (s.phase !== "spinning" || s.result === null) return;
  const slice = s.slices[s.result];
  const me = s.turn;
  const note = sliceLabel(slice, api.customPenalty);
  s.phase = "result";
  switch (slice.kind) {
    case "safe":
      api.penalty([me], "safe", note);
      return;
    case "truth":
    case "dare": {
      const key = slice.kind === "truth" ? "tDeck" : "dDeck";
      if (!s[key].length) s[key] = api.shuffle(range((slice.kind === "truth" ? TRUTHS : DARES).length).filter((i) => (slice.kind === "truth" ? TRUTHS : DARES)[i].heat === 1));
      s.prompt = s[key].pop() ?? 0;
      s.promptKind = slice.kind;
      s.phase = "prompt";
      return;
    }
    case "again":
      s.phase = "spin";
      s.result = null;
      return;
    case "custom":
      api.penalty([me], "sip", note);
      return;
    case "drink":
      switch (slice.id) {
        case "full":
          api.penalty([me], "full", note);
          return;
        case "two":
          api.penalty([me], "two", note);
          return;
        case "pick":
          s.phase = "pick";
          return;
        case "neighbors":
          api.penalty([api.prev(me), api.next(me)].filter((id) => id !== me), "sip", note);
          return;
        case "all":
          api.penalty(api.ids(), "everyone", note);
          return;
        default:
          api.penalty([me], "sip", note);
          return;
      }
  }
}

export const wheel: GameDef<S> = {
  id: "wheel",
  min: 1,
  init(api) {
    return { turn: api.ids()[0], slices: defaults(), phase: "spin", result: null, revealAt: 0, prompt: null, promptKind: null, tDeck: [], dDeck: [] };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "spin": {
        if (s.phase !== "spin" || (pid !== s.turn && !host)) return;
        const index = intIn(g.index, 0, s.slices.length - 1);
        const duration = num(g.duration, 0.3, 6.5);
        const delta = num(g.delta, -5000, 5000);
        if (index === null || duration === null || delta === null) return;
        s.result = index;
        s.revealAt = api.now + duration * 1000;
        s.phase = "spinning";
        api.spin("wheel", pid, index, delta, duration);
        api.timer("apply", s.revealAt + 350);
        return;
      }
      case "pick": {
        const target = String(g.target ?? "");
        if (s.phase !== "pick" || (pid !== s.turn && !host) || !api.has(target) || s.result === null) return;
        api.penalty([target], "sip", sliceLabel(s.slices[s.result], api.customPenalty));
        s.phase = "result";
        return;
      }
      case "done":
      case "pass": {
        if (s.phase !== "prompt" || (pid !== s.turn && !host)) return;
        if (g.x === "pass" && pid === s.turn) api.penalty([pid], "sip");
        s.phase = "result";
        return;
      }
      case "next": {
        if (s.phase !== "result" || (pid !== s.turn && !host)) return;
        s.turn = api.next(s.turn);
        s.phase = "spin";
        s.result = null;
        s.prompt = null;
        s.promptKind = null;
        return;
      }
      case "skip": {
        // (the turn the host meant to skip: a second tap, or one sent late, mustn't skip the next player too)
        if (!host || s.phase === "spinning" || (g.at !== undefined && g.at !== `${s.phase}:${s.turn}`)) return;
        s.turn = api.next(s.turn);
        s.phase = "spin";
        s.result = null;
        s.prompt = null;
        s.promptKind = null;
        return;
      }
      case "slices": {
        if (!host || (s.phase !== "spin" && s.phase !== "result")) return;
        if (!Array.isArray(g.slices)) return;
        const list: WheelSliceView[] = [];
        for (const raw of g.slices.slice(0, 12)) {
          const r = raw as { id?: unknown; kind?: unknown; label?: { zh?: unknown; en?: unknown } };
          const kind = KINDS.includes(r.kind as WheelSliceKind) ? (r.kind as WheelSliceKind) : "custom";
          const zh = clean(r.label?.zh, 16);
          const en = clean(r.label?.en, 16) || zh;
          if (!zh && !en) continue;
          list.push({ id: clean(r.id, 16) || `c${list.length}`, kind, label: { zh: zh || en, en } });
        }
        if (list.length < 2) return;
        s.slices = list;
        s.result = null;
        if (s.phase === "result") s.phase = "spin";
        return;
      }
      case "reset": {
        if (!host || s.phase === "spinning") return;
        s.slices = defaults();
        s.result = null;
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "apply") apply(s, api);
  },

  leave(s, pid, api) {
    if (s.turn === pid) {
      s.turn = api.ids()[0] ?? "";
      s.phase = "spin";
      s.result = null;
      s.prompt = null;
    }
  },

  view(s): WheelView {
    const list = s.promptKind === "dare" ? DARES : TRUTHS;
    const p = s.prompt !== null ? list[s.prompt] : null;
    return {
      id: "wheel",
      turn: s.turn,
      slices: s.slices,
      phase: s.phase,
      result: s.result,
      revealAt: s.revealAt,
      prompt: p ? { zh: p.zh, en: p.en } : null,
      promptKind: s.promptKind,
    };
  },
};
