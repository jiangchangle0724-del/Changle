/**
 * 流氓十三张's 摇一摇洗牌 (Steve, 11-26, the third of the four ideas from the open-source Kings Cup
 * apps): while the deck has run out, a good shake of the phone that may deal does what the pull
 * does, and the pile gathers back and the deck shuffles. Only a real shake counts (four strong
 * moves inside 0.7 s that span at least 0.2 s, with the thresholds four times a dance step's), so
 * picking the phone up or putting it down hard, one short jolt, deals nothing.
 *
 * The motion sensor is asked for once a session, from a tap (iPhone prompts; Chrome answers
 * "prompt", not "granted", to a request made without a tap, so there is no asking quietly): the
 * hint carries the button until the sensor is live, then says shake. A phone without one (a
 * desktop, or one that said no) gets no hint.
 */
import { Smartphone } from "lucide-react";
import { useRef } from "react";
import { haptic } from "../lib/sfx";
import { enableSensors, useMotionWatch, useSensorStatus } from "../party/sensors";
import { useStore } from "../store";
import { Button } from "../ui/Button";

/** How many strong moves inside the window make a shake, how long they must go on for (a jolt is shorter), and the rest after one. */
const SHAKES = 4;
const WINDOW_MS = 700;
const SPAN_MS = 200;
const REST_MS = 1500;

/**
 * While `on`, a shake calls `onShake`. Returns what the hint should say: `ready` once the sensor
 * is live, or `ask`, the tap that turns it on (iPhone before it is allowed).
 */
export function useShakeToShuffle(on: boolean, onShake: () => void) {
  const status = useSensorStatus();
  const hits = useRef<number[]>([]);
  const last = useRef(0);
  const cb = useRef(onShake);
  cb.current = onShake;
  useMotionWatch(
    on && status === "on",
    () => {
      const now = performance.now();
      hits.current = [...hits.current.filter((t) => now - t < WINDOW_MS), now];
      if (hits.current.length < SHAKES || now - hits.current[0] < SPAN_MS || now - last.current < REST_MS) return;
      last.current = now;
      hits.current = [];
      haptic(20);
      cb.current();
    },
    0.25,
  );
  return { ready: on && status === "on", ask: on && (status === "off" || status === "asking") ? enableSensors : null, asking: status === "asking" };
}

/** The line under the empty deck, and in the recap: shake to shuffle, or the tap that allows it first. */
export function ShakeHint({ shake }: { shake: ReturnType<typeof useShakeToShuffle> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (shake.ask) {
    const ask = shake.ask;
    return (
      <div className="rg-shake-hint">
        <Button tone="quiet" size="sm" icon={Smartphone} onClick={() => void ask()} disabled={shake.asking}>
          {zh ? "开启摇一摇洗牌" : "Turn on shake to shuffle"}
        </Button>
      </div>
    );
  }
  if (!shake.ready) return null;
  return (
    <p className="rg-shake-hint">
      <Smartphone size={16} aria-hidden="true" />
      {zh ? "摇一摇手机也能洗牌" : "Shake the phone to shuffle"}
    </p>
  );
}
