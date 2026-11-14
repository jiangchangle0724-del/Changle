import { Footprints } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "../../lib/anim";
import { confetti } from "../../lib/confetti";
import { useRoomEvent } from "../../online/RoomContext";
import { DANCE, moveAt, type Mood } from "../../shared/dj/dance";
import { Choreo } from "../tune/moves";
import { Performer } from "../tune/performer";
import { Coach3D } from "./Coach3D";
import { Dancer3D } from "./Dancer3D";

/** The performer's drawing box (party/tune/stage.tsx): the body fills it, arms and hair reach outside. */
const VIEWBOX = "44 10 112 286";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/**
 * 跟着跳 on the big screen (Steve on Nov 2: the TV is for dancing along; his plan's 一起跳): a coach
 * dancing the routine's move on the speaker's own beat (the dancer, Dancer3D, in a new outfit each
 * `song`; the robot, coach/robot.ts, where she can't be shown; Name That Tune's performer where no 3D can), its name big, a line saying how to do it (Steve on Nov 14:
 * "下面有文字告诉大家怎么跳"), the next one coming in the last beats before it, and how the whole floor
 * is doing together. On all night, whole songs too (Nov 14: "要一直在那里不能消失"): `over` the video
 * when it fills the TV. Every phone knows the same move from the same beat count and the night's
 * stretch (`mood`, shared/dj/dance.ts).
 */
export function Coach({ clock, zh, mood, over, combo, dancers, song }: { clock: Clock; zh: boolean; mood: Mood; over: boolean; combo: number; dancers: number; song: string | null }) {
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [beat, setBeat] = useState(-1);
  // the dancer in 3D once she's loaded (Steve on Nov 14); the robot where she can't be (her files
  // didn't come, her frames too slow); the drawn coach till then, and on a screen without WebGL
  const [three, setThree] = useState<"try" | "on" | "robot" | "robot-on" | "off">("try");
  const threeOn = useRef(false);
  threeOn.current = three === "on" || three === "robot-on";
  const moodNow = useRef(mood);
  moodNow.current = mood;
  const [getMood] = useState(() => () => moodNow.current);
  // the whole floor danced together long enough: fireworks
  useRoomEvent((e) => {
    if (e.k !== "fx" || e.fx !== "dance") return;
    confetti(canvas.current, { x: 0.5, y: 0.7, count: 180, angle: -90, spread: 70, power: 20 });
  });
  useEffect(() => {
    if (!svg.current) return;
    const c = new Choreo(new Performer(svg.current, "f", 1));
    let role = "";
    let last = -1;
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
        if (last !== -1) setBeat((last = -1));
        return;
      }
      const i = Math.floor(b);
      // (the drawn coach has no stool: a move danced sitting, its nearest standing one)
      c.pinMove = moveAt(i, moodNow.current).move.drawn;
      // (the drawn coach rests while the robot dances)
      if (!threeOn.current) c.frame(dt, now, b * period, i, period, clock.energy(), 0);
      if (i !== last) setBeat((last = i));
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      c.destroy();
      c.p.destroy();
    };
  }, [clock]);

  const m = beat >= 0 ? moveAt(beat, mood) : null;
  const soon = !!m && m.left <= DANCE.showNext;
  const L = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  // the move's name on one line: smaller when it's long (an English one, say), so the card stays its size
  const nowEl = useRef<HTMLSpanElement>(null);
  const name = m ? L(m.move) : "";
  useLayoutEffect(() => {
    const fit = () => {
      const el = nowEl.current;
      if (!el) return;
      el.style.removeProperty("--fit");
      const k = el.clientWidth / el.scrollWidth;
      if (k < 1) el.style.setProperty("--fit", String(Math.max(0.6, Math.floor(k * 100) / 100)));
    };
    fit();
    // (again once the display font is in)
    let gone = false;
    void document.fonts?.ready.then(() => {
      if (!gone) fit();
    });
    return () => {
      gone = true;
    };
  }, [name]);
  return (
    <aside className={`dj-coach ${m ? "is-on" : ""} ${over ? "is-over" : ""}`} aria-label={zh ? "跟着跳" : "Dance along"}>
      <canvas ref={canvas} className="dj-coach-confetti" aria-hidden="true" />
      <span className="dj-coach-title">
        <Footprints size={22} aria-hidden="true" />
        {zh ? "跟着跳" : "Dance along"}
      </span>
      <div className="dj-coach-stage">
        <svg className={`dj-coach-svg ${three === "on" || three === "robot-on" ? "is-off" : ""}`} viewBox={VIEWBOX} ref={svg} aria-hidden="true" />
        {(three === "try" || three === "on") && <Dancer3D clock={clock} mood={getMood} song={song} onReady={() => setThree("on")} onFail={() => setThree("robot")} />}
        {(three === "robot" || three === "robot-on") && <Coach3D clock={clock} mood={getMood} onReady={() => setThree("robot-on")} onFail={() => setThree("off")} />}
      </div>
      {m ? (
        <div className="dj-coach-moves">
          <span className="dj-coach-now" ref={nowEl}>
            {name}
          </span>
          {/* how to do it (keyed: it comes in again with each move) */}
          <span key={m.move.id} className="dj-coach-how">
            <span>{L(m.move.how)}</span>
          </span>
          <span className={`dj-coach-next ${soon ? "is-soon" : ""}`}>
            {soon ? (zh ? `${m.left} 拍后：${L(m.next)}` : `In ${m.left}: ${L(m.next)}`) : zh ? `接下来：${L(m.next)}` : `Next: ${L(m.next)}`}
          </span>
        </div>
      ) : (
        <span className="dj-coach-next">{zh ? "音乐一开始就跟着跳" : "Dance along once the music starts"}</span>
      )}
      <div className="dj-coach-combo" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={combo} aria-label={zh ? "全场一起跳" : "The whole floor together"}>
        <span className="dj-coach-combo-fill" style={{ width: `${Math.round(combo * 100)}%` }} />
        <span className="dj-coach-combo-text">{dancers ? (zh ? `${dancers} 人在跳 · 全场一起跳` : `${dancers} dancing · the whole floor together`) : zh ? "手机握在手里跟着跳，就能上榜" : "Dance along with your phone to score"}</span>
      </div>
    </aside>
  );
}
