// The real dancer's file: the simplified model, skinned to her Mixamo-named skeleton (rest turns none,
// like MPFB2's), the baked texture as WebP, compressed with meshopt and gzipped.
// usage: node build_glb.mjs <mesh dir> <joints.json> <texture.png> <out .glb.gz> [--plain out.glb]
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const [dir, jfile, texfile, out, ...rest] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const raw = (n, T) => { const b = readFileSync(join(dir, n)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = raw('pos.f32', Float32Array), N = raw('nrm_s.f32', Float32Array), UV = raw('uv.f32', Float32Array);
const I = raw('idx.u32', Uint32Array), J4 = raw('j4.u8', Uint8Array), W4 = raw('w4.f32', Float32Array);
const skel = JSON.parse(readFileSync(join(dir, 'skeleton.json'), 'utf8'));
const J = JSON.parse(readFileSync(jfile, 'utf8')).joints;
const PAR = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
for (const s of ['Left', 'Right']) Object.assign(PAR, { [s + 'Shoulder']: 'Spine2', [s + 'Arm']: s + 'Shoulder', [s + 'ForeArm']: s + 'Arm', [s + 'Hand']: s + 'ForeArm', [s + 'HandMiddle1']: s + 'Hand', [s + 'UpLeg']: 'Hips', [s + 'Leg']: s + 'UpLeg', [s + 'Foot']: s + 'Leg', [s + 'ToeBase']: s + 'Foot' });
// her hips over the origin (x and z), feet on the floor
const shift = [-J.Hips[0], 0, -J.Hips[2]];
for (let i = 0; i < P.length; i += 3) { P[i] += shift[0]; P[i + 2] += shift[2]; }
const at = (b) => [J[b][0] + shift[0], J[b][1], J[b][2] + shift[2]];

const doc = new Document();
doc.createExtension(EXTTextureWebP).setRequired(true);
const buf = doc.createBuffer();
const acc = (type, arr, norm = false) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf).setNormalized(norm);
const prim = doc.createPrimitive()
  .setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', N)).setAttribute('TEXCOORD_0', acc('VEC2', UV))
  .setAttribute('JOINTS_0', acc('VEC4', J4)).setAttribute('WEIGHTS_0', acc('VEC4', W4))
  .setIndices(acc('SCALAR', I));
const webp = await sharp(texfile).webp({ quality: 86, effort: 6 }).toBuffer();
const tex = doc.createTexture('her').setImage(webp).setMimeType('image/webp');
const mat = doc.createMaterial('Her').setBaseColorTexture(tex).setRoughnessFactor(0.62).setMetallicFactor(0);
prim.setMaterial(mat);
const mesh = doc.createMesh('Body').addPrimitive(prim);
const nodes = {};
for (const b of skel) nodes[b] = doc.createNode(b);
for (const b of skel) {
  const p = PAR[b];
  const w = at(b);
  if (p) { const q = at(p); nodes[b].setTranslation([w[0] - q[0], w[1] - q[1], w[2] - q[2]]); nodes[p].addChild(nodes[b]); }
  else nodes[b].setTranslation(w);
}
const ibm = new Float32Array(skel.length * 16);
skel.forEach((b, i) => { const w = at(b); ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16); });
const skin = doc.createSkin('Her').setSkeleton(nodes.Hips).setInverseBindMatrices(acc('MAT4', ibm));
for (const b of skel) skin.addJoint(nodes[b]);
const body = doc.createNode('Body').setMesh(mesh).setSkin(skin);
const root = doc.createNode('Dancer').addChild(nodes.Hips).addChild(body);
const scene = doc.createScene('Dancer').addChild(root);
doc.getRoot().setDefaultScene(scene);
scene.setExtras({ dancer: { height: 1.74, eyes: at('Head')[1] + 0.07, made: 'TRELLIS.2 model of the design, photos baked on, skinned by distance through her (site/scripts/dj-dancer/real)' } });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const plainIdx = rest.indexOf('--plain');
if (plainIdx >= 0) writeFileSync(rest[plainIdx + 1], await io.writeBinary(doc));
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const glb = await io.writeBinary(doc);
const gz = gzipSync(glb, { level: 9 });
writeFileSync(out, gz);
console.log(JSON.stringify({ glb: glb.length, gz: gz.length, webp: webp.length, verts: P.length / 3, tris: I.length / 3, bones: skel.length }));
