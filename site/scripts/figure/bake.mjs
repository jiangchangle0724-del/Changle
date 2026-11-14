// The written moves onto a model: the skeleton read as a Rig, the props' anchors added, each move
// solved frame by frame into a glTF animation. build.mjs uses it; on its own, onto a plain .glb
// (build.mjs --out x.glb makes one):  node bake.mjs <in.glb> <out.glb> [move names…]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { Rig } from "./rig.mjs";
import { bake } from "./anim.mjs";
import { MOVES, BASE } from "./moves.mjs";

export function rigOf(doc) {
  const skin = doc.getRoot().listSkins()[0];
  const set = new Set(skin.listJoints());
  const nodes = [];
  const walk = (n, parent) => {
    if (set.has(n)) {
      nodes.push({ name: n.getName(), parent: parent?.getName() ?? null, t: n.getTranslation(), r: n.getRotation() });
      n.listChildren().forEach((c) => walk(c, n));
    } else n.listChildren().forEach((c) => walk(c, parent));
  };
  doc.getRoot().listScenes()[0].listChildren().forEach((c) => walk(c, null));
  return new Rig(nodes);
}

/** Empty nodes for props to hang on: Grip_R and Grip_L in each palm (x along the fingers, y toward the thumb's side), Head_Anchor at the head (the character's own axes). */
export function addAnchors(doc, rig) {
  const root = doc.getRoot();
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const make = (name, bone, pos, quat) => {
    byName.get(name)?.dispose();
    const b = rig.bones.get(bone);
    const inv = b.Wr.clone().invert();
    const t = pos.clone().sub(b.Pr).applyQuaternion(inv);
    const r = inv.clone().multiply(quat).normalize();
    const node = doc.createNode(name).setTranslation(t.toArray()).setRotation(r.toArray());
    byName.get(bone).addChild(node);
  };
  for (const side of ["Left", "Right"]) {
    const h = rig.hand[side];
    const hand = rig.bones.get(`${side}Hand`);
    const x = h.fingers.clone();
    const y = h.thumbSide.clone();
    const z = x.clone().cross(y);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    make(`Grip_${side[0]}`, `${side}Hand`, hand.Pr.clone().add(h.grip), q);
  }
  make("Head_Anchor", "Head", rig.bones.get("Head").Pr.clone(), new THREE.Quaternion());
}

export function addMoves(doc, rig, moves) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const m of moves) {
    const old = root.listAnimations().find((a) => a.getName() === m.name);
    old?.dispose();
    const c = bake(rig, m, BASE);
    const anim = doc.createAnimation(m.name);
    const input = doc.createAccessor().setType("SCALAR").setArray(c.times).setBuffer(buffer);
    for (const [bone, arr] of c.rot) {
      const node = byName.get(bone);
      if (!node) continue;
      const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType("VEC4").setArray(arr).setBuffer(buffer)).setInterpolation("LINEAR");
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(s));
    }
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType("VEC3").setArray(c.hips).setBuffer(buffer)).setInterpolation("LINEAR");
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(byName.get("Hips")).setTargetPath("translation").setSampler(s));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const [inp, out, ...only] = process.argv.slice(2);
  const doc = await io.read(inp);
  const rig = rigOf(doc);
  const moves = MOVES.filter((m) => !only.length || only.includes(m.name));
  const t0 = Date.now();
  addAnchors(doc, rig);
  addMoves(doc, rig, moves);
  await io.write(out, doc);
  console.log(`${out}: ${moves.map((m) => m.name).join(" ")} in ${Date.now() - t0} ms`);
}
