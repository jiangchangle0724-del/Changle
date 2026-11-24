// The real dancer's file: the simplified model, skinned to her Mixamo-named skeleton (rest turns none,
// like MPFB2's), the baked texture as WebP, compressed with meshopt and gzipped. With springs.json
// (springs.py) next to the mesh: her hair's and skirt's bones too, and in the scene's extras what the
// page swings and keeps off her (dancer/springs.ts). With face_w.f32 next to the texture
// (facekit.py): how much each of her vertices is her face (`_FACE`, 0 to 1: the page lights it as its
// photo was lit).
// usage: node build_glb.mjs <mesh dir> <joints.json> <texture.png> <out .glb.gz> [--plain out.glb]
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
const [dir, jfile, texfile, out, ...rest] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const raw = (n, T) => { const b = readFileSync(join(dir, n)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = raw('pos.f32', Float32Array), N = raw('nrm_s.f32', Float32Array), UV = raw('uv.f32', Float32Array);
const I = raw('idx.u32', Uint32Array), J4 = raw('j4.u8', Uint8Array), W4 = raw('w4.f32', Float32Array);
const skel = JSON.parse(readFileSync(join(dir, 'skeleton.json'), 'utf8'));
const J = JSON.parse(readFileSync(jfile, 'utf8')).joints;
const PAR = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
for (const s of ['Left', 'Right']) Object.assign(PAR, { [s + 'Shoulder']: 'Spine2', [s + 'Arm']: s + 'Shoulder', [s + 'ForeArm']: s + 'Arm', [s + 'Hand']: s + 'ForeArm', [s + 'HandMiddle1']: s + 'Hand', [s + 'UpLeg']: 'Hips', [s + 'Leg']: s + 'UpLeg', [s + 'Foot']: s + 'Leg', [s + 'ToeBase']: s + 'Foot' });
// the hair's and skirt's bones (springs.py): where each starts, its parent, and where its tip is
const SP = existsSync(join(dir, 'springs.json')) ? JSON.parse(readFileSync(join(dir, 'springs.json'), 'utf8')) : null;
const TAIL = {};
for (const b of SP?.bones ?? []) { PAR[b.name] = b.parent; J[b.name] = b.head; TAIL[b.name] = b.tail; }
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
const faceFile = join(dirname(texfile), 'face_w.f32');
if (existsSync(faceFile)) {
  const b = readFileSync(faceFile);
  const F = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  if (F.length !== P.length / 3) throw new Error(`face_w.f32 has ${F.length} vertices, the mesh ${P.length / 3}`);
  prim.setAttribute('_FACE', acc('SCALAR', F.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100)));
}
// (its alpha, from eyes.py: where her eyes are, for the page's blink; lossless, so the marks stay)
const webp = await sharp(texfile).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
const lidFile = join(dirname(texfile), 'lid.json');
const lid = existsSync(lidFile) ? JSON.parse(readFileSync(lidFile, 'utf8')).lid : null;
const tex = doc.createTexture('her').setImage(webp).setMimeType('image/webp');
const mat = doc.createMaterial('Her').setBaseColorTexture(tex).setRoughnessFactor(0.62).setMetallicFactor(0);
prim.setMaterial(mat);
const mesh = doc.createMesh('Body').addPrimitive(prim);
// her expressions (expressions.py; Nov 21, Steve: "表情可以做但要很细致"): a few millimetres' change of her
// face each, as morph targets the page weighs (morphs.json next to the mesh: their names and files)
const morphFile = join(dir, 'morphs.json');
if (existsSync(morphFile)) {
  const M = JSON.parse(readFileSync(morphFile, 'utf8'));
  for (const [k, name] of M.names.entries()) {
    const D = raw(M.files[k], Float32Array);
    if (D.length !== P.length) throw new Error(`${M.files[k]} has ${D.length / 3} vertices, the mesh ${P.length / 3}`);
    prim.addTarget(doc.createPrimitiveTarget(name).setAttribute('POSITION', acc('VEC3', D)));
  }
  mesh.setWeights(M.names.map(() => 0)).setExtras({ targetNames: M.names });
}
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
// for the page's springs: each swinging bone's tip from where it starts, and the round shapes on her
// bones it's kept off (from the bone's own place; every bone's rest turn is none)
const off = (bone, p) => [p[0] - J[bone][0], p[1] - J[bone][1], p[2] - J[bone][2]].map((v) => Math.round(v * 1e4) / 1e4);
const springs = SP && {
  groups: SP.groups.map((g) => ({ ...g, bones: g.bones.map((n) => ({ name: n, tail: off(n, TAIL[n]), k: SP.bones.find((b) => b.name === n)?.k ?? 1 })) })),
  colliders: Object.fromEntries(Object.entries(SP.colliders).map(([k, c]) => [k, { bone: c.bone, a: off(c.bone, c.a), ...(c.b ? { b: off(c.bone, c.b) } : {}), r: Math.round(c.r * 1e4) / 1e4 }])),
};
const height = Math.round(Math.max(...Array.from({ length: P.length / 3 }, (_, i) => P[i * 3 + 1])) * 100) / 100;
scene.setExtras({ dancer: { height, eyes: at('Head')[1] + 0.07, ...(springs ? { springs } : {}), ...(lid ? { lid } : {}), made: 'TRELLIS.2 model of the design, photos baked on, skinned by distance through her (site/scripts/dj-dancer/real)' } });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const plainIdx = rest.indexOf('--plain');
if (plainIdx >= 0) writeFileSync(rest[plainIdx + 1], await io.writeBinary(doc));
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const glb = await io.writeBinary(doc);
const gz = gzipSync(glb, { level: 9 });
writeFileSync(out, gz);
console.log(JSON.stringify({ glb: glb.length, gz: gz.length, webp: webp.length, verts: P.length / 3, tris: I.length / 3, bones: skel.length }));
