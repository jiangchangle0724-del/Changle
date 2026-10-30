import { useEffect, useRef, useState } from "react";
import { haptic, sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import type { SpinScope } from "../shared/protocol";
import { useRoom, useRoomEvent } from "./RoomContext";

/** Less than this and it was a nudge, not a spin: nobody gets picked by a nudge. */
const MIN_TRAVEL = 270;

/**
 * A bottle or wheel that one phone spins and every phone watches land on the same slot.
 * The spinner's hand plans the motion; the plan goes to the table; the others replay it.
 */
export function useNetSpin({
  scope,
  count,
  canSpin,
  rest,
  friction,
  tick = 0.6,
}: {
  scope: SpinScope;
  count: number;
  canSpin: boolean;
  /** Where it should sit when nothing is moving (late arrivals, the table changed size). */
  rest: number;
  friction?: number;
  tick?: number;
}) {
  const { me, act } = useRoom();
  const [weak, setWeak] = useState(0);
  const table = useTurntable({
    count: Math.max(1, count),
    friction,
    disabled: !canSpin,
    onTick: () => {
      sfx.tick(tick);
      haptic(5);
    },
    onSettle: () => {
      sfx.settle();
      haptic([12, 40, 18]);
    },
    onPlan: (p) => {
      if (Math.abs(p.delta) < MIN_TRAVEL) {
        setWeak(Date.now());
        return;
      }
      act({ a: "spin", scope, index: p.index, delta: p.delta, duration: p.duration });
    },
  });
  useSpinSound(table.rotation);

  useRoomEvent((e) => {
    if (e.k === "spin" && e.scope === scope && e.by !== me) table.play(e);
  });

  // settle on the server's slot once nothing is moving: on arrival, and when the table changes size
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

  return { table, weak };
}
