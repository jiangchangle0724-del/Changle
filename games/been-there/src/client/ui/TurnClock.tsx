// The turn clock's countdown (room.ts turnClock): when the team the game is waiting for has done nothing
// on a decision for 60 seconds, every screen counts down 15 more, and then the computer makes that one
// move for the team. It stands still with the game (a pause, a party forfeit), like every countdown.
import { useEffect, useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { BUZZ, buzz } from "../controls";
import { t } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { seatName, useCountdown } from "./common";

export interface IdleWarn {
  seat: number;
  /** Server time the computer moves. */
  until: number;
}

/** The countdown, once it's showing (null before, and when there's no clock). Re-renders when it starts. */
export function useIdleWarn(v: RoomView): IdleWarn | null {
  const c = v.game?.turnClock ?? null;
  const [, tick] = useState(0);
  const frozen = v.game?.frozenAt ?? null;
  const now = frozen ?? serverNow();
  const startsIn = c ? c.warnAt - now : 0;
  useEffect(() => {
    if (!c || frozen !== null || startsIn <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), startsIn + 20);
    return () => clearTimeout(id);
  }, [c?.warnAt, frozen]);
  if (!c || startsIn > 0) return null;
  return { seat: c.seat, until: c.at };
}

/**
 * The countdown, in words: on a phone as the line under the top bar (`banner`) or at the top of the
 * question it's about; on the big screen in the middle of the board (`tv`). The team that hasn't moved
 * is asked whether it's still there, and its phone chimes and buzzes once.
 */
export function IdleNote({ v, warn, banner, tv }: { v: RoomView; warn: IdleWarn; banner?: boolean; tv?: boolean }) {
  const n = useCountdown(warn.until) ?? 0;
  const yours = !tv && v.you.seats.includes(warn.seat);
  useEffect(() => {
    if (!yours || !banner) return;
    sfx.alert();
    buzz(BUZZ.turn);
  }, [warn.until, yours, banner]);
  const team = seatName(v, warn.seat);
  if (tv)
    return (
      <div class="boardcenter big">
        <p class="pending idle-warn">{t("idleWarnTv", { team })}</p>
        <p class="countdown num">{t("idleWarnTvSub", { n })}</p>
      </div>
    );
  const text = yours ? t("idleWarnYou", { n }) : t("idleWarn", { team, n });
  return banner ? (
    <p class="banner warn idle-warn" role="status">
      {text}
    </p>
  ) : (
    <p class="idle-warn note" role="status">
      {text}
    </p>
  );
}
