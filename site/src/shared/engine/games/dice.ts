import type { DiceOutcome, DiceView } from "../../protocol";
import { t, type GameDef } from "../api";

type S = {
  turn: string;
  level: number;
  phase: "roll" | "result" | "assign";
  dice: [number, number];
  roll: number;
  rolledAt: number;
  outcome: DiceOutcome | null;
};

const ROLL_MS = 1000;
const NOTE: Record<"eight" | "nine" | "ones", ReturnType<typeof t>> = {
  eight: t("七八九：八，喝一半", "Seven Eight Nine: eight, drink half"),
  nine: t("七八九：九，全喝", "Seven Eight Nine: nine, drink it all"),
  ones: t("七八九：双一，指定你喝完", "Seven Eight Nine: snake eyes, you finish the glass"),
};

export const dice: GameDef<S> = {
  id: "dice",
  min: 2,
  init(api) {
    return { turn: api.ids()[0], level: 0.3, phase: "roll", dice: [3, 4], roll: 0, rolledAt: 0, outcome: null };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "roll": {
        if (s.phase !== "roll" || (pid !== s.turn && !host)) return;
        const a = 1 + api.int(6);
        const b = 1 + api.int(6);
        s.dice = [a, b];
        s.roll += 1;
        s.rolledAt = api.now;
        const sum = a + b;
        const o: DiceOutcome = a === 1 && b === 1 ? "ones" : sum === 7 ? "seven" : sum === 8 ? "eight" : sum === 9 ? "nine" : "safe";
        s.outcome = o;
        api.fx("dice", s.turn, [a, b]);
        if (o === "seven") s.level = Math.min(1, s.level + 0.25);
        if (o === "eight") {
          api.penalty([s.turn], "two", NOTE.eight, { delay: ROLL_MS + 300 });
          s.level = s.level / 2;
        }
        if (o === "nine") {
          api.penalty([s.turn], "full", NOTE.nine, { delay: ROLL_MS + 300 });
          s.level = 0.3;
        }
        s.phase = o === "ones" ? "assign" : "result";
        return;
      }
      case "assign": {
        const target = String(g.target ?? "");
        if (s.phase !== "assign" || (pid !== s.turn && !host) || !api.has(target)) return;
        api.penalty([target], "full", NOTE.ones);
        s.level = 0.3;
        s.phase = "result";
        return;
      }
      case "next": {
        if (s.phase !== "result" || (pid !== s.turn && !host)) return;
        s.turn = api.next(s.turn);
        s.phase = "roll";
        s.outcome = null;
        return;
      }
      case "skip": {
        if (!host) return;
        s.turn = api.next(s.turn);
        s.phase = "roll";
        s.outcome = null;
        return;
      }
    }
  },

  leave(s, pid, api) {
    if (s.turn === pid) {
      s.turn = api.ids()[0] ?? "";
      s.phase = "roll";
      s.outcome = null;
    }
  },

  view(s): DiceView {
    return { id: "dice", turn: s.turn, level: s.level, phase: s.phase, dice: s.dice, roll: s.roll, rolledAt: s.rolledAt, outcome: s.outcome };
  },
};
