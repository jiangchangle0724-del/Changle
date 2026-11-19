/**
 * A retargeted dance (retarget.ts's files) made into a loop on its own beat: the motion's beat found
 * from how fast her body turns (its period between 80 and 150 a minute) and where it falls (the hips
 * lowest: the knees give on the beat), then a whole number of bars from a downbeat, the last half
 * beat eased into the frames before its start so it goes round without a jump. Writes the loop's
 * frames (the same 16-bit turns, the hips' place) and what the page needs: its beats, the seconds a
 * beat takes in it, how hard it goes.
 *
 * usage (from site/): npx tsx <this> <in dir> <out dir> <name> [name …]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

type Head = { name: string; frames: number; fps: number; bones: string[]; seconds: number };

const BODY = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftShoulder", "RightShoulder"];

function main() {
  const [inDir, outDir, ...names] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const report: unknown[] = [];
  for (const name of names) {
    const head = JSON.parse(readFileSync(join(inDir, `${name}.json`), "utf8")) as Head;
    const qb = readFileSync(join(inDir, `${name}.q.bin`));
    const hb = readFileSync(join(inDir, `${name}.hips.bin`));
    const q = new Int16Array(qb.buffer, qb.byteOffset, qb.byteLength / 2);
    const hips = new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2);
    const B = head.bones.length;
    const N = head.frames;
    const fps = head.fps;
    const quat = (f: number, i: number, out = new THREE.Quaternion()) => {
      const o = (f * B + i) * 4;
      return out.set(q[o] / 32767, q[o + 1] / 32767, q[o + 2] / 32767, q[o + 3] / 32767).normalize();
    };
    // how fast her body turns, frame to frame, and the hips going up and down
    const idx = BODY.map((n) => head.bones.indexOf(n)).filter((i) => i >= 0);
    const speed = new Float64Array(N);
    const a = new THREE.Quaternion();
    const b = new THREE.Quaternion();
    for (let f = 1; f < N; f++) {
      let s = 0;
      for (const i of idx) s += quat(f, i, a).angleTo(quat(f - 1, i, b));
      s += Math.abs(hips[f * 3 + 1] - hips[(f - 1) * 3 + 1]) / 1000 * 8;
      speed[f] = s * fps;
    }
    speed[0] = speed[1];
    const mean = speed.reduce((x, y) => x + y, 0) / N;
    const sig = Array.from(speed, (x) => x - mean);
    // its beat: the strongest repeat between 0.4 and 0.75 seconds
    const ac = (lag: number) => {
      let s = 0;
      let n = 0;
      for (let f = 0; f + lag < N; f++) {
        s += sig[f] * sig[f + lag];
        n++;
      }
      return n ? s / n : 0;
    };
    // its beat: the strongest repeat (a peak of the autocorrelation, not the edge of the range)
    // between 0.4 and 0.75 seconds; a peak outside it halved or doubled into it
    const lo = Math.round(0.28 * fps), hi = Math.round(1.1 * fps);
    const r = Array.from({ length: hi + 2 }, (_, l) => (l >= lo - 1 ? ac(l) : 0));
    const peaks: number[] = [];
    for (let l = lo; l <= hi; l++) if (r[l] > r[l - 1] && r[l] >= r[l + 1] && r[l] > 0) peaks.push(l);
    const inRange = (l: number) => l >= 0.4 * fps && l <= 0.75 * fps;
    let bestLag = Math.round(0.5 * fps);
    const good = peaks.filter(inRange);
    if (good.length) bestLag = good.reduce((a, b) => (r[b] > r[a] ? b : a));
    else if (peaks.length) {
      const p = peaks.reduce((a, b) => (r[b] > r[a] ? b : a));
      bestLag = p < 0.4 * fps ? p * 2 : Math.round(p / 2);
    }
    // (between frames: the peak's top, from the two beside it)
    const r0 = ac(bestLag - 1);
    const r1 = ac(bestLag);
    const r2 = ac(bestLag + 1);
    const den = r0 - 2 * r1 + r2;
    let period = (bestLag + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (r0 - r2)) / den)) : 0)) / fps;
    // where the beats fall: the hips lowest, folded over the period (or how fast it moves, peaks)
    const bins = 24;
    const low = new Float64Array(bins);
    const cnt = new Float64Array(bins);
    const fast = new Float64Array(bins);
    for (let f = 0; f < N; f++) {
      const ph = ((f / fps) % period) / period;
      const k = Math.min(bins - 1, Math.floor(ph * bins));
      low[k] += hips[f * 3 + 1];
      fast[k] += speed[f];
      cnt[k]++;
    }
    let lowK = 0;
    let fastK = 0;
    const mean_ = (a: Float64Array, k: number) => (cnt[k] ? a[k] / cnt[k] : NaN);
    for (let k = 0; k < bins; k++) {
      if (!cnt[k]) continue;
      if (!(mean_(low, k) >= mean_(low, lowK))) lowK = k;
      if (!(mean_(fast, k) <= mean_(fast, fastK))) fastK = k;
    }
    const range = Math.max(...Array.from({ length: bins }, (_, k) => (cnt[k] ? low[k] / cnt[k] : -Infinity))) - low[lowK] / cnt[lowK];
    // (a dance that hardly bobs: the beat where it moves fastest)
    const phase = (((range > 12 ? lowK : fastK) + 0.5) / bins) * period;
    // the loop: whole bars from a downbeat, as many as fit after half a beat's lead-in
    const fade = Math.round((period / 2) * fps);
    let start = phase;
    while (start * fps < fade) start += period;
    let beats = Math.floor((head.seconds - start) / period / 4) * 4;
    let whole = false;
    if (beats < 4) {
      // a clip too short to cut a bar out of: it loops by itself (Mixamo's "- Loop" clips), so all of it,
      // as the number of beats (2, 4 or 8) that gives a beat between 0.4 and 0.75 seconds
      const n = [4, 2, 8].find((b) => head.seconds / b >= 0.4 && head.seconds / b <= 0.75);
      if (!n) {
        console.log(name, "too short to loop", head.seconds.toFixed(2), period.toFixed(3));
        continue;
      }
      beats = n;
      whole = true;
    }
    const len = whole ? head.seconds : beats * period;
    if (whole) {
      period = len / beats;
      start = 0;
    }
    const n = Math.round(len * fps);
    const out = new Int16Array(n * B * 4);
    const outH = new Int16Array(n * 3);
    const sample = (t: number, i: number, into: THREE.Quaternion) => {
      const f = Math.max(0, Math.min(N - 1, t * fps));
      const f0 = Math.floor(f);
      const f1 = Math.min(N - 1, f0 + 1);
      return into.copy(quat(f0, i, a)).slerp(quat(f1, i, b), f - f0);
    };
    const hipAt = (t: number, c: number) => {
      const f = Math.max(0, Math.min(N - 1, t * fps));
      const f0 = Math.floor(f);
      const f1 = Math.min(N - 1, f0 + 1);
      return hips[f0 * 3 + c] + (hips[f1 * 3 + c] - hips[f0 * 3 + c]) * (f - f0);
    };
    const x = new THREE.Quaternion();
    const y = new THREE.Quaternion();
    for (let j = 0; j < n; j++) {
      const t = start + j / fps;
      // the last half beat eases into what came just before the start, so the loop's end is its start
      const w = j >= n - fade ? (j - (n - fade)) / fade : 0;
      const e = w * w * (3 - 2 * w);
      for (let i = 0; i < B; i++) {
        sample(t, i, x);
        if (e > 0) sample(t - len, i, y), x.slerp(y, e);
        const s = x.w < 0 ? -1 : 1;
        const o = (j * B + i) * 4;
        out[o] = Math.round(x.x * s * 32767);
        out[o + 1] = Math.round(x.y * s * 32767);
        out[o + 2] = Math.round(x.z * s * 32767);
        out[o + 3] = Math.round(x.w * s * 32767);
      }
      for (let c = 0; c < 3; c++) {
        const h = hipAt(t, c);
        outH[j * 3 + c] = Math.round(e > 0 ? h + (hipAt(t - len, c) - h) * e : h);
      }
    }
    // where the hips travel, taken out (she dances on her spot, framed on the TV): each frame's place
    // less the average over the bar around it (round the loop), so the sway stays and the walk goes
    const bar = Math.max(1, Math.round(Math.min(4 * period, len) * fps));
    for (const c of [0, 2]) {
      const v = Array.from({ length: n }, (_, j) => outH[j * 3 + c]);
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = -Math.floor(bar / 2); k < bar - Math.floor(bar / 2); k++) s += v[(((j + k) % n) + n) % n];
        outH[j * 3 + c] = Math.round(v[j] - s / bar);
      }
    }
    const energy = speed.slice(Math.floor(start * fps), Math.floor((start + len) * fps)).reduce((p, v) => p + v, 0) / n;
    const info = { name, fps, frames: n, beats, beat: +period.toFixed(4), bpm: +(60 / period).toFixed(1), energy: +energy.toFixed(2), bob: Math.round(range), bones: head.bones };
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(info));
    writeFileSync(join(outDir, `${name}.q.bin`), Buffer.from(out.buffer));
    writeFileSync(join(outDir, `${name}.hips.bin`), Buffer.from(outH.buffer));
    report.push({ name, bpm: info.bpm, beats, energy: info.energy, bob: info.bob, sec: +len.toFixed(2) });
  }
  console.table(report);
}
main();
