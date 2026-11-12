// The art: valid files, small enough for a phone, and every file credited (src/client/ui/Credits.tsx
// and DESIGN.md say where each comes from).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const art = new URL("../src/client/art/", import.meta.url);
const dir = fileURLToPath(art);
const sizes: Record<string, number> = Object.fromEntries(readdirSync(dir).map((name) => [name, statSync(dir + name).size]));
const credits = readFileSync(new URL("../src/client/ui/Credits.tsx", import.meta.url), "utf8");
const design = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");

test("original Blender arena models are valid, bounded GLB 2.0 files", () => {
  for (const filename of ["seawall-dressing.glb", "transit-dressing.glb", "courtyard-dressing.glb"]) {
    const data = readFileSync(dir + filename);
    assert.equal(data.toString("ascii", 0, 4), "glTF", `${filename} magic`);
    assert.equal(data.readUInt32LE(4), 2, `${filename} version`);
    assert.equal(data.readUInt32LE(8), data.byteLength, `${filename} declared length`);
    assert.ok(data.byteLength < 450_000, `${filename} stays within the phone budget`);
    const jsonLength = data.readUInt32LE(12);
    assert.equal(data.toString("ascii", 16, 20), "JSON", `${filename} JSON chunk`);
    const gltf = JSON.parse(data.toString("utf8", 20, 20 + jsonLength)) as { asset?: { version?: string }; meshes?: unknown[]; materials?: unknown[]; extensionsRequired?: string[]; images?: unknown[] };
    assert.equal(gltf.asset?.version, "2.0");
    assert.ok((gltf.meshes?.length ?? 0) >= 8, `${filename} contains authored mesh groups`);
    assert.ok((gltf.materials?.length ?? 0) >= 5, `${filename} contains authored materials`);
    assert.equal(gltf.images, undefined, `${filename} carries no pictures from elsewhere`);
    assert.ok(gltf.extensionsRequired?.includes("EXT_meshopt_compression"), `${filename} uses mesh compression`);
  }
});

test("the people are slim, rigged GLB 2.0 files with nothing from outside", () => {
  const read = (filename: string) => {
    const data = readFileSync(dir + filename);
    assert.equal(data.toString("ascii", 0, 4), "glTF", `${filename} magic`);
    assert.equal(data.readUInt32LE(4), 2, `${filename} version`);
    assert.equal(data.readUInt32LE(8), data.byteLength, `${filename} declared length`);
    const jsonLength = data.readUInt32LE(12);
    return JSON.parse(data.toString("utf8", 20, 20 + jsonLength)) as { skins?: unknown[]; animations?: { name: string }[]; materials?: unknown[]; images?: unknown[]; extensionsRequired?: string[] };
  };
  const man = read("crowd-people.glb");
  const woman = read("crowd-people-f.glb");
  for (const gltf of [man, woman]) {
    assert.equal(gltf.skins?.length, 1, "one skeleton");
    assert.equal(gltf.images, undefined, "no pictures: the game paints the clothes");
    assert.equal(gltf.materials, undefined, "no materials: the game paints the clothes");
    assert.ok(gltf.extensionsRequired?.includes("KHR_mesh_quantization"), "small numbers");
  }
  assert.equal(man.animations?.length, 10, "the man's file carries the clips");
  assert.equal(woman.animations, undefined, "the woman moves with the man's clips");
});

test("pictures are WebP and within their budgets", () => {
  const budget = (name: string) => (name === "crowd-people.glb" ? 200_000 : name === "crowd-people-f.glb" ? 110_000 : name.startsWith("thumb-") ? 24_000 : name.endsWith(".webp") ? 240_000 : 450_000);
  for (const [name, size] of Object.entries(sizes)) {
    assert.ok(/\.(webp|glb)$/.test(name), `${name}: art ships as WebP or GLB`);
    assert.ok(size <= budget(name), `${name} is ${size} bytes`);
    if (name.endsWith(".webp")) {
      const head = readFileSync(dir + name).subarray(0, 12);
      assert.equal(head.toString("ascii", 0, 4) + head.toString("ascii", 8, 12), "RIFFWEBP", `${name} is a WebP`);
    }
  }
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  assert.ok(total < 2_000_000, `all the art is ${total} bytes`);
});

test("every art file is credited on the credits page and in DESIGN.md", () => {
  for (const name of Object.keys(sizes)) {
    const listed = name.startsWith("thumb-") ? "thumb-*.webp" : name;
    assert.ok(credits.includes(listed), `${name} is on the credits page`);
    assert.ok(design.includes(listed), `${name} is in DESIGN.md`);
  }
});
