import { useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import { useRoomEvent } from "../online/RoomContext";
import type { SpinScope } from "../shared/protocol";

/**
 * A bottle or a wheel on the big screen: it turns when a phone spins it, landing on the same slot
 * as every phone (the spin's plan comes from the table: useNetSpin is the phones' side). Nothing
 * here can be touched. Its ticks and whir sound only on the screen that plays the show.
 */
export function useScreenSpin({ scope, count, rest, sound, friction, tick = 0.6 }: { scope: SpinScope; count: number; rest: number; sound: boolean; friction?: number; tick?: number }) {
  const loud = useRef(sound);
  loud.current = sound;
  const table = useTurntable({
    count: Math.max(1, count),
    friction,
    disabled: true,
    onTick: () => {
      if (loud.current) sfx.tick(tick);
    },
    onSettle: () => {
      if (loud.current) sfx.settle();
    },
  });
  // (a still value when quiet: the whir follows whatever turns)
  const still = useMotionValue(0);
  useSpinSound(sound ? table.rotation : still);

  useRoomEvent((e) => {
    if (e.k === "spin" && e.scope === scope) table.play(e);
  });

  // on arrival, and when the table changes size: sit on the server's slot once nothing moves
  const first = useRef(true);
  const live = useRef({ spinning: table.spinning, front: table.frontIndex });
  live.current = { spinning: table.spinning, front: table.frontIndex };
  useEffect(() => {
    if (first.current) {
      first.current = false;
      table.jump(rest);
      return;
    }
    const id = window.setTimeout(() => {
      if (!live.current.spinning && live.current.front !== rest) table.jump(rest);
    }, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, rest]);

  return table;
}
