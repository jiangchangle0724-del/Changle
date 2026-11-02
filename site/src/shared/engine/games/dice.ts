import type { DiceOutcome, DiceView } from "../../protocol";
import { byPenalty, t, type GameDef } from "../api";

type S = {
  turn: string;
  level: number;
  /** the pot, in times of the table's own penalty (drinking ignores it) */
  pot?: number;
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
/** With the table's own penalty, the shared glass is a pot of it. */
const NOTE_CUSTOM: typeof NOTE = {
  eight: t("七八九：八，罚一半", "Seven Eight Nine: eight, half the pot"),
  nine: t("七八九：九，全罚", "Seven Eight Nine: nine, the whole pot"),
  ones: t("七八九：双一，指定你全罚", "Seven Eight Nine: snake eyes, the whole pot is yours"),
};

/**
 * With the table's own penalty the shared glass is a pot counted in times of it: it starts at 1, a
 * 7 adds one, an 8 takes half (rounded up), a 9 or double ones takes it all; emptied, it's back to 1.
 */
export function potStep(pot: number, o: DiceOutcome): { take: number; pot: number } {
  if (o === "seven") return { take: 0, pot: pot + 1 };
  if (o === "eight") {
    const take = Math.ceil(pot / 2);
    return { take, pot: Math.max(1, pot - take) };
  }
  if (o === "nine" || o === "ones") return { take: pot, pot: 1 };
  return { take: 0, pot };
}

export const dice: GameDef<S> = {
  id: "dice",
  min: 2,
  init(api) {
    return { turn: api.ids()[0], level: 0.3, pot: 1, phase: "roll", dice: [3, 4], roll: 0, rolledAt: 0, outcome: null };
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
        const pot = potStep(s.pot ?? 1, o === "ones" ? "safe" : o);
        if (o === "seven") s.level = Math.min(1, s.level + 0.25);
        if (o === "eight") {
          api.penalty([s.turn], "two", byPenalty(api, NOTE.eight, NOTE_CUSTOM.eight), { delay: ROLL_MS + 300, times: api.customPenalty ? pot.take : undefined });
          s.level = s.level / 2;
        }
        if (o === "nine") {
          api.penalty([s.turn], "full", byPenalty(api, NOTE.nine, NOTE_CUSTOM.nine), { delay: ROLL_MS + 300, times: api.customPenalty ? pot.take : undefined });
          s.level = 0.3;
        }
        s.pot = pot.pot;
        s.phase = o === "ones" ? "assign" : "result";
        return;
      }
      case "assign": {
        const target = String(g.target ?? "");
        if (s.phase !== "assign" || (pid !== s.turn && !host) || !api.has(target)) return;
        const pot = potStep(s.pot ?? 1, "ones");
        api.penalty([target], "full", byPenalty(api, NOTE.ones, NOTE_CUSTOM.ones), { times: api.customPenalty ? pot.take : undefined });
        s.pot = pot.pot;
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
    return { id: "dice", turn: s.turn, level: s.level, pot: s.pot ?? 1, phase: s.phase, dice: s.dice, roll: s.roll, rolledAt: s.rolledAt, outcome: s.outcome };
  },
};
