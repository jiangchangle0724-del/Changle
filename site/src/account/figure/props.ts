import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { PropId } from "./moves";

/**
 * Things the figure holds or wears, made here from simple shapes (nothing to download). Each hangs
 * on an empty node the model file carries (site/scripts/figure/bake.mjs): Grip_R / Grip_L in the
 * palm (x along the fingers, y toward the thumb's side, so a handle runs along y; for the right
 * hand the palm faces -z) and Head_Anchor at the head (x its left, y up, z forward, as it stood).
 * Sizes in metres, from the stand-in's head and hands.
 */
export const ANCHOR: Record<PropId, "Grip_R" | "Grip_L" | "Head_Anchor"> = {
  sword: "Grip_R",
  phone: "Grip_R",
  beer: "Grip_R",
  shades: "Head_Anchor",
  headphones: "Head_Anchor",
};

const std = (color: number, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function sword(): THREE.Object3D {
  const g = new THREE.Group();
  // the blade: gently curved, edge on +x, from the guard to the tip
  const s = new THREE.Shape();
  s.moveTo(-0.013, 0);
  s.lineTo(0.015, 0);
  s.quadraticCurveTo(0.024, 0.42, 0.006, 0.7);
  s.lineTo(-0.006, 0.76);
  s.quadraticCurveTo(0.004, 0.4, -0.013, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 10 }), std(0xf2f5fa, 0.3, 0.2));
  blade.position.set(0, 0.066, -0.002);
  g.add(blade);
  // the guard, a flat oval
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 20), std(0x2b2430, 0.4, 0.5));
  guard.scale.set(1, 1, 0.8);
  guard.position.y = 0.06;
  g.add(guard);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), std(0xc9a14a, 0.35, 0.6));
  collar.position.y = 0.05;
  g.add(collar);
  // the hilt, long enough for two hands, and a cap
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0145, 0.26, 12), std(0x5a1f2c, 0.85));
  hilt.position.y = -0.085;
  g.add(hilt);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.014, 12), std(0xc9a14a, 0.35, 0.6));
  cap.position.y = -0.22;
  g.add(cap);
  return g;
}

function phone(): THREE.Object3D {
  const g = new THREE.Group();
  // in a rose case, so it reads against the dark shirt
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.074, 0.152, 0.0085, 3, 0.008), std(0xff9cc5, 0.45, 0.05));
  g.add(body);
  // the screen faces the palm (-z): toward the face, in a selfie
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.142), new THREE.MeshBasicMaterial({ color: 0xa8d8ff }));
  screen.position.z = -0.0045;
  screen.rotation.y = Math.PI;
  g.add(screen);
  // the cameras on the back, which is what you see
  const bump = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.03, 0.004, 2, 0.006), std(0x2a3042, 0.3, 0.4));
  bump.position.set(-0.017, 0.054, 0.0055);
  g.add(bump);
  for (const [x, y] of [[-0.024, 0.061], [-0.01, 0.061], [-0.024, 0.047]] as const) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 12), std(0x07080c, 0.15, 0.6));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, y, 0.008);
    g.add(lens);
  }
  // in the hand: mostly above the grip, its back against the fingers
  g.position.set(0.004, 0.035, -0.004);
  const out = new THREE.Group();
  out.add(g);
  return out;
}

function beer(): THREE.Object3D {
  const g = new THREE.Group();
  const beerM = new THREE.MeshStandardMaterial({ color: 0xf2a91f, roughness: 0.18, transparent: true, opacity: 0.88 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.13, 20), beerM);
  g.add(body);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.026, 20), std(0xfff7e6, 0.9));
  foam.position.y = 0.078;
  g.add(foam);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.037, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xfff7e6, 0.9));
  top.scale.y = 0.35;
  top.position.y = 0.091;
  g.add(top);
  // the glass around it
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.033, 0.17, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.015;
  g.add(glass);
  // held around its middle: further out from the palm than a handle
  g.position.set(0.006, 0.02, -0.022);
  const out = new THREE.Group();
  out.add(g);
  return out;
}

function shades(): THREE.Object3D {
  const g = new THREE.Group();
  const lensM = new THREE.MeshStandardMaterial({ color: 0x0c0d14, roughness: 0.12, metalness: 0.5 });
  const frameM = std(0x111118, 0.4, 0.3);
  const lensShape = new THREE.Shape();
  const w = 0.026;
  const h = 0.019;
  lensShape.moveTo(-w, h * 0.7);
  lensShape.quadraticCurveTo(-w, h, -w * 0.6, h);
  lensShape.lineTo(w * 0.7, h);
  lensShape.quadraticCurveTo(w, h, w, h * 0.5);
  lensShape.quadraticCurveTo(w * 0.9, -h, 0, -h);
  lensShape.quadraticCurveTo(-w * 0.95, -h, -w, h * 0.7);
  for (const side of [1, -1]) {
    const lens = new THREE.Mesh(new THREE.ExtrudeGeometry(lensShape, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 8 }), lensM);
    lens.scale.x = side;
    lens.position.set(side * 0.033, 0.088, 0.128);
    lens.rotation.y = side * 0.14;
    g.add(lens);
    // the arm back to the ear
    const from = new THREE.Vector3(side * 0.058, 0.096, 0.122);
    const to = new THREE.Vector3(side * 0.091, 0.086, 0.004);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.005, from.distanceTo(to)), frameM);
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.lookAt(to);
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), frameM);
  bridge.position.set(0, 0.101, 0.133);
  g.add(bridge);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.005, 0.005), frameM);
  brow.position.set(0, 0.106, 0.13);
  g.add(brow);
  return g;
}

function headphones(): THREE.Object3D {
  const g = new THREE.Group();
  const dark = std(0x17141f, 0.45, 0.2);
  const accent = std(0xff4fa0, 0.4, 0.1);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 36, Math.PI), dark);
  band.scale.set(1.02, 1.26, 1.4);
  band.position.set(0, 0.086, -0.008);
  g.add(band);
  for (const side of [1, -1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 24), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 0.1, 0.078, -0.004);
    g.add(cup);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 24), accent);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 0.116, 0.078, -0.004);
    g.add(ring);
  }
  return g;
}

const MAKE: Record<PropId, () => THREE.Object3D> = { sword, phone, beer, shades, headphones };

export function makeProp(id: PropId): THREE.Object3D {
  const o = MAKE[id]();
  o.name = `prop:${id}`;
  o.traverse((c) => {
    c.frustumCulled = false;
  });
  return o;
}

export function disposeProp(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    }
  });
}
