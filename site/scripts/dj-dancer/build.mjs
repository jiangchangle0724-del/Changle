// Builds 跟着跳's dancer (README.md):
//   node build.mjs <MPFB2 data folder> <MakeHuman system assets folder> [--only body,hair,<outfit id>…] [--plain <folder>]
// writes site/public/models/dancer/: body.glb.gz (her body, eyes, brows, lashes, the expressions),
// hair/<style>.glb.gz, outfit/<id>.glb.gz (what one outfit puts on her: its garments, MakeHuman's
// clothes and shoes; which of her skin it covers; its hair and colour). All on one skeleton. The moves
// aren't in them: the page solves those (site/src/party/dj/dancer/). --plain also writes them unzipped.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HAIRS, HEIGHT, docOf, prepareDancer } from "./dancer.mjs";
import { outfitParts } from "./assemble.mjs";
import { landmarks, texels } from "./garments.mjs";
import { OUTFITS } from "./outfits.mjs";
import { bodyPart, facePart, hairPart } from "./parts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const only = opt("--only")?.split(",") ?? null;
const plain = opt("--plain");
const [mpfb, assets] = args;
if (!mpfb || !assets) {
  console.error("usage: node build.mjs <MPFB2 src/mpfb/data> <MakeHuman system assets> [--only body,hair,<outfit>…] [--plain folder]  (README.md)");
  process.exit(1);
}
const out = join(here, "../../public/models/dancer");
const want = (id) => !only || only.includes(id);

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const quiet = console.warn;
console.warn = (m, ...rest) => (/Skipping _WELD/.test(String(m)) ? null : quiet(m, ...rest));

async function write(doc, rel) {
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, pattern: /^skin$/, resize: [1024, 1024], quality: 84, targetFormat: "webp" }),
    textureCompress({ encoder: sharp, pattern: /_orm$/, quality: 80, targetFormat: "webp" }),
    textureCompress({ encoder: sharp, quality: 82, targetFormat: "webp" }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
  const glb = Buffer.from(await io.writeBinary(doc));
  const file = join(out, `${rel}.glb.gz`);
  mkdirSync(dirname(file), { recursive: true });
  const gz = gzipSync(glb, { level: 9 });
  writeFileSync(file, gz);
  if (plain) {
    mkdirSync(dirname(join(plain, rel)), { recursive: true });
    writeFileSync(join(plain, `${rel}.glb`), glb);
  }
  return `${rel} ${(gz.length / 1024).toFixed(0)} KB`;
}

/** base vertex numbers as runs: [from, to] pairs (what the page drops) */
const runs = (list) => {
  const s = [...new Set(list)].sort((a, b) => a - b);
  const r = [];
  for (const v of s) {
    const last = r[r.length - 1];
    if (last && last[1] === v - 1) last[1] = v;
    else r.push([v, v]);
  }
  return r;
};

const t0 = Date.now();
const clothes = [...new Set(OUTFITS.flatMap((o) => [o.shoes, ...(o.clothes ?? []).map((c) => c.file)].filter(Boolean)))];
const prep = prepareDancer({ mpfb, assets, clothes });
const sizes = [];

// her body
if (want("body")) {
  const parts = [await bodyPart(prep), ...(await facePart(prep))];
  sizes.push(await write(docOf(prep, parts, { dancer: { height: HEIGHT, hairs: HAIRS, outfits: OUTFITS.map((o) => o.id) } }), "body"));
}

// her hairstyles, each on its own
if (want("hair")) for (const h of HAIRS) sizes.push(await write(docOf(prep, [await hairPart(prep, h)]), `hair/${h}`));

// the outfits
const todo = OUTFITS.filter((o) => want(o.id));
if (todo.length) {
  const tx = texels(prep, 2048);
  const L = landmarks(prep);
  for (const o of todo) {
    const { parts, hide, lift } = await outfitParts(prep, tx, L, o);
    const extras = { outfit: { id: o.id, zh: o.zh, en: o.en, style: o.style, hair: o.hair[0], hairColor: o.hair[1], lift: +lift.toFixed(4), hide: runs(hide) } };
    sizes.push(await write(docOf(prep, parts, extras), `outfit/${o.id}`));
  }
}
console.log(`dancer (${((Date.now() - t0) / 1000).toFixed(0)} s): ${sizes.join(", ")}`);
