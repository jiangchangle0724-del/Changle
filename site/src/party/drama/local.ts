import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { T } from "../../i18n";
import type { Api, GameDef } from "../../shared/engine/api";
import type { Fx, GameAction, GameView, PenaltyKind } from "../../shared/protocol";

/**
 * One phone runs the very same rules the rooms server runs online: the game's `GameDef` with a
 * small in-browser `Api` (clock, dice, timers). Penalties and effects come out as events for the
 * screen to show. The first player is the host.
 */
export type LocalPenalty = { who: string[]; kind: PenaltyKind; note?: T; say?: T };
export type LocalEvent = { k: "penalty"; p: LocalPenalty } | { k: "fx"; fx: Fx; pid?: string };

type Timer = { key: string; at: number; data?: unknown };

export function useLocalGame<S, V extends GameView>(def: GameDef<S>, ids: string[], onEvent: (e: LocalEvent) => void, customPenalty = false) {
  const state = useRef<S | null>(null);
  const timers = useRef<Timer[]>([]);
  const [, bump] = useState(0);
  const emit = useRef(onEvent);
  emit.current = onEvent;
  const players = useRef(ids);
  players.current = ids;
  // this phone's own penalty instead of drinking (settings)
  const custom = useRef(customPenalty);
  custom.current = customPenalty;

  const api = useCallback((): Api => {
    const list = () => players.current;
    const rand = () => Math.random();
    const self: Api = {
      now: Date.now(),
      customPenalty: custom.current,
      rand,
      int: (n) => Math.floor(rand() * Math.max(1, n)),
      shuffle: <X,>(a: X[]) => {
        const out = a.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },
      ids: list,
      has: (pid) => list().includes(pid),
      online: (pid) => list().includes(pid),
      isHost: (pid) => pid === list()[0],
      isOwner: () => false,
      next: (after, among) => {
        const l = among?.length ? list().filter((x) => among.includes(x)) : list();
        const i = after ? l.indexOf(after) : -1;
        return l[(i + 1) % l.length];
      },
      prev: (before, among) => {
        const l = among?.length ? list().filter((x) => among.includes(x)) : list();
        const i = l.indexOf(before);
        return l[(i - 1 + l.length) % l.length];
      },
      penalty: (who, kind, note, opts) => {
        const p: LocalPenalty = { who: who.filter((x) => list().includes(x)), kind, note, say: opts?.say };
        if (!p.who.length) return;
        if (opts?.delay) timers.current.push({ key: `pen:${Math.random()}`, at: Date.now() + opts.delay, data: p });
        else emit.current({ k: "penalty", p });
      },
      fx: (fx, pid) => emit.current({ k: "fx", fx, pid }),
      spin: () => {},
      timer: (key, at, data) => {
        timers.current = timers.current.filter((x) => x.key !== `g:${key}`);
        timers.current.push({ key: `g:${key}`, at, data });
      },
      clear: (key) => {
        timers.current = timers.current.filter((x) => x.key !== `g:${key}`);
      },
      resetStrokes: () => {},
      // one phone saves nothing: every change is shown at once anyway
      light: () => {},
      quiet: () => {},
    };
    return self;
  }, []);

  if (state.current === null) state.current = def.init(api());

  const act = useCallback(
    (pid: string, g: GameAction) => {
      if (!state.current) return;
      def.act(state.current, pid, g, api());
      bump((n) => n + 1);
    },
    [def, api],
  );

  // timers: fire whatever is due, a few times a second
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const due = timers.current.filter((x) => x.at <= now).sort((a, b) => a.at - b.at);
      if (!due.length || !state.current) return;
      timers.current = timers.current.filter((x) => x.at > now);
      for (const x of due) {
        if (x.key.startsWith("pen:")) emit.current({ k: "penalty", p: x.data as LocalPenalty });
        else def.timer?.(state.current, x.key.slice(2), x.data, api());
      }
      bump((n) => n + 1);
    }, 200);
    return () => window.clearInterval(id);
  }, [def, api]);

  const view = useCallback((pid: string) => def.view(state.current as S, pid, api()) as V, [def, api]);
  const reset = useCallback(() => {
    timers.current = [];
    state.current = def.init(api());
    bump((n) => n + 1);
  }, [def, api]);
  return useMemo(() => ({ act, view, reset }), [act, view, reset]);
}
