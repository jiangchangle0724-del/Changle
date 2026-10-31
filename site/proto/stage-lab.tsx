/* Dev only: the Name That Tune stage in every mood, on a made-up beat, for looking at the performers. */
import "../src/styles/global.css";
import "../src/styles/components.css";
import { createRoot } from "react-dom/client";
import type { BeatMap } from "../src/lib/beats";
import { TuneStage, type StageCue } from "../src/party/tune/stage";
import { Vinyl } from "../src/party/tune/parts";
import { useEffect, useState } from "react";

const q = new URLSearchParams(location.search);
const MOODS: [string, string, number, number][] = [
  // hint, label, bpm, loud
  ["hype", "hype", 128, 0.5],
  ["rock", "rock", 140, 0.45],
  ["", "happy", 118, 0.36],
  ["groove", "groove", 96, 0.4],
  ["love", "love", 92, 0.3],
  ["", "tender", 76, 0.2],
  ["sad", "sad", 70, 0.25],
  ["classic", "classic", 84, 0.15],
];

function fakeBeats(bpm: number, loud: number): BeatMap {
  const frame = 0.02, secs = 60, F = Math.round(secs / frame), period = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0.2; t < secs; t += period) beats.push(t);
  const drum = new Float32Array(F), voice = new Float32Array(F);
  let hold = 0;
  for (let f = 0; f < F; f++) {
    const t = f * frame;
    const near = beats.some((b) => t >= b && t - b < frame);
    hold = Math.max(near ? 0.95 : 0, hold * 0.86);
    drum[f] = hold;
    const cyc = t % 8;
    voice[f] = cyc < 0.8 ? 0.05 : cyc < 4.2 ? 0.45 + 0.25 * Math.abs(Math.sin(t * 3)) : cyc < 5.6 ? 0.92 : cyc < 7.4 ? 0.5 : 0.08;
  }
  return { bpm, beats: Float32Array.from(beats), drum, voice, frame, conf: 0.5, loud };
}

function Lab() {
  const singer = Number(q.get("singer") ?? 2);
  const only = q.get("mood");
  const offset = Number(q.get("at") ?? 0);
  const [timing] = useState(() => ({ startPerf: performance.now() + 300, offset }));
  const [cue, setCue] = useState<StageCue | null>(null);
  const playing = q.get("idle") === null;
  useEffect(() => {
    const c = q.get("cue");
    if (c === "right" || c === "wrong") {
      const id = setTimeout(() => setCue({ kind: c, at: performance.now() }), Number(q.get("cueAt") ?? 1500));
      return () => clearTimeout(id);
    }
  }, []);
  const list = MOODS.filter(([, label]) => !only || only.split(",").includes(label));
  const cols = Number(q.get("cols") ?? (list.length > 4 ? 4 : list.length));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${q.get("w") ?? 390}px)`, gap: 18, padding: 18, background: "var(--night, #1a1030)" }}>
      {list.map(([hint, label, bpm, loud]) => (
        <div key={label} style={{ color: "#fff", fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>{label} · {bpm} bpm</div>
          <TuneStage singer={singer} playing={playing} beats={fakeBeats(bpm, loud)} timing={timing} mood={hint} songKey={`${label}-${q.get("seed") ?? 1}`} cue={cue}>
            <Vinyl spinning={playing} label="?" />
          </TuneStage>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
