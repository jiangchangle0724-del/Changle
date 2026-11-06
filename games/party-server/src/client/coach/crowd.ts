// Everyone on the TV: each player a neon stick figure in their own colour, along the bottom of the
// screen, dancing the coach's move as hard as they are moving (their phone's pulse: the motion
// sensor, or their taps), lighting up and throwing sparks on each beat they hit. So a player sees
// themselves on the TV. Drawn in 2D (no graphics chip needed), from the same poses as the coach.
import { poseOf, type Doing } from "./moves";
import { BASE, groove, mix, over, type Pose } from "./pose";

/** One player as the TV knows them: their movement now (0 to 1) and their last beat on the beat. */
export interface Dancer {
  id: string;
  name: string;
  color: string;
  /** energy from their last pulse, and when it came (page clock, ms) */
  e: number;
  at: number;
  /** when they last hit a beat (page clock, ms) */
  hitAt: number;
}

/** Each player's colour, in the order they joined: bright on the night background. */
export const PLAYER_COLORS = ["#7ad7ff", "#ff7aa8", "#ffd84a", "#63d39f", "#b49bff", "#ff9f5a", "#5ef0d8", "#ff6b8b", "#c6f05a", "#8fb7ff", "#ffb0e0", "#9af0a0", "#f0c05a", "#d79bff", "#6bd0ff"];

const HIP_Y = 0.875;
const UPPER = 0.29;
const FORE = 0.27;
const THIGH = 0.4;
const SHIN = 0.4;
/** A player whose phone has said nothing for this long stands still, dimmed. */
const QUIET_MS = 2500;

type P2 = [number, number];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
}

export class Crowd {
  readonly canvas = document.createElement("canvas");
  private readonly g: CanvasRenderingContext2D;
  private host: HTMLElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private readonly sparks: Spark[] = [];
  private readonly lastHit = new Map<string, number>();

  constructor(private readonly reduced: boolean) {
    this.canvas.className = "crowd-canvas";
    this.g = this.canvas.getContext("2d")!;
  }

  attach(host: HTMLElement) {
    this.host = host;
    if (this.canvas.parentElement !== host) host.append(this.canvas);
    this.w = this.h = 0;
  }

  private resize() {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** One frame: everyone dancing `doing` at beat position `p` (local: this page's clock, for the fades). */
  frame(doing: Doing, p: number, secs: number, local: number, dancers: readonly Dancer[]) {
    this.resize();
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const n = dancers.length;
    if (!n) return;
    // one row; each figure as tall as fits, with room for the name under it
    const slot = this.w / n;
    const tall = Math.min(this.h * 0.74, slot * 1.5);
    const scale = tall / 2.15;
    const moving = poseOf(doing, p, secs);
    const still = groove(over(BASE, {}), p - Math.floor(p), 0.25);
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      const d = dancers[i]!;
      const quiet = local - d.at > QUIET_MS;
      const e = quiet ? 0 : Math.min(1, d.e * 1.4);
      const pose = e >= 0.999 ? moving : mix(still, moving, e, false);
      const hitAge = local - d.hitAt;
      const lit = hitAge >= 0 && hitAge < 380 ? 1 - hitAge / 380 : 0;
      // a new hit: sparks off the figure
      if (d.hitAt > (this.lastHit.get(d.id) ?? 0)) {
        this.lastHit.set(d.id, d.hitAt);
        if (!this.reduced && hitAge < 300) this.spark((i + 0.5) * slot, this.h * 0.78 - tall * 0.75, d.color, local);
      }
      const cx = (i + 0.5) * slot;
      const floorY = this.h * 0.8;
      this.figure(pose, cx, floorY, scale * (1 + 0.06 * lit), d.color, quiet ? 0.28 : 0.45 + 0.55 * Math.max(e, lit), lit);
      // the name
      g.shadowBlur = 0;
      g.globalAlpha = quiet ? 0.5 : 1;
      g.fillStyle = d.color;
      g.font = `700 ${Math.max(12, Math.min(22, slot * 0.16))}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText(d.name, cx, floorY + 6, slot - 8);
      g.globalAlpha = 1;
    }
    this.sparkFrame(local);
  }

  /** A stick figure from a pose, the floor at (cx, floorY), `scale` pixels a metre. */
  private figure(p: Pose, cx: number, floorY: number, scale: number, color: string, alpha: number, lit: number) {
    const g = this.g;
    const X = (x: number) => cx + x * scale;
    const Y = (y: number) => floorY - y * scale;
    // the trunk leans with the hips' and the chest's tilt (roll: + leans to the screen's left)
    const th = p.roll + p.cRoll;
    const u: P2 = [-Math.sin(th), Math.cos(th)];
    const r: P2 = [Math.cos(th), Math.sin(th)];
    const pr: P2 = [Math.cos(p.roll), Math.sin(p.roll)];
    const pu: P2 = [-Math.sin(p.roll), Math.cos(p.roll)];
    const P: P2 = [p.rx + p.px, HIP_Y + p.py];
    const S: P2 = [P[0] + u[0] * 0.48, P[1] + u[1] * 0.48];
    const at = (o: P2, a: number, b: number): P2 => [o[0] + r[0] * a + u[0] * b, o[1] + r[1] * a + u[1] * b];
    const shR = at(S, 0.19, p.sR[0]);
    const shL = at(S, -0.19, p.sL[0]);
    const wR = at(S, p.hR[0], p.hR[1]);
    const wL = at(S, p.hL[0], p.hL[1]);
    const eR = bend(shR, wR, UPPER, FORE, 1);
    const eL = bend(shL, wL, UPPER, FORE, -1);
    const hR: P2 = [P[0] + pr[0] * 0.1 - pu[0] * 0.04, P[1] + pr[1] * 0.1 - pu[1] * 0.04];
    const hL: P2 = [P[0] - pr[0] * 0.1 - pu[0] * 0.04, P[1] - pr[1] * 0.1 - pu[1] * 0.04];
    const aR: P2 = [p.rx + p.fR.x, 0.075 + p.fR.lift];
    const aL: P2 = [p.rx + p.fL.x, 0.075 + p.fL.lift];
    const kR = bend(hR, aR, THIGH, SHIN, 1);
    const kL = bend(hL, aL, THIGH, SHIN, -1);
    const head: P2 = [S[0] + u[0] * 0.24, S[1] + u[1] * 0.24];
    g.globalAlpha = alpha;
    g.strokeStyle = lit > 0 ? mixWhite(color, lit * 0.7) : color;
    g.fillStyle = g.strokeStyle;
    g.shadowColor = color;
    g.shadowBlur = this.reduced ? 6 : 10 + 16 * lit;
    g.lineWidth = Math.max(3, scale * 0.075);
    const line = (...pts: P2[]) => {
      g.beginPath();
      g.moveTo(X(pts[0]![0]), Y(pts[0]![1]));
      for (const q of pts.slice(1)) g.lineTo(X(q[0]), Y(q[1]));
      g.stroke();
    };
    // the body: hips up to the shoulders, the shoulders across, then the limbs
    line([ (hR[0] + hL[0]) / 2, (hR[1] + hL[1]) / 2 ], S);
    line(shL, shR);
    line(hL, hR);
    line(shR, eR, wR);
    line(shL, eL, wL);
    line(hR, kR, aR);
    line(hL, kL, aL);
    // feet, turned out a little
    line(aR, [aR[0] + 0.07, aR[1] - 0.03]);
    line(aL, [aL[0] - 0.07, aL[1] - 0.03]);
    // the head
    g.beginPath();
    g.arc(X(head[0]), Y(head[1]), 0.12 * scale, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  private spark(x: number, y: number, color: string, local: number) {
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 120;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, born: local, color: Math.random() < 0.3 ? "#ffffff" : color });
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }

  private sparkFrame(local: number) {
    const g = this.g;
    g.shadowBlur = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      const age = (local - s.born) / 1000;
      if (age > 0.7 || age < 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      const x = s.x + s.vx * age;
      const y = s.y + s.vy * age + 160 * age * age;
      g.globalAlpha = 1 - age / 0.7;
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** The middle joint of a two-bone limb from a to b, bent towards `side` (+1: the screen's right). */
function bend(a: P2, b: P2, l1: number, l2: number, side: number): P2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 1e-6;
  d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, d));
  const cos = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const ang = Math.acos(cos);
  const base = Math.atan2(dy, dx);
  // the two ways it could bend: the one on `side` (outward)
  const a1 = base + ang;
  const a2 = base - ang;
  const p1: P2 = [a[0] + Math.cos(a1) * l1, a[1] + Math.sin(a1) * l1];
  const p2: P2 = [a[0] + Math.cos(a2) * l1, a[1] + Math.sin(a2) * l1];
  return (p1[0] - p2[0]) * side >= 0 ? p1 : p2;
}

/** A colour towards white by t (0 to 1). */
function mixWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
