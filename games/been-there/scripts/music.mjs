// Makes the game's music (src/client/media/music) from the score in scripts/music/score.mjs:
//
//   npm run music
//
// Needs FluidSynth 2.3 or newer and ffmpeg with LAME (`apt install fluidsynth ffmpeg`, or
// `brew install fluid-synth ffmpeg`). The instruments are the GeneralUser GS SoundFont by S. Christian
// Collins, fetched once from its GitHub repository at a fixed version (32 MB, kept in the system's
// temp folder, never committed); its licence lets music made with it be used freely, commercially
// too (scripts/music/GeneralUser-GS-LICENSE.txt, also on the credits page and in licences.txt).
//
// Each instrument is played on its own (FluidSynth, its own reverb off), then they're mixed with
// ffmpeg: a little EQ each, the balance below, one room reverb they all send to (an impulse
// response made here), and the whole levelled to -20 LUFS, under the local hits and the game's
// sounds. The theme is played twice round and a bit, and the file is cut from the second time
// round with a second either side: the player loops it between those two points
// (src/client/bgm.json), so the join is the music going on, not a fade. The script checks that
// the second time round and the third match where the loop joins them.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { midiFile } from "./music/midi.mjs";
import { BEAT_S, BPM, STEMS, finale, perform, theme } from "./music/score.mjs";

const OUT = "src/client/media/music";
const META = "src/client/bgm.json";
const RATE = 44100;
const WORK = join(tmpdir(), "been-there-music");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

/** Where the mix sits: the music under the game's sounds and the local hits (src/client/bgm.ts sets its volume). */
const TARGET_LUFS = -20;
const FINALE_LUFS = -19;
/** Highest true peak allowed in the files. */
const PEAK_MAX = -1.5;

// ---------- the instruments ----------

const SF_COMMIT = "684543d5e5efaef08d02be50dcda8d552478fa60";
const SF_SHA256 = "9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe";
const SF_URL = `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${SF_COMMIT}/GeneralUser-GS.sf2`;
const SF = join(WORK, `GeneralUser-GS-${SF_COMMIT.slice(0, 7)}.sf2`);

async function soundfont() {
  const ok = () => existsSync(SF) && createHash("sha256").update(readFileSync(SF)).digest("hex") === SF_SHA256;
  if (ok()) return SF;
  console.log(`fetching GeneralUser GS (${SF_COMMIT.slice(0, 7)})...`);
  const r = await fetch(SF_URL);
  if (!r.ok) throw new Error(`GeneralUser GS: ${r.status}`);
  writeFileSync(SF, Buffer.from(await r.arrayBuffer()));
  if (!ok()) throw new Error("GeneralUser GS: not the file expected (checksum)");
  return SF;
}

// ---------- WAV ----------

/** A float WAV's samples, by channel. */
function readWav(file) {
  const b = readFileSync(file);
  let p = 12;
  let fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === "data") {
      if (!fmt || fmt.bits !== 32) throw new Error(`${file}: expected 32-bit float`);
      const n = Math.floor(Math.min(size, b.length - p - 8) / 4 / fmt.channels);
      const all = new Float32Array(b.buffer.slice(b.byteOffset + p + 8, b.byteOffset + p + 8 + n * fmt.channels * 4));
      const ch = Array.from({ length: fmt.channels }, (_, c) => {
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) out[i] = all[i * fmt.channels + c];
        return out;
      });
      return { rate: fmt.rate, ch };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data`);
}

function writeWav(file, ch, rate) {
  const n = ch[0].length;
  const all = new Float32Array(n * ch.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) all[i * ch.length + c] = ch[c][i];
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + all.byteLength, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);
  head.writeUInt16LE(ch.length, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * ch.length * 4, 28);
  head.writeUInt16LE(ch.length * 4, 32);
  head.writeUInt16LE(32, 34);
  head.write("data", 36);
  head.writeUInt32LE(all.byteLength, 40);
  writeFileSync(file, Buffer.concat([head, Buffer.from(all.buffer)]));
}

/**
 * The room: a stereo impulse response, 1.6 s. A few early reflections, then a tail of noise that
 * dies away over about 1.1 s (to -60 dB), its brightness going first. The same every time.
 */
function room(file) {
  const n = Math.round(1.6 * RATE);
  let seed = 7;
  const noise = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  const ch = [0, 1].map((side) => {
    const ir = new Float32Array(n);
    const taps = side ? [[13, 0.42], [19, 0.3], [29, 0.24], [37, 0.18], [47, 0.12]] : [[11, 0.45], [17, 0.33], [26, 0.25], [34, 0.2], [43, 0.14]];
    for (const [ms, g] of taps) ir[Math.round((ms / 1000) * RATE)] += g;
    let dark = 0;
    for (let i = Math.round(0.022 * RATE); i < n; i++) {
      const t = i / RATE;
      const x = noise();
      dark += 0.18 * (x - dark);
      ir[i] += x * 0.05 * Math.exp(-t / 0.09) + dark * 0.55 * Math.exp(-t / 0.16);
    }
    let e = 0;
    for (const v of ir) e += v * v;
    const k = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) ir[i] *= k;
    return ir;
  });
  writeWav(file, ch, RATE);
}

// ---------- playing and mixing ----------

/** Runs ffmpeg; returns what it wrote to stderr (where it reports). */
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${(r.stderr ?? "").slice(-3000)}`);
  return r.stderr ?? "";
}

/** One instrument's part to a float WAV (FluidSynth's own reverb and chorus off: the mix has the room). */
function play(sf, stem, notes, name) {
  const s = STEMS[stem];
  const mid = join(WORK, `${name}-${stem}.mid`);
  const wav = join(WORK, `${name}-${stem}.wav`);
  writeFileSync(mid, midiFile([{ ch: s.ch, program: s.program, cc: { 7: 100, 10: s.pan, 11: 127, 91: 0, 93: 0 }, notes }], BPM));
  execFileSync(
    "fluidsynth",
    ["-n", "-i", "-q", "-g", "0.5", "-r", String(RATE), "-T", "wav", "-O", "float", "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0", "-o", "synth.polyphony=256", "-F", wav, sf, mid],
    { stdio: "ignore" },
  );
  return wav;
}

/** Loudness of part of a file (LUFS, integrated) and its true peak (dBTP). */
function loudness(file, from = 0, len = 0) {
  const log = ffmpeg([...(from ? ["-ss", String(from)] : []), ...(len ? ["-t", String(len)] : []), "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const sum = log.slice(log.lastIndexOf("Summary"));
  const i = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(sum);
  const tp = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum);
  const num = (m) => (!m || m[1] === "-inf" ? -Infinity : Number(m[1]));
  return { lufs: num(i), peak: num(tp) };
}

/** Each instrument's EQ, and how much of it goes to the room. */
const CHAIN = {
  // (the clarinet's samples have a honk at about 1.3 kHz that stays put whatever the note)
  clarinet: { eq: "highpass=f=140,equalizer=f=1310:t=q:w=1.6:g=-2.5,equalizer=f=2800:t=q:w=1.2:g=-1.5", send: 0.2 },
  trumpet: { eq: "highpass=f=180,lowpass=f=9000", send: 0.24 },
  piano: { eq: "highpass=f=90,equalizer=f=320:t=q:w=1:g=-2", send: 0.17 },
  guitar: { eq: "highpass=f=160,lowpass=f=4500,equalizer=f=900:t=q:w=1:g=1.5", send: 0.12 },
  bass: { eq: "highpass=f=38,lowpass=f=2800,equalizer=f=110:t=q:w=1:g=1", send: 0.05 },
  drums: { eq: "highpass=f=55", send: 0.14 },
};
const ORDER = Object.keys(STEMS);

/**
 * The mix: each instrument through its EQ at its level, all of them dry plus their sends through the
 * room, summed, then the master level. `gains` are linear, per instrument.
 */
function mix(stems, gains, ir, out, master = 1) {
  const inputs = ORDER.flatMap((s) => ["-i", stems[s]]);
  const n = ORDER.length;
  const parts = ORDER.map((s, i) => `[${i}:a]${CHAIN[s].eq},volume=${gains[s].toFixed(5)},asplit=2[d${i}][w${i}];[w${i}]volume=${CHAIN[s].send}[s${i}]`);
  const graph = [
    ...parts,
    `${ORDER.map((_, i) => `[d${i}]`).join("")}amix=inputs=${n}:normalize=0[dry]`,
    `${ORDER.map((_, i) => `[s${i}]`).join("")}amix=inputs=${n}:normalize=0[bus]`,
    `[bus][${n}:a]afir=gtype=none:irfmt=input[wet]`,
    `[dry][wet]amix=inputs=2:normalize=0,volume=${master.toFixed(5)}[out]`,
  ].join(";");
  ffmpeg([...inputs, "-i", ir, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", "-ar", String(RATE), out]);
  return out;
}

const db = (x) => 10 ** (x / 20);

/**
 * How loud each instrument is next to the clarinet playing the tune (dB): the trumpet's bridge and
 * the piano's solo a little under it, the bass well under, the brushes and the guitar further.
 * Each is measured where it matters (seconds into the second time round).
 */
const BALANCE = {
  clarinet: { db: 0, bars: [0, 16] },
  trumpet: { db: -1, bars: [16, 24] },
  piano: { db: -1.5, bars: [32, 48] },
  bass: { db: -6, bars: [0, 64] },
  drums: { db: -11, bars: [0, 64] },
  guitar: { db: -13, bars: [0, 64] },
};

// ---------- the pieces ----------

const BAR_S = 4 * BEAT_S;

async function makeTheme(sf, ir) {
  const t = theme();
  const loopS = t.beats * BEAT_S;
  // Twice round, and the first eight bars a third time (enough to check where the loop joins).
  const REPEAT = 2;
  const EXTRA = 8 * 4;
  const stems = {};
  for (const stem of ORDER) {
    const once = perform(stem, t.parts[stem]);
    const notes = [];
    for (let k = 0; k <= REPEAT; k++)
      for (const n of once) {
        const at = n.at + k * t.beats;
        if (k < REPEAT || n.at < EXTRA) notes.push({ ...n, at });
      }
    stems[stem] = play(sf, stem, notes, "theme");
  }
  // The balance, from each instrument's level where it plays.
  const ref = loudness(stems.clarinet, loopS + BALANCE.clarinet.bars[0] * BAR_S, (BALANCE.clarinet.bars[1] - BALANCE.clarinet.bars[0]) * BAR_S).lufs;
  const gains = {};
  for (const stem of ORDER) {
    const b = BALANCE[stem];
    const l = loudness(stems[stem], loopS + b.bars[0] * BAR_S, (b.bars[1] - b.bars[0]) * BAR_S).lufs;
    gains[stem] = db(ref + b.db - l);
    console.log(`  ${stem.padEnd(9)} ${l.toFixed(1)} LUFS where it plays, ${(20 * Math.log10(gains[stem])).toFixed(1)} dB in the mix`);
  }
  const rough = mix(stems, gains, ir, join(WORK, "theme-rough.wav"));
  // Levelled on the second time round (the first starts from silence).
  const got = loudness(rough, loopS, loopS);
  const master = db(TARGET_LUFS - got.lufs);
  const full = mix(stems, gains, ir, join(WORK, "theme-mix.wav"), master);
  const level = loudness(full, loopS, loopS);
  console.log(`  theme: ${level.lufs.toFixed(1)} LUFS, true peak ${level.peak.toFixed(1)} dBTP`);
  if (level.peak > PEAK_MAX) throw new Error(`the theme peaks at ${level.peak} dBTP (over ${PEAK_MAX})`);

  // Where the loop joins: the second time round and the third should be the same music.
  const { ch } = readWav(full);
  const L = Math.round(loopS * RATE);
  const span = Math.round(12 * RATE);
  let diff = 0;
  let sig = 0;
  for (const c of ch)
    for (let i = 0; i < span; i++) {
      const a = c[L + i];
      const b = c[2 * L + i];
      diff += (a - b) ** 2;
      sig += a * a;
    }
  const seam = 10 * Math.log10(diff / sig);
  console.log(`  the loop's join: the two times round differ by ${seam.toFixed(1)} dB (under the music)`);
  if (!(seam < -50)) throw new Error("the theme doesn't go round evenly: the second and third times differ");

  // The file: a second either side of one time round.
  const PAD = 1;
  const cut = (name, extra) =>
    ffmpeg(["-ss", String(loopS - PAD), "-t", String(loopS + 2 * PAD), "-i", full, ...extra, "-ar", String(RATE), join(OUT, name)]);
  cut("theme.mp3", ["-c:a", "libmp3lame", "-b:a", "112k"]);
  cut("theme-mono.mp3", ["-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"]);
  return { loopStart: PAD, loopEnd: PAD + loopS, length: loopS + 2 * PAD, level };
}

async function makeFinale(sf, ir) {
  const f = finale();
  const stems = {};
  for (const stem of ORDER) stems[stem] = play(sf, stem, perform(stem, f.parts[stem], { seed: `finale:${stem}` }), "finale");
  const gains = {};
  const ref = loudness(stems.clarinet).lufs;
  for (const stem of ORDER) {
    const l = loudness(stems[stem]).lufs;
    gains[stem] = db(ref + BALANCE[stem].db + (stem === "piano" ? -2 : 0) - l);
  }
  const rough = mix(stems, gains, ir, join(WORK, "finale-rough.wav"));
  const master = db(FINALE_LUFS - loudness(rough).lufs);
  const full = mix(stems, gains, ir, join(WORK, "finale-mix.wav"), master);
  const len = f.beats * BEAT_S;
  ffmpeg(["-t", String(len), "-i", full, "-af", `afade=t=out:st=${(len - 1.2).toFixed(2)}:d=1.2`, "-c:a", "libmp3lame", "-b:a", "112k", "-ar", String(RATE), join(OUT, "finale.mp3")]);
  const level = loudness(join(OUT, "finale.mp3"));
  console.log(`  finale: ${level.lufs.toFixed(1)} LUFS, true peak ${level.peak.toFixed(1)} dBTP, ${len.toFixed(1)} s`);
  if (level.peak > PEAK_MAX) throw new Error(`the finale peaks at ${level.peak} dBTP`);
  return { length: len };
}

const sf = await soundfont();
const ir = join(WORK, "room.wav");
room(ir);
console.log("theme");
const th = await makeTheme(sf, ir);
console.log("finale");
const fi = await makeFinale(sf, ir);
const meta = {
  // (made by scripts/music.mjs; the player reads it)
  bpm: BPM,
  theme: { stereo: "theme.mp3", mono: "theme-mono.mp3", loopStart: th.loopStart, loopEnd: Number(th.loopEnd.toFixed(6)), length: Number(th.length.toFixed(6)) },
  finale: { file: "finale.mp3", length: Number(fi.length.toFixed(6)) },
};
writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
for (const f of ["theme.mp3", "theme-mono.mp3", "finale.mp3"]) console.log(`  ${f}: ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`);
