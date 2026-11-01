import { useEffect, useRef, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { beatIndexAt, curveAt, type BeatMap } from "../../lib/beats";
import "../../styles/party.css";
import { Crew, type Mate } from "./crew";
import { Choreo, resolveMood, seedOf, type Cue, type Role } from "./moves";
import { Performer } from "./performer";

/**
 * The stage for Name That Tune: two little performers either side of the record. Whoever sings
 * the song sings (a man's song, he sings; a woman's, she does; a mixed group, both), and the
 * other one dances to the beat, in the song's mood: big moves for a party song, a headbang for
 * rock, a sway and tears for a sad one, blushes and hearts for a love song. The beats and the
 * voice come from the preview itself (lib/beats.ts) and every choice from the song and the beat
 * number, so every phone moves the same way at the same moment.
 */

export type StageTiming = { startPerf: number; offset: number };
/** A reaction to the answer; `at` makes each one new. */
export type StageCue = { kind: Cue; at: number };

/** The drawing's box: the body fills it, arms and hair may reach outside (overflow is visible). */
export const AVATAR_VIEWBOX = "44 10 112 286";

type Live = { singer: number; playing: boolean; beats: BeatMap | null; timing: StageTiming | null; fallbackBpm: number; mood: string; songKey: string | number };

export function TuneStage({
  singer,
  playing,
  beats,
  timing,
  fallbackBpm = 100,
  mood = "",
  songKey = "",
  cue = null,
  crew,
  children,
}: {
  /** 1 a man sings, 2 a woman, 3 both, 0 nobody knows (both dance) */
  singer: number;
  playing: boolean;
  beats: BeatMap | null;
  timing: StageTiming | null;
  fallbackBpm?: number;
  /** what the title and categories say about the song (shared/songs.ts moodOf) */
  mood?: string;
  /** anything that names the song: the dance is picked from it */
  songKey?: string | number;
  cue?: StageCue | null;
  /** the players, on the stage's front edge (online: their drawn figures) */
  crew?: Mate[];
  children?: ReactNode;
}) {
  const left = useRef<SVGSVGElement>(null);
  const right = useRef<SVGSVGElement>(null);
  const notes = useRef<SVGGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const cast = useRef<{ m: Choreo; f: Choreo } | null>(null);
  const live = useRef<Live>({ singer, playing, beats, timing, fallbackBpm, mood, songKey });
  live.current = { singer, playing, beats, timing, fallbackBpm, mood, songKey };

  // the performers, and one loop that moves them both
  useEffect(() => {
    if (!left.current || !right.current) return;
    const m = new Choreo(new Performer(left.current, "m", 1));
    const f = new Choreo(new Performer(right.current, "f", -1));
    m.pairWith(() => f);
    f.pairWith(() => m);
    cast.current = { m, f };
    let lastBeat = -1;
    let lastNote = 0;
    let lastT = performance.now();
    const tick = () => {
      const L = live.current;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      const period = 60 / (L.beats?.bpm || L.fallbackBpm || 100);
      let pos = -1, idx = -1, drum = 0, voice = 0;
      if (L.playing && L.timing) {
        pos = (now - L.timing.startPerf) / 1000 + L.timing.offset;
        if (pos >= 0) {
          idx = L.beats ? beatIndexAt(L.beats.beats, pos) : Math.floor(pos / period);
          drum = L.beats ? curveAt(L.beats.drum, L.beats.frame, pos) : 0.6;
          voice = L.beats ? curveAt(L.beats.voice, L.beats.frame, pos) : 0.35 + 0.35 * Math.max(0, Math.sin(pos * 2.2));
        } else pos = -1;
      }
      m.frame(dt, now, pos, idx, period, drum, voice);
      f.frame(dt, now, pos, idx, period, drum, voice);
      const el = root.current;
      if (el) {
        if (idx !== lastBeat && idx > 0) el.style.setProperty("--beat", "1");
        else el.style.setProperty("--beat", String(Math.max(0, Number(el.style.getPropertyValue("--beat") || 0) - dt / Math.min(0.5, period * 0.8))));
        el.style.setProperty("--voice", voice.toFixed(2));
        el.style.setProperty("--drum", drum.toFixed(2));
      }
      lastBeat = idx;
      // notes float up from whoever is singing out
      const g = notes.current;
      if (g && !reduced() && now - lastNote > 420) {
        for (const [c, x] of [[m, 60], [f, 340]] as const) {
          if (c.voice < 0.45) continue;
          lastNote = now;
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.textContent = Math.random() < 0.5 ? "♪" : "♫";
          t.setAttribute("fill", c === m ? "#8ad8ff" : "#ff9cc5");
          t.setAttribute("font-size", String(14 + Math.random() * 8));
          t.setAttribute("x", String(x + (Math.random() - 0.5) * 20));
          t.setAttribute("y", "40");
          g.appendChild(t);
          gsap.to(t, { y: -50 - Math.random() * 30, x: `+=${(Math.random() - 0.5) * 30}`, opacity: 0, rotation: (Math.random() - 0.5) * 40, duration: 1.4, ease: "power1.out", onComplete: () => t.remove() });
        }
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      m.destroy();
      f.destroy();
      m.p.destroy();
      f.p.destroy();
      cast.current = null;
    };
  }, []);

  // roles follow the singer; the dance follows the song
  useEffect(() => {
    const c = cast.current;
    if (!c) return;
    const on = playing && !!timing;
    const md = resolveMood(mood, beats);
    const seed = seedOf(songKey || "song");
    const bpm = beats?.bpm ?? fallbackBpm;
    const role = (sings: boolean): Role => (!on ? "idle" : sings ? "sing" : "dance");
    c.m.set(role(singer === 1 || singer === 3), md, seed, bpm);
    c.f.set(role(singer === 2 || singer === 3), md, seed, bpm);
  }, [singer, playing, timing, beats, mood, songKey, fallbackBpm]);

  // a cheer or a shrug when the answer is out
  const cueAt = cue?.at ?? 0;
  useEffect(() => {
    const c = cast.current;
    if (!c || !cue) return;
    c.m.cue(cue.kind);
    c.f.cue(cue.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueAt]);

  return (
    <div className={`tn-stage ${playing ? "is-live" : ""} ${crew?.length ? "has-crew" : ""}`} ref={root} data-singer={singer} aria-hidden="true">
      <div className="tn-stage-lights" />
      <div className="tn-stage-floor" />
      <svg className="tn-avatar tn-avatar-m" viewBox={AVATAR_VIEWBOX} ref={left} />
      <div className="tn-stage-mid">{children}</div>
      <svg className="tn-avatar tn-avatar-f" viewBox={AVATAR_VIEWBOX} ref={right} />
      <svg className="tn-stage-notes" viewBox="0 0 400 60">
        <g ref={notes} />
      </svg>
      {crew?.length ? <Crew mates={crew} /> : null}
    </div>
  );
}
