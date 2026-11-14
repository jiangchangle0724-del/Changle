import { useEffect, useRef, useState } from "react";
import { SeatFace } from "../../online/People";
import { useRoom } from "../../online/RoomContext";
import { DANMU, danmuText, type DanmuLine } from "../../shared/dj/danmu";
import type { DjView } from "../../shared/protocol";

/** rows the lines fly in */
const LANES = 6;
/** seconds an empty line would take to cross the screen (every line moves at the same speed) */
const CROSS_S = 8;
/** seconds a line stands, faded in and out, with reduced motion (nothing flies) */
const STILL_S = 4;
/** the most a line waits for a free row before it's dropped (a flood of them) */
const WAIT_MAX_S = 8;

type Fly = { key: number; line: DanmuLine; lane: number; dur: number; wait: number };

/** About how wide a line is, in px at the TV's comment size: its face and name, then its words. */
function widthOf(text: string, name: string, em: number) {
  const w = (s: string) => Array.from(s).reduce((n, c) => n + (/[\u0000-ɏ]/.test(c) ? 0.6 : 1.1), 0);
  return Math.round((w(text) + w(name) * 0.7 + 3.2) * em);
}

/**
 * 弹幕 on the big screen (Steve on Nov 13): each new line from a phone flies from the right edge
 * across the whole screen, over the video too, with its sender's face and name; the rows take
 * turns so lines never run into each other (all move at one speed), and a flood waits its turn or
 * is dropped. With reduced motion a line stands still at the left, fades in and out.
 */
export function DanmuLayer({ v, zh }: { v: DjView; zh: boolean }) {
  const { room, now, nameOf } = useRoom();
  const [flying, setFlying] = useState<Fly[]>([]);
  const seen = useRef(0);
  const freeAt = useRef<number[]>(Array(LANES).fill(0));
  const on = v.danmuOn !== false;

  useEffect(() => {
    const list = v.danmu ?? [];
    const t = now();
    const fresh = list.filter((l) => l.n > seen.current && t - l.at < DANMU.freshMs);
    for (const l of list) seen.current = Math.max(seen.current, l.n);
    if (!on || !fresh.length) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.innerWidth;
    const em = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2;
    const speed = wide / CROSS_S;
    const clock = performance.now() / 1000;
    const add: Fly[] = [];
    for (const line of fresh) {
      const w = widthOf(danmuText(line, zh), nameOf(line.pid), em);
      // the row free soonest
      let lane = 0;
      for (let k = 1; k < LANES; k++) if (freeAt.current[k] < freeAt.current[lane]) lane = k;
      const wait = Math.max(0, freeAt.current[lane] - clock);
      if (wait > WAIT_MAX_S) continue;
      const dur = still ? STILL_S : (wide + w) / speed;
      // the next line in this row starts once this one's tail is in, with a gap
      freeAt.current[lane] = clock + wait + (still ? STILL_S : (w + em * 1.5) / speed);
      add.push({ key: line.n, line, lane, dur, wait });
    }
    if (!add.length) return;
    setFlying((f) => [...f, ...add]);
    for (const a of add) window.setTimeout(() => setFlying((f) => f.filter((x) => x.key !== a.key)), (a.wait + a.dur) * 1000 + 300);
    // (the view, not the clock: each new list of lines once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.danmu, on]);

  // off: the lines on their way go too
  useEffect(() => {
    if (!on) setFlying([]);
  }, [on]);

  if (!flying.length) return null;
  const seats = room?.seats ?? [];
  return (
    <div className="dj-danmu" aria-hidden="true">
      {flying.map((f) => {
        const seat = seats.find((s) => s.id === f.line.pid);
        return (
          <div key={f.key} className="dj-danmu-line" style={{ ["--lane" as string]: f.lane, ["--dur" as string]: `${f.dur}s`, ["--wait" as string]: `${f.wait}s` }}>
            {seat && <SeatFace seat={seat} size={40} />}
            <span className="dj-danmu-who">{seat?.name ?? nameOf(f.line.pid)}</span>
            <span className="dj-danmu-text">{danmuText(f.line, zh)}</span>
          </div>
        );
      })}
    </div>
  );
}
