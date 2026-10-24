// Style sample C, "low-poly globe": a faceted 3D globe on the big screen with planes flying the routes,
// and faceted art on the phones. Only used on the step-5 style sheet. The globe is drawn on a canvas
// here; the real thing would use Three.js.
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import LAND from "./land-lonlat.json";

type V = [number, number, number];
const norm = (v: V): V => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mid = (a: V, b: V): V => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
const toV = (lat: number, lon: number): V => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

function icosphere(detail: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: V[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => norm(v as V));
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const cache = new Map<string, number>();
    const m = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let i = cache.get(k);
      if (i === undefined) {
        i = verts.length;
        verts.push(mid(verts[a], verts[b]));
        cache.set(k, i);
      }
      return i;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  verts = verts.map(norm);
  return { verts, faces };
}

function inLand(lat: number, lon: number) {
  let inside = false;
  for (const ring of LAND as number[][][]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
    }
  }
  return inside;
}

const ROUTES: [number, number, number, number][] = [
  [31.23, 121.47, 45.44, 12.32],
  [40.71, -74.01, 51.51, -0.13],
  [-33.87, 151.21, 35.68, 139.69],
];

export function PolyGlobe({ size = 340 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    const { verts, faces } = icosphere(3);
    const info = faces.map(([a, b, c]) => {
      const n = norm([verts[a][0] + verts[b][0] + verts[c][0], verts[a][1] + verts[b][1] + verts[c][1], verts[a][2] + verts[b][2] + verts[c][2]]);
      const lat = (Math.asin(n[1]) * 180) / Math.PI;
      const lon = (Math.atan2(n[0], n[2]) * 180) / Math.PI;
      const land = inLand(lat, lon);
      const k = (Math.sin(lat * 3.1 + lon * 1.7) + 1) / 2;
      const color: V = Math.abs(lat) > 66 ? [232, 241, 245] : land ? (Math.abs(lat) < 32 && k > 0.55 ? [217, 190, 120] : [92 + k * 30, 176 + k * 20, 98]) : [38 + k * 10, 92 + k * 14, 160 + k * 16];
      return { n, color };
    });
    const light = norm([-0.5, 0.55, 0.8]);
    const R = size * 0.4;
    const cx = size / 2;
    const cy = size / 2;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const spin = reduced ? 0.6 : ((now - t0) / 1000) * 0.25;
      const tilt = 0.35;
      const rot = (v: V): V => {
        const x = v[0] * Math.cos(spin) + v[2] * Math.sin(spin);
        const z = -v[0] * Math.sin(spin) + v[2] * Math.cos(spin);
        const y = v[1] * Math.cos(tilt) - z * Math.sin(tilt);
        return [x, y, v[1] * Math.sin(tilt) + z * Math.cos(tilt)];
      };
      g.clearRect(0, 0, size, size);
      const halo = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
      halo.addColorStop(0, "rgba(94,240,200,.35)");
      halo.addColorStop(1, "rgba(94,240,200,0)");
      g.fillStyle = halo;
      g.fillRect(0, 0, size, size);
      const rv = verts.map(rot);
      const order = faces.map((f, i) => ({ i, z: rv[f[0]][2] + rv[f[1]][2] + rv[f[2]][2] })).filter((o) => o.z > -0.2).sort((a, b) => a.z - b.z);
      for (const { i } of order) {
        const [a, b, c] = faces[i];
        const n = rot(info[i].n);
        if (n[2] <= 0) continue;
        const s = 0.5 + 0.55 * Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        const [r, gg, bb] = info[i].color;
        g.fillStyle = `rgb(${Math.min(255, r * s) | 0},${Math.min(255, gg * s) | 0},${Math.min(255, bb * s) | 0})`;
        g.beginPath();
        g.moveTo(cx + rv[a][0] * R, cy - rv[a][1] * R);
        g.lineTo(cx + rv[b][0] * R, cy - rv[b][1] * R);
        g.lineTo(cx + rv[c][0] * R, cy - rv[c][1] * R);
        g.closePath();
        g.fill();
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 0.6;
        g.stroke();
      }
      ROUTES.forEach(([la1, lo1, la2, lo2], k) => {
        const A = toV(la1, lo1);
        const B = toV(la2, lo2);
        const om = Math.acos(A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
        const pts: V[] = [];
        for (let i = 0; i <= 40; i++) {
          const f = i / 40;
          const k1 = Math.sin((1 - f) * om) / Math.sin(om);
          const k2 = Math.sin(f * om) / Math.sin(om);
          const lift = 1 + 0.18 * Math.sin(Math.PI * f);
          pts.push(rot([(k1 * A[0] + k2 * B[0]) * lift, (k1 * A[1] + k2 * B[1]) * lift, (k1 * A[2] + k2 * B[2]) * lift]));
        }
        g.strokeStyle = k === 0 ? "#ff7ac8" : "#5ef0c8";
        g.lineWidth = 2;
        g.shadowColor = g.strokeStyle;
        g.shadowBlur = 8;
        g.beginPath();
        let pen = false;
        for (const p of pts) {
          if (p[2] < -0.05) {
            pen = false;
            continue;
          }
          if (!pen) g.moveTo(cx + p[0] * R, cy - p[1] * R);
          else g.lineTo(cx + p[0] * R, cy - p[1] * R);
          pen = true;
        }
        g.stroke();
        const f = reduced ? 0.7 : (((now - t0) / 1000) * 0.22 + k * 0.33) % 1;
        const p = pts[Math.round(f * 40)];
        if (p[2] > 0) {
          g.fillStyle = "#fff";
          g.beginPath();
          g.arc(cx + p[0] * R, cy - p[1] * R, 3.2, 0, Math.PI * 2);
          g.fill();
        }
        g.shadowBlur = 0;
      });
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} class="poly-globe" style={{ width: `${size}px`, height: `${size}px`, maxWidth: "100%" }} aria-hidden="true" />;
}

/** A tiny seeded random so the facets come out the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mix(a: number[], b: number[], f: number) {
  return a.map((x, i) => Math.round(x + (b[i] - x) * f));
}

/** Triangulated band between y0 and y1, coloured from top to bottom with a little noise. */
function facets(y0: number, y1: number, cols: number, rows: number, top: number[], bottom: number[], seed: number) {
  const r = rng(seed);
  const w = 300 / cols;
  const h = (y1 - y0) / rows;
  const p: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    p.push([]);
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || i === cols || j === 0 || j === rows;
      p[j].push([i * w + (edge ? 0 : (r() - 0.5) * w * 0.7), y0 + j * h + (edge ? 0 : (r() - 0.5) * h * 0.7)]);
    }
  }
  const out: JSX.Element[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = p[j][i];
      const b = p[j][i + 1];
      const c = p[j + 1][i + 1];
      const d = p[j + 1][i];
      for (const tri of [
        [a, b, c],
        [a, c, d],
      ]) {
        const yy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const col = mix(top, bottom, (yy - y0) / (y1 - y0)).map((x) => Math.max(0, Math.min(255, x + (r() - 0.5) * 22)));
        out.push(<polygon key={out.length} points={tri.map((q) => q.join(",")).join(" ")} fill={`rgb(${col.join(",")})`} stroke={`rgb(${col.join(",")})`} stroke-width="0.6" />);
      }
    }
  return out;
}

export function PolyVenice() {
  return (
    <svg viewBox="0 0 300 300" class="poly-art" aria-hidden="true">
      {facets(0, 190, 7, 5, [44, 40, 112], [255, 134, 96], 7)}
      {facets(190, 300, 7, 3, [36, 120, 140], [16, 54, 78], 11)}
      <polygon points="200,190 230,96 262,190" fill="#2b2d63" opacity="0.5" />
      {/* campanile, faceted */}
      <polygon points="54,190 54,88 76,82 76,190" fill="#d0584a" />
      <polygon points="76,190 76,82 92,88 92,190" fill="#a03e36" />
      <polygon points="52,88 76,80 94,88 76,96" fill="#f7c6a8" />
      <polygon points="52,88 72,34 76,80" fill="#58c9a2" />
      <polygon points="76,80 72,34 94,88" fill="#2e8f72" />
      {/* palace */}
      <polygon points="104,190 104,130 196,124 196,190" fill="#f2b3a6" />
      <polygon points="196,190 196,124 226,132 226,190" fill="#c98376" />
      <polygon points="104,130 196,124 226,132 136,138" fill="#ffd9cc" />
      {Array.from({ length: 6 }, (_, i) => (
        <polygon key={i} points={`${112 + i * 14},186 ${112 + i * 14},166 ${118 + i * 14},160 ${124 + i * 14},166 ${124 + i * 14},186`} fill="#6c3b4f" />
      ))}
      {/* gondola */}
      <polygon points="40,240 70,252 170,250 196,232 168,242 72,242" fill="#120f22" />
      <polygon points="58,236 64,206 70,236" fill="#f2f2f2" />
    </svg>
  );
}

export function PolySuitcase() {
  return (
    <svg viewBox="0 0 120 120" class="poly-art" aria-hidden="true">
      <polygon points="48,26 72,26 72,34 48,34" fill="#5d3a22" />
      <polygon points="26,36 60,30 94,36 60,42" fill="#ffd36e" />
      <polygon points="26,36 60,42 60,98 26,92" fill="#f5a524" />
      <polygon points="60,42 94,36 94,92 60,98" fill="#c97d0a" />
      <polygon points="26,62 60,68 60,98 26,92" fill="#e8951a" />
      <polygon points="60,68 94,62 94,92 60,98" fill="#b26d06" />
      <polygon points="36,56 44,58 44,66 36,64" fill="#0e1024" />
      <polygon points="50,58 58,60 58,68 50,66" fill="#0e1024" />
      <polygon points="38,76 56,80 50,84" fill="#0e1024" />
      <polygon points="34,98 42,99 42,110 34,110" fill="#0e1024" />
      <polygon points="76,99 84,98 84,110 76,110" fill="#0e1024" />
    </svg>
  );
}
