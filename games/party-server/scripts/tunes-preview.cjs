// The practice dances' tunes (src/client/tunes.ts) rendered to audio files, to hear them without a
// room: for each dance, a minute or so as the speaker plays it: 8 beats of its warm-up, 8 of the
// teaching to watch and 8 to follow (70% of the tempo), the count-in, then 48 beats of the dance
// (six 8-counts: a fill, a crash, the second round). Rendered in Chromium (an OfflineAudioContext,
// the speaker's own synth.ts), saved as MP3 next to a line of levels for each.
//   OUT=/some/dir node scripts/tunes-preview.cjs [routine-id …]
// STEMS=1: each part alone too (lead, chords, bass, drums), with its loudness: for balancing the mix.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");
const { chromium } = require("playwright");

const OUT = process.env.OUT || "/tmp/tunes";
const ENTRY = `
import { Synth, playBeat } from "./src/client/synth";
import { TUNES, tuneFor } from "./src/client/tunes";
import { buildShow, planRun, type RunBeat } from "./src/shared/show";

/** The beats to hear, back to back from 0 ms: some warm-up, some teaching, the count-in, some dance. */
function beats(id: string): RunBeat[] {
  const show = buildShow(id, "learn")!;
  const run = planRun(show, { leadStartAt: 0, danceStartAt: null, fromBeat: 0 });
  const take = (stage: string, n: number) => run.filter((b) => b.stage === stage).slice(0, n);
  const picked = [...take("warmup", 8), ...take("watch", 8), ...take("follow", 8), ...take("countdown", 4), ...take("dance", 48)];
  let t = 500;
  return picked.map((b) => {
    const out = { ...b, t };
    t += b.ms;
    return out;
  });
}

/** Only one part sounds: the others' calls do nothing (lead, comp, bass: by voice; drums: everything but notes and bells). */
function solo(synth: Synth, id: string, part: string) {
  const tune = tuneFor(id)!;
  const voice = part === "lead" ? tune.lead : part === "comp" ? tune.comp : part === "bass" ? tune.bass : null;
  const s = synth as unknown as Record<string, (...a: unknown[]) => void>;
  for (const k of ["kick2", "snare", "clap2", "openHat", "shaker", "tom", "block", "bigDrum", "gong", "cymbal", "riser", "hat", "chime"]) {
    const f = s[k]!.bind(synth);
    s[k] = (...a: unknown[]) => (part === "drums" && k !== "chime" ? f(...a) : undefined);
  }
  const note = s.note!.bind(synth);
  s.note = (...a: unknown[]) => (voice && a[3] === voice ? note(...a) : undefined);
}

async function render(id: string, part = ""): Promise<{ wav: string; seconds: number; peak: number; rms: number }> {
  const run = beats(id);
  const seconds = (run[run.length - 1]!.t + run[run.length - 1]!.ms) / 1000 + 2.5;
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const synth = new Synth();
  synth.startOffline(ctx);
  if (part) solo(synth, id, part);
  let phrase = 0;
  run.forEach((b, i) => {
    const prev = i > 0 ? run[i - 1]! : null;
    if (b.count === 1 && b.stage !== "countdown" && prev) phrase++;
    playBeat(synth, b, prev, phrase, false, tuneFor(id));
  });
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
    sum += L[i]! * L[i]! + R[i]! * R[i]!;
  }
  // 16-bit stereo WAV
  const n = L.length;
  const bytes = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((c, k) => bytes.setUint8(o + k, c.charCodeAt(0)));
  str(0, "RIFF");
  bytes.setUint32(4, 36 + n * 4, true);
  str(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 2, true);
  bytes.setUint32(24, rate, true);
  bytes.setUint32(28, rate * 4, true);
  bytes.setUint16(32, 4, true);
  bytes.setUint16(34, 16, true);
  str(36, "data");
  bytes.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i]!)) * 32767, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i]!)) * 32767, true);
  }
  let bin = "";
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { wav: btoa(bin), seconds, peak, rms: Math.sqrt(sum / (2 * n)) };
}

Object.assign(window, { renderTune: render, tuneIds: () => TUNES.map((t) => t.id) });
`;

/** Integrated loudness (LUFS), as ffmpeg's EBU R128 meter has it. */
function lufs(file) {
  const r = require("node:child_process").spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { encoding: "utf8" });
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr);
  return m ? m[1] : "?";
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const bundle = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: path.join(__dirname, ".."), sourcefile: "tunes-preview.ts", loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    target: ["es2020"],
    logLevel: "error",
  });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(() => window.tuneIds());
  for (const id of ids) {
    const r = await page.evaluate((x) => window.renderTune(x, ""), id);
    const wav = path.join(OUT, `${id}.wav`);
    fs.writeFileSync(wav, Buffer.from(r.wav, "base64"));
    const mp3 = path.join(OUT, `${id}.mp3`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-b:a", "160k", mp3]);
    fs.unlinkSync(wav);
    console.log(`${id}: ${r.seconds.toFixed(1)} s, peak ${r.peak.toFixed(2)}, rms ${r.rms.toFixed(3)}, ${lufs(mp3)} LUFS -> ${mp3}`);
    if (!process.env.STEMS) continue;
    const parts = [];
    for (const part of ["lead", "comp", "bass", "drums"]) {
      const st = await page.evaluate(([x, y]) => window.renderTune(x, y), [id, part]);
      const f = path.join(OUT, `${id}-${part}.wav`);
      fs.writeFileSync(f, Buffer.from(st.wav, "base64"));
      parts.push(`${part} ${lufs(f)}`);
      fs.unlinkSync(f);
    }
    console.log(`   ${parts.join(" · ")}`);
  }
  await browser.close();
})();
