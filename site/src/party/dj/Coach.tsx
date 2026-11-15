import { useEffect, useRef, useState } from "react";
import { gsap } from "../../lib/anim";
import { moveAt, type Mood } from "../../shared/dj/dance";
import { Choreo } from "../tune/moves";
import { Performer } from "../tune/performer";
import { Coach3D } from "./Coach3D";
import { Dancer3D } from "./Dancer3D";

/** The performer's drawing box (party/tune/stage.tsx): the body fills it, arms and hair reach outside. */
const VIEWBOX = "44 10 112 286";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/**
 * The dancer on the big screen, beside the floor all night (Steve on Nov 14: "她更像一个在酒吧跳舞的
 * 角色来烘托气氛的"; till then she was 跟着跳's coach, with the move's name and how to do it, all taken
 * out the same day: "把我打红色的x的框和文字都删了，仅保留人物"): only her, no card and no words,
 * dancing on the speaker's own beat. The dancer in 3D (Dancer3D, a new outfit each `song`); the robot
 * (coach/robot.ts) where she can't be shown; Name That Tune's performer, drawn, where no 3D can. `over`
 * the song's video when it fills the TV (Nov 14: "要一直在那里不能消失").
 */
export function Coach({ clock, mood, over, song }: { clock: Clock; mood: Mood; over: boolean; song: string | null }) {
  const svg = useRef<SVGSVGElement>(null);
  // the dancer in 3D once she's loaded; the robot where she can't be (her files didn't come, her
  // frames too slow); the drawn one till then, and on a screen without WebGL
  // (local runs: a check of something else can leave her drawn, dj_floor3d_check.py: in software she's heavy)
  const [three, setThree] = useState<"try" | "on" | "robot" | "robot-on" | "off">(() => (import.meta.env.DEV && (window as unknown as { __djDancerOff?: boolean }).__djDancerOff === true ? "off" : "try"));
  const threeOn = useRef(false);
  threeOn.current = three === "on" || three === "robot-on";
  const moodNow = useRef(mood);
  moodNow.current = mood;
  const [getMood] = useState(() => () => moodNow.current);
  useEffect(() => {
    if (!svg.current) return;
    const c = new Choreo(new Performer(svg.current, "f", 1));
    let role = "";
    let lastT = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      const b = clock.beat();
      const bpm = clock.bpm() || 125;
      const period = 60 / bpm;
      const on = Number.isFinite(b) && b >= 0;
      const want = on ? "dance" : "idle";
      if (want !== role) {
        role = want;
        c.set(on ? "dance" : "idle", "hype", 7, bpm);
      }
      if (!on) {
        c.frame(dt, now, -1, -1, period, 0, 0);
        return;
      }
      c.pinMove = moveAt(Math.floor(b), moodNow.current).move.drawn;
      // (the drawn one rests while she, or the robot, dances)
      if (!threeOn.current) c.frame(dt, now, b * period, Math.floor(b), period, clock.energy(), 0);
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      c.destroy();
      c.p.destroy();
    };
  }, [clock]);

  return (
    // (only a picture: nothing in it to read)
    <div className={`dj-coach ${over ? "is-over" : ""}`} aria-hidden="true">
      <div className="dj-coach-stage">
        <svg className={`dj-coach-svg ${three === "on" || three === "robot-on" ? "is-off" : ""}`} viewBox={VIEWBOX} ref={svg} aria-hidden="true" />
        {(three === "try" || three === "on") && <Dancer3D clock={clock} mood={getMood} song={song} onReady={() => setThree("on")} onFail={() => setThree("robot")} />}
        {(three === "robot" || three === "robot-on") && <Coach3D clock={clock} mood={getMood} onReady={() => setThree("robot-on")} onFail={() => setThree("off")} />}
      </div>
    </div>
  );
}
