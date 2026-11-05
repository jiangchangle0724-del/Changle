import { Footprints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "../../lib/anim";
import { confetti } from "../../lib/confetti";
import { useRoomEvent } from "../../online/RoomContext";
import { DANCE, moveAt } from "../../shared/dj/dance";
import { Choreo } from "../tune/moves";
import { Performer } from "../tune/performer";
import { Coach3D } from "./Coach3D";

/** The performer's drawing box (party/tune/stage.tsx): the body fills it, arms and hair reach outside. */
const VIEWBOX = "44 10 112 286";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/**
 * 跟着跳 on the big screen (Steve on Nov 2: the TV is for dancing along; his plan's 一起跳): a coach,
 * Name That Tune's performer, dancing the routine's move on the speaker's own beat, its name big,
 * the next one coming in the last beats before it, and how the whole floor is doing together. Every
 * phone knows the same move from the same beat count (shared/dj/dance.ts).
 */
export function Coach({ clock, zh, combo, dancers }: { clock: Clock; zh: boolean; combo: number; dancers: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [beat, setBeat] = useState(-1);
  // the robot in 3D once it's loaded (the drawn coach till then, and on a screen without WebGL)
  const [three, setThree] = useState<"try" | "on" | "off">("try");
  const threeOn = useRef(false);
  threeOn.current = three === "on";
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
      c.pinMove = moveAt(i).move.id;
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

  const m = beat >= 0 ? moveAt(beat) : null;
  const soon = !!m && m.left <= DANCE.showNext;
  const L = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  return (
    <aside className={`dj-coach ${m ? "is-on" : ""}`} aria-label={zh ? "跟着跳" : "Dance along"}>
      <canvas ref={canvas} className="dj-coach-confetti" aria-hidden="true" />
      <span className="dj-coach-title">
        <Footprints size={22} aria-hidden="true" />
        {zh ? "跟着跳" : "Dance along"}
      </span>
      <div className="dj-coach-stage">
        <svg className={`dj-coach-svg ${three === "on" ? "is-off" : ""}`} viewBox={VIEWBOX} ref={svg} aria-hidden="true" />
        {three !== "off" && <Coach3D clock={clock} onReady={() => setThree("on")} onFail={() => setThree("off")} />}
      </div>
      {m ? (
        <div className="dj-coach-moves">
          <span className="dj-coach-now">{L(m.move)}</span>
          <span className={`dj-coach-next ${soon ? "is-soon" : ""}`}>
            {soon ? (zh ? `${m.left} 拍后：${L(m.next)}` : `In ${m.left}: ${L(m.next)}`) : zh ? `接下来：${L(m.next)}` : `Next: ${L(m.next)}`}
          </span>
        </div>
      ) : (
        <span className="dj-coach-next">{zh ? "音乐一开始就跟着跳" : "Dance along once the music starts"}</span>
      )}
      <div className="dj-coach-combo" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={combo} aria-label={zh ? "全场一起跳" : "The whole floor together"}>
        <span className="dj-coach-combo-fill" style={{ width: `${Math.round(combo * 100)}%` }} />
        <span className="dj-coach-combo-text">{dancers ? (zh ? `${dancers} 人在跳 · 全场一起跳` : `${dancers} dancing · the whole floor together`) : zh ? "手机握在手里跟着跳，就能上榜" : "Hold your phone and dance along to score"}</span>
      </div>
    </aside>
  );
}
