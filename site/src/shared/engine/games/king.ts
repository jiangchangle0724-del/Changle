import { COMMANDS, commandText } from "../../../data/king";
import { fill } from "../../../i18n";
import type { KingView } from "../../protocol";
import { range, t, type Api, type GameDef } from "../api";

type S = {
  phase: "deal" | "crown" | "command";
  round: number;
  tokens: Record<string, number | "K">;
  pulled: string[];
  ready: string[];
  king: string | null;
  cmd: { c: number; nums: number[] } | null;
  stepped: Record<string, string>;
  refused: string[];
  deck: number[];
};

const REFUSE = t("国王游戏：抗旨不遵", "King's Game: defied the king");

function deal(s: S, api: Api) {
  const ids = api.ids();
  const toks: (number | "K")[] = api.shuffle(["K" as const, ...range(Math.max(0, ids.length - 1)).map((i) => i + 1)]);
  s.tokens = {};
  ids.forEach((id, i) => (s.tokens[id] = toks[i]));
  s.pulled = [];
  s.ready = [];
  s.king = null;
  s.cmd = null;
  s.stepped = {};
  s.refused = [];
  s.phase = "deal";
}

function crown(s: S, api: Api) {
  const king = Object.keys(s.tokens).find((id) => s.tokens[id] === "K") ?? null;
  s.king = king;
  s.phase = "crown";
  api.fx("crown", king ?? undefined);
}

/** The command as the phones read it, in the words of the table's penalty (it can change mid-round). */
function cmdText(s: S, custom: boolean) {
  if (!s.cmd) return null;
  const c = commandText(COMMANDS[s.cmd.c], custom);
  const [a, b, cc] = s.cmd.nums;
  const vars = { a: a ?? 1, b: b ?? a ?? 1, c: cc ?? b ?? a ?? 1 };
  return { zh: fill(c.zh, vars), en: fill(c.en, vars) };
}

export const king: GameDef<S> = {
  id: "king",
  min: 3,
  init(api) {
    const s: S = { phase: "deal", round: 1, tokens: {}, pulled: [], ready: [], king: null, cmd: null, stepped: {}, refused: [], deck: api.shuffle(range(COMMANDS.length)) };
    deal(s, api);
    return s;
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "pull": {
        if (s.phase !== "deal" || s.tokens[pid] === undefined || s.pulled.includes(pid)) return;
        s.pulled.push(pid);
        return;
      }
      case "ready": {
        if (s.phase !== "deal" || !s.pulled.includes(pid) || s.ready.includes(pid)) return;
        s.ready.push(pid);
        if (Object.keys(s.tokens).every((id) => s.ready.includes(id) || !api.has(id))) crown(s, api);
        return;
      }
      case "force": {
        if (!host || s.phase !== "deal") return;
        crown(s, api);
        return;
      }
      case "command": {
        if (s.phase !== "crown" || (pid !== s.king && !host)) return;
        if (!s.deck.length) s.deck = api.shuffle(range(COMMANDS.length));
        const numbers = Object.values(s.tokens).filter((x): x is number => typeof x === "number");
        // a command that needs more numbers than the table has waits for a bigger table
        let at = s.deck.length - 1;
        while (at > 0 && COMMANDS[s.deck[at]].people > numbers.length) at -= 1;
        const c = s.deck.splice(at, 1)[0] ?? 0;
        const people = Math.min(COMMANDS[c].people, Math.max(1, numbers.length));
        s.cmd = { c, nums: api.shuffle(numbers).slice(0, people) };
        s.stepped = {};
        s.refused = [];
        s.phase = "command";
        api.fx("card", s.king ?? undefined);
        return;
      }
      case "step": {
        const tok = s.tokens[pid];
        if (s.phase !== "command" || !s.cmd || typeof tok !== "number" || !s.cmd.nums.includes(tok)) return;
        if (s.stepped[String(tok)]) return;
        s.stepped[String(tok)] = pid;
        api.fx("called", pid, [tok]);
        return;
      }
      case "refuse": {
        const target = String(g.target ?? "");
        if (s.phase !== "command" || (pid !== s.king && !host) || !api.has(target) || target === s.king) return;
        if (s.refused.includes(target)) return;
        s.refused.push(target);
        api.penalty([target], "sip", REFUSE);
        return;
      }
      case "next": {
        if ((s.phase !== "command" && s.phase !== "crown") || (pid !== s.king && !host)) return;
        s.round += 1;
        deal(s, api);
        return;
      }
      case "redeal": {
        if (!host) return;
        deal(s, api);
        return;
      }
    }
  },

  leave(s, pid, api) {
    if (s.king === pid) {
      s.round += 1;
      deal(s, api);
      return;
    }
    delete s.tokens[pid];
    s.pulled = s.pulled.filter((x) => x !== pid);
    s.ready = s.ready.filter((x) => x !== pid);
    if (s.phase === "deal" && Object.keys(s.tokens).length && Object.keys(s.tokens).every((id) => s.ready.includes(id))) crown(s, api);
  },

  view(s, pid, api): KingView {
    const pulled = s.pulled.includes(pid);
    return {
      id: "king",
      phase: s.phase,
      round: s.round,
      inRound: Object.keys(s.tokens),
      ready: s.ready,
      pulledIds: s.pulled,
      king: s.phase === "deal" ? null : s.king,
      cmd: s.cmd ? { text: cmdText(s, api.customPenalty)!, nums: s.cmd.nums } : null,
      stepped: s.stepped,
      refused: s.refused,
      myToken: pulled ? s.tokens[pid] ?? null : null,
      pulled,
      count: Object.keys(s.tokens).length,
    };
  },
};
