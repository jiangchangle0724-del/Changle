import * as THREE from "three";
import type { FxKind } from "./moves";

/** A colour from the design tokens (tokens.css), for drawing on a canvas. */
function token(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** The little pictures, drawn once on a canvas each. */
function draw(kind: FxKind): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.lineJoin = "round";
    if (kind === "z") {
      g.font = "900 104px system-ui, -apple-system, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 14;
      g.strokeStyle = token("--night", "#0e0c22");
      g.strokeText("Z", 64, 70);
      g.fillStyle = token("--moon", "#f5f4fd");
      g.fillText("Z", 64, 70);
    } else if (kind === "heart") {
      g.fillStyle = token("--gel-pink", "#ff5fa2");
      g.beginPath();
      g.moveTo(64, 112);
      g.bezierCurveTo(10, 76, 6, 40, 30, 24);
      g.bezierCurveTo(48, 12, 62, 24, 64, 38);
      g.bezierCurveTo(66, 24, 80, 12, 98, 24);
      g.bezierCurveTo(122, 40, 118, 76, 64, 112);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.ellipse(40, 42, 10, 6, -0.6, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "note") {
      g.fillStyle = token("--gel-amber", "#ffb82e");
      g.save();
      g.translate(46, 92);
      g.rotate(-0.4);
      g.beginPath();
      g.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillRect(62, 18, 9, 76);
      g.beginPath();
      g.moveTo(70, 18);
      g.quadraticCurveTo(104, 30, 98, 62);
      g.quadraticCurveTo(94, 42, 70, 40);
      g.fill();
    } else {
      g.fillStyle = token("--gel-cyan", "#31b9ff");
      g.beginPath();
      g.moveTo(64, 10);
      g.bezierCurveTo(70, 40, 104, 62, 104, 84);
      g.arc(64, 84, 40, 0, Math.PI);
      g.bezierCurveTo(24, 62, 58, 40, 64, 10);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.beginPath();
      g.ellipse(50, 84, 7, 12, 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Bit = { s: THREE.Sprite; v: THREE.Vector3; age: number; life: number; size: [number, number]; fall: number; spin: number };

/** Zzz, hearts, notes and tears: sprites that float off and fade. */
export class Floaters {
  private bits: Bit[] = [];
  /** how many are in the air (for the checks) */
  get count() {
    return this.bits.length;
  }
  private tex = new Map<FxKind, THREE.CanvasTexture>();
  constructor(private scene: THREE.Scene) {}

  spawn(kind: FxKind, at: THREE.Vector3, out = new THREE.Vector3(1, 0, 0)) {
    if (this.bits.length > 40) return;
    let t = this.tex.get(kind);
    if (!t) {
      t = draw(kind);
      this.tex.set(kind, t);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
    s.position.copy(at);
    const r = (a: number) => (Math.random() * 2 - 1) * a;
    let b: Bit;
    if (kind === "z") b = { s, v: new THREE.Vector3(0.05 + r(0.02), 0.16, 0), age: 0, life: 2.6, size: [0.05, 0.13], fall: 0, spin: 0 };
    else if (kind === "heart") b = { s, v: new THREE.Vector3(r(0.16), 0.3 + r(0.06), r(0.05)), age: 0, life: 1.7, size: [0.06, 0.11], fall: 0, spin: 0 };
    else if (kind === "note") b = { s, v: new THREE.Vector3(r(0.12), 0.24 + r(0.05), 0.05), age: 0, life: 1.6, size: [0.06, 0.09], fall: 0, spin: r(1.2) };
    // tears: thrown out sideways from each eye, and falling
    else b = { s, v: out.clone().multiplyScalar(0.55 + r(0.12)).add(new THREE.Vector3(0, 0.45 + r(0.1), 0.12)), age: 0, life: 0.55, size: [0.028, 0.034], fall: 3.2, spin: 0 };
    s.scale.setScalar(b.size[0]);
    this.scene.add(s);
    this.bits.push(b);
  }

  update(dt: number) {
    for (const b of this.bits) {
      b.age += dt;
      const u = b.age / b.life;
      b.v.y -= b.fall * dt;
      b.s.position.addScaledVector(b.v, dt);
      // a gentle sway for the ones that drift up
      if (!b.fall) b.s.position.x += Math.sin(b.age * 3) * 0.0015;
      b.s.material.rotation += b.spin * dt;
      b.s.scale.setScalar(b.size[0] + (b.size[1] - b.size[0]) * Math.min(1, u * 1.5));
      b.s.material.opacity = u < 0.15 ? u / 0.15 : u > 0.65 ? Math.max(0, (1 - u) / 0.35) : 1;
    }
    this.bits = this.bits.filter((b) => {
      if (b.age < b.life) return true;
      this.scene.remove(b.s);
      b.s.material.dispose();
      return false;
    });
  }

  /** a move changed: what is floating fades out quickly */
  fadeAll() {
    for (const b of this.bits) b.life = Math.min(b.life, b.age + 0.3);
  }

  clear() {
    for (const b of this.bits) {
      this.scene.remove(b.s);
      b.s.material.dispose();
    }
    this.bits = [];
  }

  dispose() {
    this.clear();
    this.tex.forEach((t) => t.dispose());
  }
}

/** The sword's streak: a ribbon through where its edge was over the last few frames. */
export class Trail {
  private n = 14;
  private pts: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private geo = new THREE.BufferGeometry();
  private mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.n * 2 * 3);
    this.col = new Float32Array(this.n * 2 * 4);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  private k = 0;
  /** a new place for the edge, dt seconds after the last (null: the sword is put away) */
  push(dt: number, a: THREE.Vector3 | null, b?: THREE.Vector3) {
    if (a && b) this.pts.unshift({ a: a.clone(), b: b.clone() });
    else this.pts.pop();
    if (this.pts.length > this.n) this.pts.length = this.n;
    // only a real cut shows: the tip faster than 2.5 m a second; it fades rather than snapping off
    const speed = this.pts.length > 1 && dt > 0 ? this.pts[0].b.distanceTo(this.pts[1].b) / dt : 0;
    const want = Math.min(1, Math.max(0, (speed - 2.5) / 3));
    this.k = want > this.k ? want : Math.max(0, this.k - dt * 4);
    const k = this.k;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      const alpha = p && i < this.pts.length ? k * Math.pow(1 - i / this.n, 1.6) * 0.55 : 0;
      if (p) {
        this.pos.set(p.a.toArray(), i * 6);
        this.pos.set(p.b.toArray(), i * 6 + 3);
      }
      this.col.set([0.75, 0.88, 1, alpha * 0.25, 0.85, 0.94, 1, alpha], i * 8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
