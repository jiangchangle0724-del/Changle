import { DRAW_WORDS } from "../../../data/drawGuess";
import { toSimplified } from "../../../data/t2s";
import { DRAW_GUESS_MAX, type DrawView } from "../../protocol";
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
  /** The players in seat order, as last seen: by the time `leave` hears of someone, their seat is gone. */
  order?: string[];
  /** The drawer who left before their round was over; `drawer` already holds who draws next. */
  left?: string | null;
};

const ROUND_MS = 80_000;
const NOBODY = (w: { zh: string; en: string }) => t(`你画我猜：没人猜中「${w.zh}」`, `Draw & Guess: nobody got "${w.en}"`);

/** Case, width, spaces and punctuation aside, with Traditional characters read as Simplified (汽車 is 汽车). */
function norm(x: string) {
  return toSimplified(x.normalize("NFKC").toLowerCase()).replace(/[\s\p{P}\p{S}]/gu, "");
}

/** English without an a, an or the in front ("a clock", "the cold"), unless that's all there is. */
function bare(x: string) {
  const s = x.normalize("NFKC").toLowerCase().trim();
  return norm(s.replace(/^(?:a|an|the)\s+/, "") || s);
}

/** One is the other with an s, es or ies on the end: "cars", "glass" for glasses, "butterflies". */
function plural(a: string, b: string) {
  const [one, many] = a.length < b.length ? [a, b] : [b, a];
  if (one.length < 3 || !/^[a-z]+$/.test(many)) return false;
  if (many === `${one}s`) return true;
  if (/(?:s|x|z|ch|sh|o)$/.test(one) && many === `${one}es`) return true;
  return /[^aeiou]y$/.test(one) && many === `${one.slice(0, -1)}ies`;
}

/** Does a guess name the word, in either language? */
export function drawMatches(text: string, w: { zh: string; en: string }) {
  const g = norm(text);
  if (!g) return false;
  if (g === norm(w.zh) || g === norm(w.en)) return true;
  const guess = bare(text);
  const word = bare(w.en);
  return guess === word || plural(guess, word);
}

function deckOf(d: D, api: Api) {
  return api.shuffle(range(DRAW_WORDS.length).filter((i) => DRAW_WORDS[i].d === d));
}

/** Who comes after `pid` round the table among the players still here (`pid`'s seat may be gone already). */
function after(s: S, pid: string, api: Api) {
  const was = s.order?.length ? s.order : api.ids();
  const at = was.indexOf(pid);
  if (at < 0 || api.has(pid)) return api.next(pid);
  const round = [...was.slice(at + 1), ...was.slice(0, at), ...api.ids().filter((id) => !was.includes(id))].filter((id) => api.has(id));
  // (turns pass over phones that are away, as api.next does)
  return round.find((id) => api.online(id)) ?? round[0] ?? api.ids()[0] ?? "";
}

/** On to the next round: `drawer` picks a difficulty. */
function nextRound(s: S, drawer: string, api: Api) {
  s.drawer = drawer;
  s.phase = "pick";
  s.word = null;
  s.round += 1;
  s.guesses = [];
  s.solved = [];
  s.left = null;
  api.resetStrokes();
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
      order: api.ids(),
      left: null,
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
        s.left = null;
        api.resetStrokes();
        api.timer("draw", s.endsAt);
        return;
      }
      case "guess": {
        // (players only: someone just watching, host or not, doesn't guess or score)
        if (s.phase !== "draw" || pid === s.drawer || s.solved.includes(pid) || s.word === null || !api.has(pid)) return;
        const text = clean(g.text, DRAW_GUESS_MAX);
        if (!text) return;
        const w = DRAW_WORDS[s.word];
        if (drawMatches(text, w)) {
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
        // (when the drawer left mid-round, `drawer` already holds whoever draws next)
        nextRound(s, s.left ? s.drawer : api.next(s.drawer), api);
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "draw") endRound(s, api, true);
  },

  join(s, _pid, api) {
    s.order = api.ids();
  },

  leave(s, pid, api) {
    // (the seat is already gone, or just watching now: api.ids() no longer has pid)
    if (s.drawer === pid) {
      const next = after(s, pid, api);
      if (s.phase === "draw") {
        // the round ends without a penalty: the word goes up, then it's the next one's turn
        s.phase = "result";
        api.clear("draw");
        s.left = pid;
        s.drawer = next;
      } else if (s.phase === "result" && !s.left) {
        // their round was over (and its penalty given): the one who'd move the game on is gone, so move on
        nextRound(s, next, api);
      } else {
        // choosing a word, or the one due to draw next after a drawer left: the turn passes on
        s.drawer = next;
      }
    } else if (s.phase === "draw" && s.solved.length) {
      // a guesser left: if everyone still guessing has got it, the round is done
      const guessers = api.ids().filter((id) => id !== s.drawer);
      if (guessers.every((id) => s.solved.includes(id))) endRound(s, api, false);
    }
    s.order = api.ids();
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
      // a blank for each letter; spaces and hyphens show as they are ("___-_______" for All-nighter)
      hint: w ? { zh: [...w.zh].length, en: w.en.replace(/[\p{L}\p{N}]/gu, "_") } : null,
      word: showWord && w ? { zh: w.zh, en: w.en } : null,
      guesses: s.guesses,
      solved: s.solved,
      scores: s.scores,
      round: s.round,
      left: s.left ?? null,
    };
  },
};
