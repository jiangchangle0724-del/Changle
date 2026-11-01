import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const art = new URL("../src/client/art/", import.meta.url);
const assets = [
  "seawall-dressing.glb",
  "transit-dressing.glb",
  "courtyard-dressing.glb"
];

test("original Blender arena assets are valid, bounded GLB 2.0 files", async () => {
  for (const filename of assets) {
    const path = fileURLToPath(new URL(filename, art));
    const data = await readFile(path);
    assert.equal(data.toString("ascii", 0, 4), "glTF", `${filename} magic`);
    assert.equal(data.readUInt32LE(4), 2, `${filename} version`);
    assert.equal(data.readUInt32LE(8), data.byteLength, `${filename} declared length`);
    assert.ok(data.byteLength < 1_500_000, `${filename} stays within the mobile download budget`);

    const jsonLength = data.readUInt32LE(12);
    assert.equal(data.toString("ascii", 16, 20), "JSON", `${filename} JSON chunk`);
    const gltf = JSON.parse(data.toString("utf8", 20, 20 + jsonLength)) as {
      asset?: { version?: string };
      meshes?: unknown[];
      materials?: unknown[];
      nodes?: unknown[];
      scenes?: unknown[];
      extensionsRequired?: string[];
    };
    assert.equal(gltf.asset?.version, "2.0", `${filename} asset version`);
    assert.ok((gltf.meshes?.length ?? 0) >= 8, `${filename} contains authored mesh groups`);
    assert.ok((gltf.materials?.length ?? 0) >= 5, `${filename} contains authored materials`);
    assert.ok((gltf.nodes?.length ?? 0) >= 8, `${filename} contains scene nodes`);
    assert.ok((gltf.scenes?.length ?? 0) >= 1, `${filename} contains a scene`);
    assert.ok(gltf.extensionsRequired?.includes("EXT_meshopt_compression"), `${filename} uses mobile-friendly mesh compression`);
  }
});

