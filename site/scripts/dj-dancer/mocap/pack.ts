/**
 * Her dance loops (loop.ts's files) packed one file a dance for the page, gzipped:
 * `/models/dancer/dance/<id>.bin.gz`. Inside: the length of a JSON header (4 bytes), the header
 * ({ id, fps, frames, beats, beat, bpm, energy, bones }), padding to 4 bytes, then each frame's bone
 * turns (four 16-bit numbers a bone, the bones in the header's order) and the hips' place over where
 * they stand (three 16-bit numbers, millimetres). The bones that bend nothing (the toes, the
 * knuckles: her model's hands and boots don't bend there) are left out.
 *
 * usage (from site/): npx tsx scripts/dj-dancer/mocap/pack.ts <loops dir> <out dir> <loop>=<id> …
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const SKIP = new Set(["LeftToeBase", "RightToeBase", "LeftHandMiddle1", "RightHandMiddle1"]);
const [inDir, outDir, ...pairs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
for (const pair of pairs) {
  const [name, id] = pair.split("=");
  const h = JSON.parse(readFileSync(join(inDir, `${name}.json`), "utf8")) as { fps: number; frames: number; beats: number; beat: number; bpm: number; energy: number; bones: string[] };
  const qb = readFileSync(join(inDir, `${name}.q.bin`));
  const hb = readFileSync(join(inDir, `${name}.hips.bin`));
  const q = new Int16Array(qb.buffer.slice(qb.byteOffset, qb.byteOffset + qb.byteLength));
  const hips = new Int16Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength));
  const keep = h.bones.map((b, i) => [b, i] as const).filter(([b]) => !SKIP.has(b));
  const B = h.bones.length;
  const out = new Int16Array(h.frames * keep.length * 4);
  for (let f = 0; f < h.frames; f++)
    keep.forEach(([, i], k) => {
      for (let c = 0; c < 4; c++) out[(f * keep.length + k) * 4 + c] = q[(f * B + i) * 4 + c];
    });
  const head = { id, fps: h.fps, frames: h.frames, beats: h.beats, beat: h.beat, bpm: h.bpm, energy: h.energy, bones: keep.map(([b]) => b) };
  const json = new TextEncoder().encode(JSON.stringify(head));
  const pad = (4 - ((4 + json.length) % 4)) % 4;
  const file = new Uint8Array(4 + json.length + pad + out.byteLength + hips.byteLength);
  new DataView(file.buffer).setUint32(0, json.length, true);
  file.set(json, 4);
  file.fill(0x20, 4 + json.length, 4 + json.length + pad);
  file.set(new Uint8Array(out.buffer), 4 + json.length + pad);
  file.set(new Uint8Array(hips.buffer), 4 + json.length + pad + out.byteLength);
  const gz = gzipSync(file, { level: 9 });
  writeFileSync(join(outDir, `${id}.bin.gz`), gz);
  console.log(id.padEnd(12), `${h.beats} beats`, `${h.bpm} bpm`, `${(gz.length / 1024).toFixed(0)} KB`);
}
