// The coach on its stage: the camera, the lights, a glowing floor that pulses with the beat, light
// beams, trails behind the hands (where they travel), footprints where the feet land, fireworks when
// the floor fills its streak. The page drives it: one `frame` call per animation frame.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  CanvasTexture,
  type Material,
} from "three";
import { poseOf, type Doing } from "./moves";
import { mix, type Pose } from "./pose";
import { Rig, radialTexture } from "./rig";

export interface CoachInput {
  doing: Doing;
  /** the beat position in the move's 8-count (0 = count 1) */
  p: number;
  /** a number that goes up by one every beat (the effects' beat) */
  beat: number;
  /** speaker time (ms) */
  now: number;
  /** 0 to 1: how much the hands and the feet are what this move is about */
  glow: { hands: number; feet: number };
  /** 0 to 1: how full the floor's streak is */
  hype: number;
}

const GEL = "#8f7bff";
const BEAM_COLORS = ["#8f7bff", "#ff7aa8", "#7ad7ff", "#ffd84a"];
const SPARK_COLORS = ["#ffd84a", "#ff7aa8", "#7ad7ff", "#8f7bff", "#63d39f", "#ffffff"];
/** how long a move change takes to blend, in beats */
const BLEND_BEATS = 0.5;

const TRAIL_N = 22;

export class CoachStage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private readonly rig = new Rig();
  private readonly owned: { dispose(): void }[] = [];
  private readonly ring: Mesh;
  private readonly floorGlow: Mesh;
  private readonly shadow: Mesh;
  private readonly beams: Mesh[] = [];
  private readonly trails: { mesh: Mesh; pts: Vector3[]; geo: BufferGeometry }[] = [];
  private readonly prints: { mesh: Mesh; born: number }[] = [];
  private readonly lastPlant = { R: new Vector3(99, 0, 0), L: new Vector3(99, 0, 0) };
  private readonly planted = { R: true, L: true };
  private sparks: { pts: Points; vel: Float32Array; born: number } | null = null;
  private readonly dust: Points;
  private readonly printTex: CanvasTexture;
  private readonly sparkTex: CanvasTexture;
  /** the move blending out, and from when (beat) */
  private was: { doing: Doing; at: number } | null = null;
  private doing: Doing | null = null;
  private lastNow = 0;
  private lastBeat = -1;
  private flash = 0;
  private w = 0;
  private h = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  private host: HTMLElement | null = null;

  constructor(private readonly reduced: boolean) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "coach-canvas";
    const { scene } = this;

    scene.add(new HemisphereLight(0xfff1ff, 0x2a1d55, 1.6));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 5, 6);
    scene.add(key);
    const rim = new DirectionalLight(new Color(GEL), 2.6);
    rim.position.set(-4, 3, -5);
    scene.add(rim);
    const rim2 = new DirectionalLight(new Color("#ff7aa8"), 1.4);
    rim2.position.set(4, 2, -4);
    scene.add(rim2);

    // the floor: a soft glow, a ring that pulses, the coach's shadow
    const glowTex = radialTexture("rgba(143,123,255,0.85)", "rgba(143,123,255,0)");
    this.floorGlow = this.flat(new PlaneGeometry(3.6, 3.6), new MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending }), 0.001);
    this.owned.push(glowTex);
    this.ring = this.flat(new RingGeometry(0.95, 0.99, 72), new MeshBasicMaterial({ color: new Color(GEL), transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }), 0.002);
    const shadowTex = radialTexture("rgba(5,3,15,0.75)", "rgba(5,3,15,0)");
    this.owned.push(shadowTex);
    this.shadow = this.flat(new PlaneGeometry(0.95, 0.65), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 0.003);
    this.printTex = radialTexture("rgba(255,216,74,1)", "rgba(255,216,74,0)");
    this.sparkTex = radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
    this.owned.push(this.printTex, this.sparkTex);

    // light beams from above, fading out before they reach the floor
    const beamTex = beamTexture();
    this.owned.push(beamTex);
    for (let i = 0; i < 4; i++) {
      const geo = new ConeGeometry(0.55, 4.2, 24, 1, true);
      geo.translate(0, -2.1, 0);
      const m = new Mesh(geo, new MeshBasicMaterial({ color: new Color(BEAM_COLORS[i]!), map: beamTex, transparent: true, opacity: 0.07, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
      m.position.set((i - 1.5) * 1.3, 3.8, -2.6);
      scene.add(m);
      this.owned.push(geo, m.material as Material);
      this.beams.push(m);
    }
    // dust in the light
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = -1.5 - Math.random() * 1.5;
    }
    const dg = new BufferGeometry();
    dg.setAttribute("position", new BufferAttribute(pos, 3));
    this.dust = new Points(dg, new PointsMaterial({ size: 0.035, map: this.sparkTex, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, color: new Color("#cfc6ff") }));
    scene.add(this.dust);
    this.owned.push(dg, this.dust.material as Material);

    // trails behind the wrists
    for (const color of ["#7ad7ff", "#ff9fc3"]) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
      geo.setAttribute("alpha", new BufferAttribute(new Float32Array(TRAIL_N * 2), 1));
      const idx: number[] = [];
      for (let i = 0; i < TRAIL_N - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const mesh = new Mesh(geo, new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, vertexColors: false }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.owned.push(geo, mesh.material as Material);
      this.trails.push({ mesh, pts: [], geo });
    }

    scene.add(this.rig.root);
    this.owned.push(this.rig);
  }

  /** Into a box on the page (the page redraws its boxes: the same canvas moves to the new one). */
  attach(host: HTMLElement) {
    this.host = host;
    if (this.canvas.parentElement !== host) host.append(this.canvas);
    this.w = this.h = 0;
    this.resize();
  }

  private flat(geo: BufferGeometry, mat: Material, y: number): Mesh {
    const m = new Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    this.scene.add(m);
    this.owned.push(geo, mat);
    return m;
  }

  /** Fit the canvas to its box, keeping the whole coach (arms up, a lunge) in view. */
  resize() {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // at least 2.35 m tall and 2.2 m wide in view: the coach with its arms up, or out in a lunge
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const needH = 2.45;
    const needW = 2.2;
    const dist = Math.max(needH / (2 * half), needW / (2 * half * aspect));
    // a little above the coach, looking down a touch: the feet's steps forward and back show
    this.camera.position.set(0, 1.75, dist);
    this.camera.lookAt(0, 0.92, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Forget the last frames (the blend between moves, the trails): for a jump, or a still picture. */
  snap() {
    this.was = null;
    this.doing = null;
    for (const t of this.trails) t.pts.length = 0;
    this.lastNow = 0;
  }

  /** Where the wrists and ankles are (the checks). */
  joints() {
    const v = (f: (out: Vector3) => Vector3) => {
      const p = f(new Vector3());
      return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
    };
    return {
      wristR: v((o) => this.rig.wrist("R", o)),
      wristL: v((o) => this.rig.wrist("L", o)),
      ankleR: v((o) => this.rig.ankle("R", o)),
      ankleL: v((o) => this.rig.ankle("L", o)),
    };
  }

  /** Fireworks over the coach. */
  burst(now: number) {
    if (this.reduced) {
      this.flash = 1;
      return;
    }
    this.clearSparks();
    const n = 260;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const c = new Color();
    const centres = [
      [-0.9, 2.1, -0.4],
      [0.9, 2.2, -0.4],
      [0, 2.5, -0.8],
    ];
    for (let i = 0; i < n; i++) {
      const o = centres[i % centres.length]!;
      pos.set(o, i * 3);
      // a sphere of speeds
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 1.1;
      const r = Math.sqrt(1 - u * u);
      vel.set([r * Math.cos(t) * s, u * s + 0.6, r * Math.sin(t) * s * 0.5], i * 3);
      c.set(SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("color", new BufferAttribute(col, 3));
    const pts = new Points(geo, new PointsMaterial({ size: 0.075, map: this.sparkTex, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: AdditiveBlending }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.sparks = { pts, vel, born: now };
    this.flash = 1;
  }

  private clearSparks() {
    if (!this.sparks) return;
    this.scene.remove(this.sparks.pts);
    this.sparks.pts.geometry.dispose();
    (this.sparks.pts.material as Material).dispose();
    this.sparks = null;
  }

  frame(input: CoachInput) {
    this.resize();
    const { now } = input;
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    const secs = now / 1000;
    // the pose, blended from the last move for half a beat after a change
    if (!this.doing || !same(this.doing, input.doing)) {
      if (this.doing) this.was = { doing: this.doing, at: input.beat };
      this.doing = input.doing;
    }
    let pose: Pose = poseOf(input.doing, input.p, secs);
    if (this.was) {
      const t = (input.beat - this.was.at) / BLEND_BEATS;
      if (t >= 1 || t < 0) this.was = null;
      else pose = mix(poseOf(this.was.doing, input.p, secs), pose, 0.5 - 0.5 * Math.cos(Math.PI * t), false);
    }
    this.rig.apply(pose, dt, input.glow, secs);

    // the beat: the ring and the beams pulse on it (not with reduced motion)
    const whole = Math.floor(input.beat);
    const frac = input.beat - whole;
    if (whole !== this.lastBeat) this.lastBeat = whole;
    const pulse = input.doing.kind === "idle" ? 0 : Math.exp(-frac * 5);
    const ringMat = this.ring.material as MeshBasicMaterial;
    if (this.reduced) {
      this.ring.scale.setScalar(1);
      ringMat.opacity = 0.35 + 0.25 * input.hype;
    } else {
      this.ring.scale.setScalar(1 + 0.12 * pulse);
      ringMat.opacity = 0.25 + 0.45 * pulse + 0.2 * input.hype;
    }
    this.ring.position.x = pose.rx + pose.px;
    this.floorGlow.position.x = pose.rx + pose.px * 0.5;
    const glowMat = this.floorGlow.material as MeshBasicMaterial;
    glowMat.opacity = 0.4 + 0.3 * input.hype + 0.6 * this.flash;
    this.shadow.position.set(pose.rx + pose.px, 0.003, pose.rz + pose.pz);
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i]!;
      const sw = this.reduced ? 0 : Math.sin(secs * 0.6 + i * 1.7) * 0.28;
      b.rotation.z = (i - 1.5) * 0.12 + sw;
      const m = b.material as MeshBasicMaterial;
      // (a beam brightens on its beat of the four)
      const mine = !this.reduced && input.doing.kind !== "idle" && ((whole % 4) + 4) % 4 === i ? pulse : 0;
      m.opacity = 0.04 + 0.05 * input.hype + 0.1 * mine + 0.15 * this.flash;
    }
    const dp = this.dust.geometry.getAttribute("position") as BufferAttribute;
    if (!this.reduced) {
      for (let i = 0; i < dp.count; i++) {
        let y = dp.getY(i) + dt * 0.08;
        if (y > 3) y = 0;
        dp.setY(i, y);
      }
      dp.needsUpdate = true;
    }

    this.trailFrame();
    this.printFrame(now, pose);
    this.sparkFrame(now, dt);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.renderer.render(this.scene, this.camera);
  }

  /** The ribbons behind the wrists: the last few frames' positions, fading, a little wide. */
  private trailFrame() {
    const sides = ["R", "L"] as const;
    const camDir = this.tmp2.set(0, 0, 1);
    for (let k = 0; k < 2; k++) {
      const tr = this.trails[k]!;
      const at = this.rig.wrist(sides[k]!, new Vector3());
      if (tr.pts.length && tr.pts[0]!.distanceTo(at) > 0.35) tr.pts.length = 0;
      tr.pts.unshift(at);
      if (tr.pts.length > TRAIL_N) tr.pts.length = TRAIL_N;
      const pos = tr.geo.getAttribute("position") as BufferAttribute;
      for (let i = 0; i < TRAIL_N; i++) {
        const p = tr.pts[Math.min(i, tr.pts.length - 1)]!;
        const q = tr.pts[Math.min(i + 1, tr.pts.length - 1)]!;
        const dir = this.tmp.copy(p).sub(q);
        if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
        const side = dir.cross(camDir).normalize();
        const w = 0.028 * (1 - i / TRAIL_N);
        pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      }
      pos.needsUpdate = true;
      tr.geo.computeBoundingSphere();
    }
  }

  /** A glowing footprint where a foot comes down somewhere new. */
  private printFrame(now: number, pose: Pose) {
    for (const s of ["R", "L"] as const) {
      const f = s === "R" ? pose.fR : pose.fL;
      const down = f.lift < 0.012;
      if (down && !this.planted[s]) {
        const at = this.rig.ankle(s, this.tmp);
        if (at.distanceTo(this.lastPlant[s]) > 0.06) {
          this.lastPlant[s].copy(at);
          const mat = new MeshBasicMaterial({ map: this.printTex, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
          const m = new Mesh(new PlaneGeometry(0.16, 0.3), mat);
          m.rotation.set(-Math.PI / 2, 0, -f.yaw);
          m.position.set(at.x, 0.004, at.z + 0.05);
          this.scene.add(m);
          this.prints.push({ mesh: m, born: now });
        }
      }
      this.planted[s] = down;
    }
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i]!;
      const age = (now - p.born) / 1400;
      if (age >= 1 || age < 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as Material).dispose();
        this.prints.splice(i, 1);
      } else (p.mesh.material as MeshBasicMaterial).opacity = 0.85 * (1 - age);
    }
  }

  private sparkFrame(now: number, dt: number) {
    const s = this.sparks;
    if (!s) return;
    const age = (now - s.born) / 1800;
    if (age >= 1 || age < 0) {
      this.clearSparks();
      return;
    }
    const pos = s.pts.geometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      s.vel[i * 3 + 1]! -= 2.2 * dt;
      s.vel[i * 3]! *= 0.985;
      s.vel[i * 3 + 2]! *= 0.985;
      pos.setXYZ(i, pos.getX(i) + s.vel[i * 3]! * dt, pos.getY(i) + s.vel[i * 3 + 1]! * dt, pos.getZ(i) + s.vel[i * 3 + 2]! * dt);
    }
    pos.needsUpdate = true;
    (s.pts.material as PointsMaterial).opacity = 1 - age * age;
  }

  dispose() {
    this.clearSparks();
    for (const p of this.prints) {
      p.mesh.geometry.dispose();
      (p.mesh.material as Material).dispose();
    }
    for (const o of this.owned) o.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** A beam's light: full at the lamp (the cone's top), nothing by its far end. */
function beamTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const same = (a: Doing, b: Doing) => a.kind === b.kind && (a.kind !== "move" || (b.kind === "move" && a.id === b.id));
