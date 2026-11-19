// The culled model simplified (meshoptimizer: UV seams kept), written back as raw arrays.
// usage: node simplify.mjs <in dir> <out dir> <target triangles>
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [inp, out, target] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await MeshoptSimplifier.ready;
const f32 = (n) => { const b = readFileSync(join(inp, n)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const P = f32('pos.f32'), N = f32('nrm.f32'), UV = f32('uv.f32');
const ib = readFileSync(join(inp, 'idx.u32')); const I = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
const nv = P.length / 3;
// attributes the simplifier also keeps true: the UVs (weighted so a texel's drift counts) and normals
const attr = new Float32Array(nv * 5);
for (let i = 0; i < nv; i++) { attr[i * 5] = UV[i * 2]; attr[i * 5 + 1] = UV[i * 2 + 1]; attr[i * 5 + 2] = N[i * 3]; attr[i * 5 + 3] = N[i * 3 + 1]; attr[i * 5 + 4] = N[i * 3 + 2]; }
const want = Math.floor(Number(target) * 3);
const [idx, err] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, attr, 5, [0.5, 0.5, 0.05, 0.05, 0.05], null, want, 0.02, []);
// compact the vertices used
const used = new Int32Array(nv).fill(-1); let n = 0;
for (const v of idx) if (used[v] < 0) used[v] = n++;
const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3), UV2 = new Float32Array(n * 2);
for (let v = 0; v < nv; v++) { const j = used[v]; if (j < 0) continue; P2.set(P.subarray(v * 3, v * 3 + 3), j * 3); N2.set(N.subarray(v * 3, v * 3 + 3), j * 3); UV2.set(UV.subarray(v * 2, v * 2 + 2), j * 2); }
const I2 = Uint32Array.from(idx, (v) => used[v]);
const w = (name, a) => writeFileSync(join(out, name), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
w('pos.f32', P2); w('nrm.f32', N2); w('uv.f32', UV2); w('idx.u32', I2);
console.log(JSON.stringify({ trisIn: I.length / 3, trisOut: I2.length / 3, verts: n, error: err }));
