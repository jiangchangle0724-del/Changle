import { DRAW_WORDS } from "../../../data/drawGuess";
import type { DrawView } from "../../protocol";
import { clean, intIn, range, t, type Api, type GameDef } from "../api";

type D = 1 | 2 | 3;
type S = {
  phase: "pick" | "draw" | "result";
  drawer: string;
  d: D;
  word: number | null;
  endsAt: number;
  guesses: { pid: string; text: string; ok: boolean }[];
  solved: string[];
  scores: Record<string, number>;
  round: number;
  decks: Record<D, number[]>;
};

const ROUND_MS = 80_000;
const NOBODY = (w: { zh: string; en: string }) => t(`你画我猜：没人猜中「${w.zh}」`, `Draw & Guess: nobody got "${w.en}"`);

function norm(x: string) {
  return x
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function matches(text: string, w: { zh: string; en: string }) {
  const g = norm(text);
  if (!g) return false;
  const en = norm(w.en);
  const enBare = norm(w.en.replace(/^(a|an|the)\s+/i, ""));
  return g === norm(w.zh) || g === en || g === enBare;
}

function deckOf(d: D, api: Api) {
  return api.shuffle(range(DRAW_WORDS.length).filter((i) => DRAW_WORDS[i].d === d));
}

function endRound(s: S, api: Api, timedOut: boolean) {
  if (s.phase !== "draw") return;
  s.phase = "result";
  api.clear("draw");
  if (timedOut) api.fx("timeup");
  if (!s.solved.length && s.word !== null) api.penalty([s.drawer], "sip", NOBODY(DRAW_WORDS[s.word]), { delay: 600 });
}

export const draw: GameDef<S> = {
  id: "draw",
  min: 2,
  init(api) {
    return {
      phase: "pick",
      drawer: api.ids()[0],
      d: 1,
      word: null,
      endsAt: 0,
      guesses: [],
      solved: [],
      scores: {},
      round: 1,
      decks: { 1: deckOf(1, api), 2: deckOf(2, api), 3: deckOf(3, api) },
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "pick": {
        const d = intIn(g.d, 1, 3) as D | null;
        if (s.phase !== "pick" || (pid !== s.drawer && !host) || d === null) return;
        if (!s.decks[d].length) s.decks[d] = deckOf(d, api);
        s.word = s.decks[d].pop() ?? 0;
        s.d = d;
        s.phase = "draw";
        s.endsAt = api.now + ROUND_MS;
        s.guesses = [];
        s.solved = [];
        api.resetStrokes();
        api.timer("draw", s.endsAt);
        return;
      }
      case "guess": {
        if (s.phase !== "draw" || pid === s.drawer || s.solved.includes(pid) || s.word === null) return;
        const text = clean(g.text, 24);
        if (!text) return;
        const w = DRAW_WORDS[s.word];
        if (matches(text, w)) {
          s.solved.push(pid);
          const first = s.solved.length === 1;
          s.scores[pid] = (s.scores[pid] ?? 0) + (first ? 2 * s.d : s.d);
          s.scores[s.drawer] = (s.scores[s.drawer] ?? 0) + (first ? s.d : 1);
          s.guesses.push({ pid, text: "", ok: true });
          api.fx("correct", pid);
          const guessers = api.ids().filter((id) => id !== s.drawer);
          if (guessers.every((id) => s.solved.includes(id))) endRound(s, api, false);
        } else {
          s.guesses.push({ pid, text, ok: false });
        }
        if (s.guesses.length > 40) s.guesses = s.guesses.slice(-40);
        return;
      }
      case "giveup": {
        if (s.phase !== "draw" || (pid !== s.drawer && !host)) return;
        endRound(s, api, false);
        return;
      }
      case "next": {
        if (s.phase !== "result" || (pid !== s.drawer && !host)) return;
        s.drawer = api.next(s.drawer);
        s.phase = "pick";
        s.word = null;
        s.round += 1;
        s.guesses = [];
        s.solved = [];
        api.resetStrokes();
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "draw") endRound(s, api, true);
  },

  leave(s, pid, api) {
    if (s.drawer !== pid) return;
    if (s.phase === "draw") {
      s.phase = "result";
      api.clear("draw");
    }
    s.drawer = api.ids()[0] ?? "";
  },

  canStroke(s, pid) {
    return s.phase === "draw" && pid === s.drawer;
  },

  view(s, pid): DrawView {
    const w = s.word !== null ? DRAW_WORDS[s.word] : null;
    const showWord = !!w && (s.phase === "result" || (s.phase === "draw" && pid === s.drawer));
    return {
      id: "draw",
      phase: s.phase,
      drawer: s.drawer,
      d: s.d,
      endsAt: s.endsAt,
      hint: w ? { zh: [...w.zh].length, en: w.en.replace(/\S/g, "_") } : null,
      word: showWord && w ? { zh: w.zh, en: w.en } : null,
      guesses: s.guesses,
      solved: s.solved,
      scores: s.scores,
      round: s.round,
    };
  },
};
