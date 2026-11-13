// A song's beat, measured in its YouTube video, step 2 of 2: once record.js's video has played to
// its end, run this in the same page with EXPECT set to the song's tempo as published (its BPM; a
// fast song danced at half its tempo is still measured at its own). It finds the grid whose beats
// land on the most onsets (rises in loudness) within 1.5 BPM of EXPECT, and prints:
//   bpm, firstBeatMs: the grid (beat k is at firstBeatMs + k * 60000 / bpm in the video);
//   local: in windows of 16 beats, how far (ms) the onsets sit from the grid. Near 0 all through:
//     a steady song. A jump after a stop: the video was cut there (end the dance before it);
//   blocks: each 8 beats, where it is (s), how the kick and all the sound hit each beat (0 to 9)
//     and how loud each beat is (dB): where the music starts, breaks and ends.
// Then in songs.ts: bpm, firstBeatMs = the grid's beat where the dance starts (at least 4 beats
// in, for the count-in; a whole 8-count where the song's phrase starts), beats = whole 8-counts
// that end before the music does (and before any cut). See the six measured on 12 Nov there.
const EXPECT = __BPM__;
const S = window.__an;
const sr = S.sr;
const BIN = 0.01;
const dur = S.v.duration;
const n = Math.ceil(dur / BIN) + 1;
const sum = [new Float64Array(n), new Float64Array(n)];
const cnt = new Float64Array(n);
let k = 0;
for (const p of S.pairs) {
  if (p[2]) continue;
  for (let i = 0; i < 4 && k < S.rows.length; i++, k += 3) {
    const b = Math.round((p[1] - (1024 - i * 256) / sr) / BIN);
    if (b < 0 || b >= n) continue;
    sum[0][b] += S.rows[k + 1];
    sum[1][b] += S.rows[k + 2];
    cnt[b]++;
  }
}
// loudness per 10 ms (dB), gaps filled from the last one
const db = sum.map((arr) => {
  const out = new Float64Array(n);
  let last = -90;
  for (let i = 0; i < n; i++) {
    if (cnt[i]) last = Math.max(-90, 10 * Math.log10(arr[i] / cnt[i] + 1e-12));
    out[i] = last;
  }
  return out;
});
// onset strength: rises in loudness, smoothed
const osf = db.map((e) => {
  const d = new Float64Array(n);
  for (let i = 1; i < n; i++) d[i] = Math.max(0, e[i] - e[i - 1]);
  const s = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) s[i] = 0.25 * d[i - 1] + 0.5 * d[i] + 0.25 * d[i + 1];
  return s;
});
const comb = osf[0].map((v, i) => v + osf[1][i]);
const at = (arr, x) => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= n) return 0;
  const f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
};
// the tempo and where its beats fall: the grid whose beats land on the most onset
let best = { score: -1 };
for (let bpm = EXPECT - 1.5; bpm <= EXPECT + 1.5; bpm += 0.01) {
  const P = 60 / bpm / BIN;
  for (let ph = 0; ph < P; ph += 0.5) {
    let sc = 0;
    for (let x = ph; x < n; x += P) sc += at(comb, x);
    if (sc > best.score) best = { score: sc, bpm, ph };
  }
}
// the phase, finer
{
  const P = 60 / best.bpm / BIN;
  for (let ph = best.ph - 1; ph <= best.ph + 1; ph += 0.05) {
    let sc = 0;
    for (let x = ph; x < n; x += P) sc += at(comb, x);
    if (sc > best.score) best = { ...best, score: sc, ph };
  }
}
const P = 60 / best.bpm / BIN;
const first = ((best.ph % P) + P) % P;
const beats = [];
for (let x = first; x < n - 1; x += P) beats.push(x);
const peak = (arr, x) => {
  let m = 0;
  for (let j = Math.round(x - 4); j <= Math.round(x + 4); j++) if (j >= 0 && j < n) m = Math.max(m, arr[j]);
  return m;
};
const low = beats.map((x) => Math.round(peak(osf[1], x) * 10));
const all = beats.map((x) => Math.round(peak(osf[0], x) * 10));
const loud = beats.map((x) => {
  let s = 0;
  let c = 0;
  for (let j = Math.round(x); j < Math.round(x + P) && j < n; j++) {
    s += db[0][j];
    c++;
  }
  return Math.round(c ? s / c : -90);
});
// the grid's fit through the song: in windows of 16 beats, how far (ms) the onsets sit from it
const local = [];
for (let wi = 0; wi + 16 <= beats.length; wi += 16) {
  let bestOff = 0;
  let bestSc = -1;
  for (let off = -8; off <= 8; off += 0.5) {
    let sc = 0;
    for (let j = wi; j < wi + 16; j++) sc += at(comb, beats[j] + off);
    if (sc > bestSc) {
      bestSc = sc;
      bestOff = off;
    }
  }
  local.push(Math.round(bestOff * 10));
}
const bpm = Math.round(best.bpm * 1000) / 1000;
const firstBeatMs = Math.round(first * BIN * 1000);
const dig = (v, s) => String(Math.min(9, Math.round(v / s)));
const lines = [];
for (let b = 0; b < beats.length; b += 8) {
  lines.push(`${String(b).padStart(3)} ${((firstBeatMs + (b * 60000) / bpm) / 1000).toFixed(1).padStart(6)}s ${low.slice(b, b + 8).map((v) => dig(v, 14)).join("")} ${all.slice(b, b + 8).map((v) => dig(v, 12)).join("")} ${loud.slice(b, b + 8).join(" ")}`);
}
({ vid: S.vid, dur, bpm, firstBeatMs, beats: beats.length, local: local.join(","), blocks: lines.join("\n") });
