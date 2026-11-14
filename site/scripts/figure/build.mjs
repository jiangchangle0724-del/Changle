// Builds the 3D figure's files (README.md):
//   node build.mjs <MPFB2 data folder> <MakeHuman system assets folder> [--only male|female] [--plain <folder>]
// writes site/public/models/figure/male.glb.gz and female.glb.gz (the figure: body, clothes, face,
// its first hairstyle) and hair/<style>-<sex>.glb.gz (each other hairstyle on its own, loaded when
// picked). --plain also writes them unzipped there, to look at. No moves in them: the page solves
// those for the body on screen (site/src/account/figure/pose/).
// 1. MakeHuman's human shaped and dressed, with the face sliders and expressions (human.mjs);
// 2. shrunk: textures to WebP (the skin 1024 px, most 512, the small ones 256), vertices
//    quantized, meshopt; then gzip (Cloudflare doesn't compress .glb).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HAIRS, SEXES, docOf, prepareHuman } from "./human.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const only = opt("--only");
const plain = opt("--plain");
const [mpfb, assets] = args;
if (!mpfb || !assets) {
  console.error("usage: node build.mjs <MPFB2 src/mpfb/data> <MakeHuman system assets> [--only male|female] [--plain folder]  (README.md)");
  process.exit(1);
}
const out = join(here, "../../public/models/figure");

/** each figure's first hairstyle (the one in its own file) */
export const FIRST_HAIR = { male: "short02", female: "long01" };
const BASE_PARTS = ["Body", "Eyes", "Eyebrows", "Eyelashes", "Clothes", "Shoes"];

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

async function write(doc, rel) {
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, pattern: /^skin$/, resize: [1024, 1024], quality: 82, targetFormat: "webp" }),
    textureCompress({ encoder: sharp, pattern: /^(clothes|shoes|hair_\w+)$/, resize: [512, 512], quality: 80, targetFormat: "webp" }),
    textureCompress({ encoder: sharp, pattern: /^(eyes|eyebrows|eyelashes)$/, resize: [256, 256], quality: 82, targetFormat: "webp" }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
  const glb = Buffer.from(await io.writeBinary(doc));
  const file = join(out, `${rel}.glb.gz`);
  mkdirSync(dirname(file), { recursive: true });
  // gzip's header carries no time from Node, so the same input gives the same file
  const gz = gzipSync(glb, { level: 9 });
  writeFileSync(file, gz);
  if (plain) {
    mkdirSync(dirname(join(plain, rel)), { recursive: true });
    writeFileSync(join(plain, `${rel}.glb`), glb);
  }
  return gz.length;
}

const quiet = console.warn;
console.warn = (m, ...rest) => (/Skipping _WELD/.test(String(m)) ? null : quiet(m, ...rest));

for (const sex of Object.keys(SEXES)) {
  if (only && only !== sex) continue;
  const t0 = Date.now();
  const prep = await prepareHuman({ mpfb, assets, sex });
  // the figure, with its first hair
  const doc = docOf(prep, [...BASE_PARTS, `Hair_${FIRST_HAIR[sex]}`]);
  const scene = doc.getRoot().getDefaultScene();
  scene.setExtras({ ...scene.getExtras(), figure: { sex, hair: FIRST_HAIR[sex], hairs: HAIRS } });
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  const sizes = [`${sex} ${kb(await write(doc, sex))}`];
  // the other hairstyles, each on its own
  for (const h of HAIRS) if (h !== FIRST_HAIR[sex]) sizes.push(`${h} ${kb(await write(docOf(prep, [`Hair_${h}`]), `hair/${h}-${sex}`))}`);
  console.log(`${sex} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${prep.info.height} m tall as drawn): ${sizes.join(", ")}`);
}
