// Builds site/public/models/figure.glb.gz, the 3D figure's prototype (README.md):
//   node build.mjs <Ready Player Me animation-library folder> [--out <file.glb>]
// (--out writes a plain .glb, to look at; the page loads the gzipped one, a third of the size.)
// 1. Ready Player Me's masculine sample avatar (Masculine_TPose.glb), its shirt's logo painted out;
// 2. 17 clips from their library moved onto its bones (licensed with their avatars only);
// 3. the moves written here (moves.mjs, solved by rig.mjs) and the props' anchors (bake.mjs);
// 4. shrunk: keyframes thinned, textures to 512 px WebP, vertices quantized, meshopt.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addAnchors, addMoves, rigOf } from "./bake.mjs";
import { MOVES } from "./moves.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const lib = args.find((a) => !a.startsWith("--"));
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : join(here, "../../public/models/figure.glb.gz");
if (!lib) {
  console.error("usage: node build.mjs <animation-library folder> [--out file]  (README.md)");
  process.exit(1);
}

/**
 * The library's clips we keep, by the names the page knows (site/src/account/figure/moves.ts).
 * half: slow clips keep every other keyframe (15 a second); inplace: walk and run stay put.
 */
const CLIPS = {
  stand: "idle/M_Standing_Idle_001.glb",
  "half:wave": "expression/M_Standing_Expressions_001.glb",
  "half:salute": "expression/M_Standing_Expressions_002.glb",
  "half:clap": "expression/M_Standing_Expressions_009.glb",
  "half:thumbs": "expression/M_Standing_Expressions_012.glb",
  "half:cheer": "expression/M_Standing_Expressions_010.glb",
  "half:bow": "expression/M_Standing_Expressions_007.glb",
  "half:shrug": "expression/M_Standing_Expressions_015.glb",
  "half:think": "expression/M_Standing_Expressions_011.glb",
  "half:lookout": "expression/M_Standing_Expressions_008.glb",
  "half:flex": "expression/M_Standing_Expressions_018.glb",
  "half:stretch": "idle/M_Standing_Idle_Variations_006.glb",
  "half:watch": "idle/M_Standing_Idle_Variations_005.glb",
  dance: "dance/M_Dances_004.glb",
  party: "dance/M_Dances_005.glb",
  "inplace:walk": "locomotion/M_Walk_001.glb",
  "inplace:run": "locomotion/M_Run_001.glb",
};

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(join(lib, "masculine/glb/Masculine_TPose.glb"));
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
root.listAnimations().forEach((a) => a.dispose());

// 1. the shirt's logo (the material's own colour texture; the file carries a second, unused one)
{
  const tex = root.listMaterials()[0].getBaseColorTexture();
  const tmp = mkdtempSync(join(tmpdir(), "figure-"));
  writeFileSync(join(tmp, "in.png"), tex.getImage());
  const r = spawnSync("python3", [join(here, "clean_texture.py"), join(tmp, "in.png"), join(tmp, "out.png")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("clean_texture.py failed (pip install opencv-python-headless pillow numpy)");
  tex.setImage(new Uint8Array(readFileSync(join(tmp, "out.png")))).setMimeType("image/png");
}

// 2. the library's clips, by bone name
for (const [spec, file] of Object.entries(CLIPS)) {
  let name = spec;
  const inplace = name.startsWith("inplace:");
  if (inplace) name = name.slice(8);
  const half = name.startsWith("half:");
  if (half) name = name.slice(5);
  const src = await io.read(join(lib, "masculine/glb", file));
  const anim = src.getRoot().listAnimations()[0];
  if (!anim) throw new Error(`no animation in ${file}`);
  const dst = doc.createAnimation(name);
  const cache = new Map();
  const copy = (acc) => {
    if (cache.has(acc)) return cache.get(acc);
    let arr = acc.getArray().slice();
    const n = acc.getElementSize();
    if (half && acc.getCount() > 4) {
      const count = acc.getCount();
      const keep = [];
      for (let i = 0; i < count; i += 2) keep.push(i);
      if (keep[keep.length - 1] !== count - 1) keep.push(count - 1);
      const next = new arr.constructor(keep.length * n);
      keep.forEach((i, k) => next.set(arr.subarray(i * n, i * n + n), k * n));
      arr = next;
    }
    const a = doc.createAccessor(acc.getName()).setType(acc.getType()).setArray(arr).setBuffer(buffer);
    cache.set(acc, a);
    return a;
  };
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode() && byName.get(ch.getTargetNode().getName());
    if (!node) continue;
    const s = ch.getSampler();
    if (inplace && ch.getTargetPath() === "translation" && node.getName() === "Hips") {
      const arr = s.getOutput().getArray();
      for (let i = 3; i < arr.length; i += 3) {
        arr[i] = arr[0];
        arr[i + 2] = arr[2];
      }
    }
    const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
    dst.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}

// 3. our own moves and the props' anchors
const rig = rigOf(doc);
addAnchors(doc, rig);
addMoves(doc, rig, MOVES);

// 4. smaller
await doc.transform(
  dedup(),
  resample({ tolerance: 1e-3 }),
  prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetSize: [512, 512], quality: 80, targetFormat: "webp" }),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
const glb = Buffer.from(await io.writeBinary(doc));
// gzip's header carries no time from Node, so the same input gives the same file
const bytes = out.endsWith(".gz") ? gzipSync(glb, { level: 9 }) : glb;
writeFileSync(out, bytes);
const clips = root.listAnimations().map((a) => a.getName());
console.log(`${out}: ${(bytes.length / 1024).toFixed(0)} KB (${(glb.length / 1024).toFixed(0)} KB unzipped), ${clips.length} clips: ${clips.join(" ")}`);
