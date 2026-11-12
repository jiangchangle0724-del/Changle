// Plays the game's music on the one device that plays it (bgmPlan.ts decides what, how loud and
// where; bgm.ts plays it). One on every screen, from the app itself so it carries on from the game
// to the results; it draws nothing.
import { useEffect, useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { lightDevice } from "../art/satellite";
import { bgm } from "../bgm";
import { prefs } from "../prefs";
import { serverNow } from "../store";
import { bgmDevice, bgmPlan } from "./bgmPlan";

export function Bgm({ v }: { v: RoomView | null }) {
  const [, tick] = useState(0);
  const now = serverNow();
  const plan = v ? bgmPlan(v, now) : null;
  const mine = !!v && bgmDevice(v) === v.you.id;
  // (look again when the plan changes by the clock: a silence ends, a song comes in, the ending's over)
  const next = plan?.next ?? 0;
  useEffect(() => {
    const left = next - serverNow();
    if (!next || left <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [next]);
  useEffect(() => {
    if (!v || !plan || !mine || !prefs.music) return bgm.want(null);
    bgm.want({
      piece: plan.piece,
      level: plan.level,
      at: plan.at === undefined ? undefined : Date.now() + (plan.at - serverNow()),
      // a phone gets the mono file (half the memory); the big screen the stereo one
      mono: v.you.role !== "screen" || lightDevice(),
    });
  });
  useEffect(() => () => bgm.want(null), []);
  return null;
}
