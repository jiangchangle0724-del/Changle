import { Footprints, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "../../../online/RoomContext";
import { haptic } from "../../../lib/sfx";
import { beatOf, beatTime, DANCE, danced, danceShare, moveAt } from "../../../shared/dj/dance";
import type { DjView } from "../../../shared/protocol";

type G = (x: string, data?: Record<string, unknown>) => void;
type Sample = { t: number; a: number };

/** The hand's motion this long back is kept (a bar and a half at the slowest tempo). */
const KEEP_MS = 4000;

/** iOS asks before a page may read the motion sensors; everyone else just lets it. */
async function askMotion(): Promise<boolean> {
  const D = (typeof DeviceMotionEvent === "undefined" ? null : DeviceMotionEvent) as (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }) | null;
  if (!D) return false;
  if (typeof D.requestPermission !== "function") return true;
  try {
    return (await D.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * 跟着跳 on a phone (Steve on Nov 2: dance to match the dance on the TV; his plan's 一起跳): hold the
 * phone in your dancing hand and follow the coach. The phone reads its motion (gravity taken out),
 * checks each beat (moved, within 150 ms of it: the plan's easy mode), shows how it went, and sends
 * the room each bar's count. The move and the next one, from the same beat count as the TV.
 */
export function DancePad({ v, g, zh }: { v: DjView; g: G; zh: boolean }) {
  const { me, now } = useRoom();
  const [on, setOn] = useState(false);
  const [no, setNo] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [hit, setHit] = useState<{ n: number; ok: boolean } | null>(null);
  const [bar, setBar] = useState<{ n: number; of: number } | null>(null);
  const samples = useRef<Sample[]>([]);
  const since = useRef(0);
  const live = v.phase !== "wait" && v.phase !== "end";
  const grid = v.deck?.grid ?? null;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  // the checks move a pretend hand on this phone's own clock (dj_dance_check.py)
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __danceNow?: () => number }).__danceNow = now;
  }, [now]);

  // the hand's motion, as it comes (beats count from here, when the phone is listening, a moment
  // after the tap: a beat before it isn't a miss)
  useEffect(() => {
    if (!on) return;
    if (!since.current) {
      samples.current = [];
      since.current = now();
    }
    let gx = 0, gy = 0, gz = 0;
    const take = (e: DeviceMotionEvent) => {
      const lin = e.acceleration;
      let a: number;
      if (lin && lin.x !== null && lin.y !== null && lin.z !== null) a = Math.hypot(lin.x, lin.y, lin.z);
      else {
        // (no motion without gravity here: take gravity out with a slow average of the raw reading)
        const r = e.accelerationIncludingGravity;
        if (!r || r.x === null || r.y === null || r.z === null) return;
        gx += 0.1 * (r.x - gx);
        gy += 0.1 * (r.y - gy);
        gz += 0.1 * (r.z - gz);
        a = Math.hypot(r.x - gx, r.y - gy, r.z - gz);
      }
      const t = now();
      const list = samples.current;
      list.push({ t, a });
      while (list.length && list[0].t < t - KEEP_MS) list.shift();
    };
    window.addEventListener("devicemotion", take);
    return () => window.removeEventListener("devicemotion", take);
  }, [on, now]);

  // each beat as it passes (a moment after, so its window is in), each bar to the room
  useEffect(() => {
    if (!on || !live) return;
    let lastBeat = -1;
    let lastBar = -1;
    const look = () => {
      const gr = gridRef.current;
      if (!gr) return;
      const t = now();
      const b = Math.floor(beatOf(gr, t - DANCE.windowMs - 60));
      setBeat(Math.floor(beatOf(gr, t)));
      if (b <= lastBeat) return;
      // only beats the whole of whose window this phone was listening for
      const first = Math.max(lastBeat + 1, Math.ceil(beatOf(gr, since.current + DANCE.windowMs)));
      lastBeat = b;
      for (let k = first; k <= b; k++) {
        const ok = danced(samples.current, [beatTime(gr, k)])[0];
        setHit({ n: k, ok });
        if (ok) haptic(12);
        // the bar's last beat: its count to the room
        if (k % 4 === 3 && Math.floor(k / 4) > lastBar) {
          const barN = Math.floor(k / 4);
          const beats = [0, 1, 2, 3].map((j) => 4 * barN + j).filter((x) => beatTime(gr, x) - DANCE.windowMs >= since.current);
          if (beats.length === 4) {
            const n = danced(
              samples.current,
              beats.map((x) => beatTime(gr, x)),
            ).filter(Boolean).length;
            g("dance", { bar: barN, n, of: 4 });
            setBar({ n, of: 4 });
          }
          lastBar = barN;
        }
      }
    };
    const id = window.setInterval(look, 100);
    return () => window.clearInterval(id);
  }, [on, live, now, g]);

  const start = async () => {
    const yes = await askMotion();
    setNo(!yes);
    if (!yes) return;
    since.current = 0;
    setOn(true);
    haptic(20);
  };

  const L = (x: { zh: string; en: string }) => (zh ? x.zh : x.en);
  const m = beat >= 0 ? moveAt(beat) : null;
  const mine = v.dance?.[me];
  return (
    <section className={`djk-dance ${on ? "is-on" : ""}`} aria-label={zh ? "跟着跳" : "Dance along"}>
      <span className="djk-dance-title">
        <Footprints size={22} aria-hidden="true" />
        {zh ? "跟着跳" : "Dance along"}
      </span>
      {!on ? (
        <>
          <p className="djk-dance-note">{zh ? "手机握在跳舞的那只手里，屏幕朝里，跟着电视上的教练跳。踩在拍子上就得分。" : "Hold your phone in your dancing hand, screen in, and follow the coach on the TV. Moving on the beat scores."}</p>
          <button type="button" className="btn btn-primary btn-block" disabled={!live} onClick={start}>
            <Smartphone size={17} aria-hidden="true" />
            {zh ? "开始跟着跳" : "Start dancing"}
          </button>
          {no && <p className="djk-dance-note">{zh ? "这台手机没给动作感应的权限，跳不了分。可以在系统设置里打开。" : "This phone didn't allow its motion sensor, so it can't score. You can allow it in Settings."}</p>}
        </>
      ) : (
        <>
          {m && (
            <div className="djk-dance-move">
              <span className="djk-dance-now">{L(m.move)}</span>
              <span className="djk-dance-next">{m.left <= DANCE.showNext ? (zh ? `${m.left} 拍后：${L(m.next)}` : `In ${m.left}: ${L(m.next)}`) : zh ? `接下来：${L(m.next)}` : `Next: ${L(m.next)}`}</span>
            </div>
          )}
          <div className={`djk-dance-beat ${hit?.ok ? "is-hit" : hit ? "is-miss" : ""}`} key={hit?.n ?? -1} aria-live="polite">
            {hit ? (hit.ok ? (zh ? "踩准了" : "On the beat") : zh ? "动起来" : "Move it") : zh ? "跟上拍子" : "Find the beat"}
          </div>
          <p className="djk-dance-score tabular">
            {bar ? (zh ? `这一小节 ${bar.n}/${bar.of}` : `This bar ${bar.n}/${bar.of}`) : ""}
            {mine?.of ? (zh ? ` · 今晚踩准 ${Math.round(danceShare(mine) * 100)}%` : ` · tonight ${Math.round(danceShare(mine) * 100)}% on the beat`) : ""}
          </p>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setOn(false)}>
            {zh ? "不跳了" : "Stop dancing"}
          </button>
        </>
      )}
    </section>
  );
}
