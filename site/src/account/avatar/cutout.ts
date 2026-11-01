/**
 * A drawn figure lifted off its backdrop, for the games' stages: the AI draws on a flat, plain
 * colour, so everything joined to the picture's edge in that colour is the backdrop. The fill
 * runs only through backdrop-coloured pixels and gentle shading, and stops at the drawing's
 * outlines; the pixels where it stops become see-through by how close they are to the backdrop
 * (soft edges, with the backdrop's tint taken back out). Flat pockets of backdrop shut inside
 * the figure (between an arm and the body) go too.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** how far from the backdrop's colour a pixel may be and still be backdrop */
const CORE = 30;
/** past this it's the figure; in between, an edge, partly see-through */
const EDGE = 74;
/** gentle shading on the backdrop (a vignette, a soft floor shadow) still counts if each step is this small */
const STEP = 5;

/**
 * Key out the backdrop of RGBA pixels, in place. Returns the box the figure fills, or null if
 * nothing is left (a picture that was all backdrop).
 */
export function keyOut(px: Uint8ClampedArray, w: number, h: number): Box | null {
  const n = w * h;
  // the backdrop's colour: the middle value of the picture's border
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const sample = (i: number) => {
    rs.push(px[i * 4]);
    gs.push(px[i * 4 + 1]);
    bs.push(px[i * 4 + 2]);
  };
  for (let x = 0; x < w; x += 2) {
    sample(x);
    sample((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 2) {
    sample(y * w);
    sample(y * w + w - 1);
  }
  const mid = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = mid(rs);
  const bg = mid(gs);
  const bb = mid(bs);

  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4] - br;
    const g = px[i * 4 + 1] - bg;
    const b = px[i * 4 + 2] - bb;
    d[i] = Math.sqrt(r * r + g * g + b * b);
  }
  const near = (i: number, j: number) => Math.abs(px[i * 4] - px[j * 4]) + Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) + Math.abs(px[i * 4 + 2] - px[j * 4 + 2]) <= STEP * 3;

  // 0 figure (not reached), 1 backdrop, 2 waiting in the queue, 3 edge
  const st = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const flood = () => {
    while (head < tail) {
      const i = q[head++];
      st[i] = 1;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) reach(i, i - 1);
      if (x < w - 1) reach(i, i + 1);
      if (y > 0) reach(i, i - w);
      if (y < h - 1) reach(i, i + w);
    }
  };
  const reach = (from: number, j: number) => {
    if (st[j] !== 0 && st[j] !== 3) return;
    if (d[j] < CORE || (d[j] < EDGE && near(from, j))) {
      st[j] = 2;
      q[tail++] = j;
    } else if (d[j] < EDGE) st[j] = 3;
  };
  const seed = (i: number) => {
    if (st[i] === 0 && d[i] < CORE) {
      st[i] = 2;
      q[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  flood();

  // flat pockets of backdrop shut inside the figure: big enough, and as flat as the backdrop
  const minPocket = Math.max(40, Math.round(n * 0.0005));
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (st[s] !== 0 || seen[s] || d[s] >= CORE) continue;
    let top = 0;
    let size = 0;
    let sum = 0;
    const members: number[] = [];
    stack[top++] = s;
    seen[s] = 1;
    while (top) {
      const i = stack[--top];
      members.push(i);
      size++;
      sum += d[i];
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || seen[j] || st[j] !== 0 || d[j] >= CORE) continue;
        seen[j] = 1;
        stack[top++] = j;
      }
    }
    if (size < minPocket || sum / size > 8) continue;
    for (const i of members) {
      st[i] = 2;
      q[tail++] = i;
    }
    flood();
  }

  // see-through where it's backdrop, partly at the edges (with the backdrop's tint taken out)
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < n; i++) {
    let a = 255;
    if (st[i] === 1) a = 0;
    else if (st[i] === 3) {
      const t = Math.min(1, Math.max(0, (d[i] - CORE) / (EDGE - CORE)));
      a = Math.round(t * 255);
      if (t > 0.04) {
        const k = 1 / Math.max(t, 0.25);
        px[i * 4] = clamp(br + (px[i * 4] - br) * k);
        px[i * 4 + 1] = clamp(bg + (px[i * 4 + 1] - bg) * k);
        px[i * 4 + 2] = clamp(bb + (px[i * 4 + 2] - bb) * k);
      }
    }
    px[i * 4 + 3] = a;
    if (a > 24) {
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
