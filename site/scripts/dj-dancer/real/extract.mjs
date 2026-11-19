// Dump a GLB's first primitive (positions, normals, uvs, indices) and its textures to raw files.
// usage: node extract.mjs <in.glb> <out dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [inp, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const w = (name, arr) => writeFileSync(join(out, name), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
w('pos.f32', prim.getAttribute('POSITION').getArray());
w('nrm.f32', prim.getAttribute('NORMAL').getArray());
w('uv.f32', prim.getAttribute('TEXCOORD_0').getArray());
w('idx.u32', Uint32Array.from(prim.getIndices().getArray()));
const mat = prim.getMaterial();
const tex = { base: mat.getBaseColorTexture(), mr: mat.getMetallicRoughnessTexture() };
for (const [k, t] of Object.entries(tex)) if (t) writeFileSync(join(out, `${k}.${t.getMimeType().split('/')[1]}`), t.getImage());
console.log(JSON.stringify({ verts: prim.getAttribute('POSITION').getCount(), tris: prim.getIndices().getCount() / 3, tex: Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, t && t.getMimeType()])) }));
