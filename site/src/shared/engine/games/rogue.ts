import { fullDeck, RULE_BY_RANK, ruleWords, type Rank } from "../../../data/rogue13";
import type { RogueHolders, RoguePhase, RogueView } from "../../protocol";
import { byPenalty, intIn, range, t, type Api, type GameDef } from "../api";

const DECK = fullDeck();

type Interrupt =
  | { kind: "camera"; by: string; phase: "freeze" | "judge"; endsAt: number }
  | { kind: "nose"; by: string; endsAt: number; taps: Record<string, number> };

type S = {
  deck: number[];
  turn: string;
  drawer: string | null;
  card: number | null;
  phase: RoguePhase;
  holders: RogueHolders;
  wcUsed: boolean;
  reshuffled: boolean;
  garden: { kind: number; speaker: string; endsAt: number; said: number } | null;
  grab: { next: number; claimed: Record<string, number>; endsAt: number; last: { n: number; pid: string; at: number } | null } | null;
  sevens: { n: number; speaker: string; endsAt: number; streak: number; log: { pid: string; n: number; pass: boolean }[] } | null;
  interrupt: Interrupt | null;
};

const HOLD_KEY: Partial<Record<Rank, keyof RogueHolders>> = { "2": "buddy", "5": "camera", "6": "nose", "8": "wc", "10": "trouble" };

const N = {
  garden: t("逛三园：说不出或重复", "Three Gardens: stalled or repeated"),
  gardenSlow: t("逛三园：没接上", "Three Gardens: too slow"),
  grabLast: t("抢数字：最后一个", "Grab the Number: last one left"),
  grabCollide: t("抢数字：撞数了", "Grab the Number: same number"),
  grabNone: t("抢数字：没抢到", "Grab the Number: never grabbed"),
  sevensWrong: t("逢七过：说错了", "Sevens: wrong call"),
  sevensSlow: t("逢七过：没接上", "Sevens: too slow"),
  camera: t("照相机：动了", "Camera: you moved"),
  noseSlow: t("摸鼻子：最慢", "Nose: last one"),
  noseMiss: t("摸鼻子：没摸", "Nose: never touched it"),
  trouble: t("神经病：接了话", "Troublemaker: you answered"),
  wc: t("没有 WC 票：先喝再去", "No bathroom pass: drink first"),
  wcCustom: t("没有 WC 票：先受罚再去", "No bathroom pass: penalty first"),
};

const GARDEN_MS = 7000;
const GRAB_MS = 15000;
const COLLIDE_MS = 400;

const isSeven = (n: number) => n % 7 === 0 || String(n).includes("7");

/** The card's title, in the words of the table's penalty. */
function noteFor(s: S, api: Api) {
  return s.card !== null ? ruleWords(RULE_BY_RANK[DECK[s.card].rank], api.customPenalty).title : undefined;
}

function pen(s: S, api: Api, who: string[], kind: "sip" | "full", note = noteFor(s, api), delay = 0) {
  api.penalty(who, kind, note, { buddy: s.holders.buddy, delay });
}

function endSub(s: S, api: Api) {
  s.phase = "done";
  s.garden = null;
  s.grab = null;
  s.sevens = null;
  api.clear("garden");
  api.clear("grab");
  api.clear("sevens");
}

function remainingGrab(s: S, api: Api) {
  return api.ids().filter((id) => s.grab && s.grab.claimed[id] === undefined);
}

function startGrab(s: S, api: Api, drawer: string) {
  s.grab = { next: 2, claimed: { [drawer]: 1 }, endsAt: api.now + GRAB_MS, last: null };
  s.phase = "grab";
  api.timer("grab", s.grab.endsAt);
  const left = remainingGrab(s, api);
  if (left.length <= 1) {
    pen(s, api, left, "sip", N.grabLast, 900);
    endSub(s, api);
  }
}

function resolveNose(s: S, api: Api, timedOut: boolean) {
  const it = s.interrupt;
  if (!it || it.kind !== "nose") return;
  const others = api.ids().filter((id) => id !== it.by);
  const missing = others.filter((id) => it.taps[id] === undefined);
  s.interrupt = null;
  api.clear("nose");
  if (missing.length && timedOut) {
    pen(s, api, missing, "sip", N.noseMiss);
    return;
  }
  const tapped = Object.entries(it.taps).sort((a, b) => b[1] - a[1]);
  if (tapped.length) pen(s, api, [tapped[0][0]], "sip", N.noseSlow);
}

export const rogue: GameDef<S> = {
  id: "rogue",
  min: 2,
  init(api) {
    return {
      deck: api.shuffle(range(DECK.length)),
      turn: api.ids()[0],
      drawer: null,
      card: null,
      phase: "draw",
      holders: {},
      wcUsed: false,
      reshuffled: false,
      garden: null,
      grab: null,
      sevens: null,
      interrupt: null,
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "draw": {
        if (s.phase !== "draw" || s.interrupt) return;
        if (pid !== s.turn && !host) return;
        const drawer = s.turn;
        s.reshuffled = false;
        if (!s.deck.length) {
          s.deck = api.shuffle(range(DECK.length));
          s.holders = {};
          s.wcUsed = false;
          s.reshuffled = true;
          api.fx("shuffle");
        }
        s.card = s.deck.pop() ?? 0;
        s.drawer = drawer;
        api.fx("card", drawer);
        const rank = DECK[s.card].rank;
        const rule = RULE_BY_RANK[rank];
        const title = ruleWords(rule, api.customPenalty).title;
        switch (rule.kind) {
          case "pick":
            s.phase = "pick";
            return;
          case "self-sip":
            pen(s, api, [drawer], "sip", title, 1100);
            s.phase = "done";
            return;
          case "self-full":
            pen(s, api, [drawer], "full", title, 1100);
            s.phase = "done";
            return;
          case "left":
            pen(s, api, [api.prev(drawer)], "sip", title, 1100);
            s.phase = "done";
            return;
          case "right":
            pen(s, api, [api.next(drawer)], "sip", title, 1100);
            s.phase = "done";
            return;
          case "hold": {
            const key = HOLD_KEY[rank];
            if (key) s.holders[key] = drawer;
            if (rank === "8") s.wcUsed = false;
            s.phase = "done";
            return;
          }
          case "group":
            if (rank === "3") s.phase = "garden-pick";
            else if (rank === "4") startGrab(s, api, drawer);
            else s.phase = "sevens-start";
            return;
        }
        return;
      }

      case "pick": {
        const target = String(g.target ?? "");
        if (s.phase !== "pick" || (pid !== s.drawer && !host) || !api.has(target)) return;
        pen(s, api, [target], "sip");
        s.phase = "done";
        return;
      }

      case "next": {
        if (s.interrupt) return;
        if (s.phase === "done" && (pid === s.drawer || pid === s.turn || host)) {
          s.turn = api.next(s.drawer ?? s.turn);
          s.phase = "draw";
          s.card = null;
          s.drawer = null;
        }
        return;
      }

      case "skip": {
        // (the turn or card the host meant to skip: a second tap, or one sent late, mustn't skip the next one too)
        if (!host || (g.at !== undefined && g.at !== `${s.phase}:${s.turn}`)) return;
        if (s.phase === "draw") {
          s.turn = api.next(s.turn);
          return;
        }
        endSub(s, api);
        return;
      }

      /* 3: three gardens */
      case "garden": {
        const kind = intIn(g.kind, 0, 2);
        if (s.phase !== "garden-pick" || kind === null || (pid !== s.drawer && !host) || !s.drawer) return;
        s.garden = { kind, speaker: api.next(s.drawer), endsAt: api.now + GARDEN_MS, said: 0 };
        s.phase = "garden";
        api.timer("garden", s.garden.endsAt);
        return;
      }
      case "said": {
        if (s.phase !== "garden" || !s.garden || pid !== s.garden.speaker) return;
        s.garden.speaker = api.next(s.garden.speaker);
        s.garden.said += 1;
        s.garden.endsAt = api.now + GARDEN_MS;
        api.timer("garden", s.garden.endsAt);
        return;
      }
      case "repeat": {
        if (s.phase !== "garden" || !s.garden || (pid !== s.drawer && !host)) return;
        pen(s, api, [s.garden.speaker], "sip", N.garden);
        endSub(s, api);
        return;
      }

      /* 4: grab the number */
      case "grab": {
        const n = intIn(g.n, 1, 99);
        const gr = s.grab;
        if (s.phase !== "grab" || !gr || n === null) return;
        if (gr.claimed[pid] === undefined && n === gr.next) {
          gr.claimed[pid] = n;
          gr.last = { n, pid, at: api.now };
          gr.next += 1;
          api.fx("grab", pid, [n]);
          const left = remainingGrab(s, api);
          if (left.length <= 1) {
            pen(s, api, left, "sip", N.grabLast, 700);
            endSub(s, api);
          }
          return;
        }
        // a second phone on the same number inside the window: both drink
        if (gr.last && n === gr.last.n && pid !== gr.last.pid && api.now - gr.last.at <= COLLIDE_MS && gr.claimed[pid] === undefined) {
          api.fx("collide", pid, [n]);
          pen(s, api, [gr.last.pid, pid], "sip", N.grabCollide);
          endSub(s, api);
        }
        return;
      }

      /* 7: sevens */
      case "sevens": {
        const start = intIn(g.start, 1, 20);
        if (s.phase !== "sevens-start" || start === null || (pid !== s.drawer && !host) || !s.drawer) return;
        s.sevens = { n: start + 1, speaker: api.next(s.drawer), endsAt: api.now + 6000, streak: 0, log: [{ pid: s.drawer, n: start, pass: false }] };
        s.phase = "sevens";
        api.timer("sevens", s.sevens.endsAt);
        return;
      }
      case "say": {
        const sv = s.sevens;
        if (s.phase !== "sevens" || !sv || pid !== sv.speaker || typeof g.pass !== "boolean") return;
        const right = g.pass === isSeven(sv.n);
        sv.log.push({ pid, n: sv.n, pass: g.pass });
        if (sv.log.length > 6) sv.log = sv.log.slice(-6);
        if (!right) {
          pen(s, api, [pid], "sip", N.sevensWrong);
          endSub(s, api);
          return;
        }
        sv.n += 1;
        sv.streak += 1;
        if (sv.n > 99) {
          endSub(s, api);
          return;
        }
        sv.speaker = api.next(sv.speaker);
        sv.endsAt = api.now + Math.max(2600, 5200 - sv.streak * 120);
        api.timer("sevens", sv.endsAt);
        return;
      }

      /* standing powers */
      case "camera": {
        if (pid !== s.holders.camera || s.interrupt) return;
        s.interrupt = { kind: "camera", by: pid, phase: "freeze", endsAt: api.now + 3500 };
        api.fx("camera", pid);
        api.timer("camera", api.now + 3500);
        return;
      }
      case "moved": {
        const it = s.interrupt;
        if (!it || it.kind !== "camera" || it.phase !== "judge" || pid !== it.by) return;
        const target = g.target ? String(g.target) : null;
        s.interrupt = null;
        if (target && api.has(target) && target !== pid) pen(s, api, [target], "sip", N.camera);
        return;
      }
      case "nose": {
        if (pid !== s.holders.nose || s.interrupt) return;
        s.interrupt = { kind: "nose", by: pid, endsAt: api.now + 6000, taps: {} };
        api.fx("nose", pid);
        api.timer("nose", api.now + 6000);
        return;
      }
      case "tap": {
        const it = s.interrupt;
        if (!it || it.kind !== "nose" || pid === it.by || it.taps[pid] !== undefined) return;
        it.taps[pid] = api.now;
        const others = api.ids().filter((id) => id !== it.by);
        if (others.every((id) => it.taps[id] !== undefined)) resolveNose(s, api, false);
        return;
      }
      case "trouble": {
        const target = String(g.target ?? "");
        if (pid !== s.holders.trouble || !api.has(target) || target === pid) return;
        pen(s, api, [target], "sip", N.trouble);
        return;
      }
      case "wc": {
        if (pid === s.holders.wc && !s.wcUsed) {
          s.wcUsed = true;
          api.fx("wc", pid);
          return;
        }
        pen(s, api, [pid], "sip", byPenalty(api, N.wc, N.wcCustom));
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    if (key === "garden" && s.phase === "garden" && s.garden) {
      pen(s, api, [s.garden.speaker], "sip", N.gardenSlow);
      endSub(s, api);
    } else if (key === "grab" && s.phase === "grab" && s.grab) {
      const left = remainingGrab(s, api);
      if (left.length) pen(s, api, left, "sip", N.grabNone);
      endSub(s, api);
    } else if (key === "sevens" && s.phase === "sevens" && s.sevens) {
      pen(s, api, [s.sevens.speaker], "sip", N.sevensSlow);
      endSub(s, api);
    } else if (key === "camera" && s.interrupt?.kind === "camera") {
      s.interrupt.phase = "judge";
    } else if (key === "nose" && s.interrupt?.kind === "nose") {
      resolveNose(s, api, true);
    }
  },

  leave(s, pid, api) {
    for (const k of Object.keys(s.holders) as (keyof RogueHolders)[]) if (s.holders[k] === pid) delete s.holders[k];
    if (s.interrupt && s.interrupt.by === pid) {
      s.interrupt = null;
      api.clear("camera");
      api.clear("nose");
    }
    if (s.turn === pid) {
      s.turn = api.ids()[0] ?? "";
      if (s.phase === "draw" || s.phase === "done") {
        s.phase = "draw";
        s.card = null;
        s.drawer = null;
      }
    }
    if (s.drawer === pid && s.phase !== "draw") endSub(s, api);
    if (s.garden?.speaker === pid) s.garden.speaker = api.ids()[0] ?? "";
    if (s.sevens?.speaker === pid) s.sevens.speaker = api.ids()[0] ?? "";
  },

  view(s): RogueView {
    const it = s.interrupt;
    return {
      id: "rogue",
      turn: s.turn,
      drawer: s.drawer,
      card: s.card !== null ? DECK[s.card] : null,
      left: s.deck.length,
      phase: s.phase,
      holders: s.holders,
      wcUsed: s.wcUsed,
      reshuffled: s.reshuffled,
      garden: s.garden,
      grab: s.grab ? { next: s.grab.next, claimed: s.grab.claimed, endsAt: s.grab.endsAt } : null,
      sevens: s.sevens ? { n: s.sevens.n, speaker: s.sevens.speaker, endsAt: s.sevens.endsAt, log: s.sevens.log } : null,
      interrupt: !it ? null : it.kind === "camera" ? { ...it } : { kind: "nose", by: it.by, endsAt: it.endsAt, tapped: Object.keys(it.taps) },
    };
  },
};
