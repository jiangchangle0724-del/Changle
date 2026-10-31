// A photo, read on the phone itself, into the maker's choices: skin, face shape, eyes and their
// color, brows, hair (color, length, fringe, curls), glasses, a beard. Two small models do the
// looking (Google's MediaPipe face landmarker and hair segmenter, Apache 2.0, served from this site
// at /mp/); the photo never leaves the phone. Gender, age and the like aren't guessed: the player
// says who they are.
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { EYE_COLORS, HAIR_COLORS, type AvatarCfg } from "../../shared/avatar/cfg";

export type Matcher = { face: FaceLandmarker; hair: ImageSegmenter };

/** What came out of a photo: the choices it set, and which of them it could tell. */
export type Match = { cfg: Partial<AvatarCfg>; seen: Seen[]; note?: "no-face" | "sideways" };
export type Seen = "skin" | "face" | "eyes" | "eyeColor" | "brows" | "hair" | "fringe" | "hairColor" | "glasses" | "beard";

let MP = "/mp";
/** Where the reading kit is served from (the site keeps it at /mp; a preview page next to itself). */
export function serveMatcherFrom(base: string) {
  MP = base;
}
/** Bytes to fetch the first time (the runtime and the two models), for the progress bar. */
export const MP_BYTES = 14_466_654 + 3_758_596 + 781_618;

let loading: Promise<Matcher> | null = null;
let ready = false;
/** Whether the reading kit is already here (no download to wait for). */
export const matcherReady = () => ready;

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.byteLength;
    onBytes(value.byteLength);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Load the models once (they stay for the visit). `onProgress` gets 0..1. */
export function loadMatcher(onProgress?: (p: number) => void, base?: string): Promise<Matcher> {
  if (loading) return loading;
  const from = base ?? MP;
  loading = (async () => {
    let got = 0;
    const tick = (n: number) => {
      got += n;
      onProgress?.(Math.min(1, got / MP_BYTES));
    };
    // (the runtime is fetched by MediaPipe itself; fetching it first fills the cache and shows progress)
    const [, faceModel, hairModel, vision] = await Promise.all([
      fetchWithProgress(`${from}/vision_wasm_internal.wasm`, tick),
      fetchWithProgress(`${from}/face_landmarker.task`, tick),
      fetchWithProgress(`${from}/hair_segmenter.tflite`, tick),
      import("@mediapipe/tasks-vision"),
    ]);
    const files = await vision.FilesetResolver.forVisionTasks(from);
    const face = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: faceModel, delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: false,
    });
    const hair = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: hairModel, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    onProgress?.(1);
    ready = true;
    return { face, hair };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

// ---------------------------------------------------------------------------------------------
// Color

type Lab = [number, number, number];

function toLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const hexLab = (h: string): Lab => toLab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));

function nearest(lab: Lab, palette: readonly string[], w: [number, number, number] = [1, 1, 1]): number {
  let best = 0;
  let bestD = Infinity;
  palette.forEach((h, i) => {
    const [L, a, b] = hexLab(h);
    const d = w[0] * (L - lab[0]) ** 2 + w[1] * (a - lab[1]) ** 2 + w[2] * (b - lab[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Skin from its lightness against the eye whites and teeth (calibrated on portraits; see DESIGN.md). */
function skinFromRatio(r: number, c: number): number {
  const cuts = [1.05, 0.93, 0.89, 0.86, 0.83, 0.79, 0.75, 0.71, 0.66];
  let i = cuts.findIndex((x) => r > x);
  if (i < 0) i = 9;
  // (deep skin photographs with more color for its lightness)
  if (c > 38 && i < 9) i += 1;
  return i;
}

/** Skin from lightness alone: a phone exposes every face toward the same lightness, so this is
 * pulled toward the middle of the range. */
function skinFromL(L: number): number {
  const cuts = [78, 72, 66, 62, 58, 54, 49, 44, 38];
  const i = cuts.findIndex((x) => L > x);
  return i < 0 ? 9 : i;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

// ---------------------------------------------------------------------------------------------
// Reading the picture

type Px = { w: number; h: number; d: Uint8ClampedArray };
type P = [number, number];

/** Lab colors of a square patch round a point (skipping blown-out and black pixels). */
function patch(img: Px, x: number, y: number, r: number): Lab[] {
  const out: Lab[] = [];
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const xx = Math.round(x + i);
      const yy = Math.round(y + j);
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
      const k = (yy * img.w + xx) * 4;
      const lab = toLab(img.d[k], img.d[k + 1], img.d[k + 2]);
      if (lab[0] > 97 || lab[0] < 4) continue;
      out.push(lab);
    }
  return out;
}

const labMedian = (xs: Lab[]): Lab => [median(xs.map((x) => x[0])), median(xs.map((x) => x[1])), median(xs.map((x) => x[2]))];
const chroma = (l: Lab) => Math.hypot(l[1], l[2]);

/** Mean gradient (edge strength) across a box, `dir` "h" for edges that run across (top and bottom rims). */
function edges(img: Px, x0: number, y0: number, x1: number, y1: number, dir: "h" | "v"): number {
  let sum = 0;
  let n = 0;
  const L = (x: number, y: number) => {
    const k = (Math.round(y) * img.w + Math.round(x)) * 4;
    return 0.299 * img.d[k] + 0.587 * img.d[k + 1] + 0.114 * img.d[k + 2];
  };
  for (let y = Math.max(1, Math.round(y0)); y < Math.min(img.h - 1, y1); y++)
    for (let x = Math.max(1, Math.round(x0)); x < Math.min(img.w - 1, x1); x++) {
      const g = dir === "h" ? Math.abs(L(x, y + 1) - L(x, y - 1)) : Math.abs(L(x + 1, y) - L(x - 1, y));
      sum += g;
      n++;
    }
  return n ? sum / n : 0;
}

type Src = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/** The picture last read, as the models saw it, and the face's points on it (0..1): for tests and
 * the maker's scan animation. */
export let lastRead: HTMLCanvasElement | null = null;
export let lastPts: [number, number][] = [];

/** Draw part of a picture (`box` in its own pixels) into a canvas at most `max` across. */
function draw(src: Src, box: [number, number, number, number], max: number): HTMLCanvasElement {
  const [x, y, w, h] = box;
  const k = Math.min(max / Math.max(w, h), 2.5);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d", { willReadFrequently: true })!.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

/** Local contrast: mean |L - mean of its 4 neighbours| over the points `pick` accepts (curls, beard). */
function texture(img: Px, x0: number, y0: number, x1: number, y1: number, step: number, pick: (x: number, y: number) => boolean = () => true): number {
  let sum = 0;
  let n = 0;
  const L = (x: number, y: number) => {
    const k = (y * img.w + x) * 4;
    return 0.299 * img.d[k] + 0.587 * img.d[k + 1] + 0.114 * img.d[k + 2];
  };
  for (let y = Math.max(2, Math.round(y0)); y < Math.min(img.h - 2, y1); y += step)
    for (let x = Math.max(2, Math.round(x0)); x < Math.min(img.w - 2, x1); x += step) {
      if (!pick(x, y)) continue;
      sum += Math.abs(L(x, y) - (L(x - 2, y) + L(x + 2, y) + L(x, y - 2) + L(x, y + 2)) / 4);
      n++;
    }
  return n ? sum / n : 0;
}

/**
 * Read a photo. A selfie is read as it is; in a wider picture the face is found first and read
 * again from a square crop round it, as close as a selfie (the hair needs room round the head). EXIF
 * turns the photo upright (`createImageBitmap`). Nothing is kept.
 */
export async function matchPhoto(m: Matcher, source: Blob | Src, debug?: Record<string, number>): Promise<Match> {
  const src: Src = source instanceof Blob ? await createImageBitmap(source, { imageOrientation: "from-image" } as ImageBitmapOptions) : source;
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  const find = (c: HTMLCanvasElement) => m.face.detect(c).faceLandmarks?.[0];
  let canvas = draw(src, [0, 0, sw, sh], 720);
  let lm = find(canvas);
  let box: [number, number, number, number] = [0, 0, sw, sh];
  if (!lm) {
    // a person further away: try the top middle of the picture, closer
    box = [sw * 0.2, 0, sw * 0.6, Math.min(sh, sw * 0.6)];
    canvas = draw(src, box, 720);
    lm = find(canvas);
  }
  if (!lm) return { cfg: {}, seen: [], note: "no-face" };
  // the face's size and middle in the source's pixels
  const xs = lm.map((q) => box[0] + q.x * box[2]);
  const ys = lm.map((q) => box[1] + q.y * box[3]);
  const fw = Math.max(...xs) - Math.min(...xs);
  const fcx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const fcy = (Math.max(...ys) + Math.min(...ys)) / 2;
  if (fw < Math.min(box[2], box[3]) * 0.42) {
    const side = Math.min(fw * 2.8, Math.max(sw, sh));
    const crop: [number, number, number, number] = [fcx - side / 2, fcy - side * 0.56, side, side];
    const c2 = draw(src, crop, 720);
    const lm2 = find(c2);
    if (lm2) {
      canvas = c2;
      lm = lm2;
    }
  }
  lastRead = canvas;
  lastPts = lm.map((q) => [q.x, q.y]);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const img: Px = { w: data.width, h: data.height, d: data.data };
  const seg = m.hair.segment(canvas);
  const mask = seg.categoryMask?.getAsUint8Array() ?? new Uint8Array(img.w * img.h);
  const mw = seg.categoryMask?.width ?? img.w;
  const mh = seg.categoryMask?.height ?? img.h;
  seg.close?.();
  const isHair = (x: number, y: number) => {
    const xx = Math.round((x / img.w) * mw);
    const yy = Math.round((y / img.h) * mh);
    if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) return false;
    return mask[yy * mw + xx] > 0;
  };
  return read(
    img,
    lm.map((q) => [q.x * img.w, q.y * img.h] as P),
    isHair,
    debug,
  );
}

/** The reading itself, on pixels and landmarks (separate so tests can run it on any picture). */
export function read(img: Px, pts: P[], isHair: (x: number, y: number) => boolean, dbg: Record<string, number> = {}): Match {
  const at = (i: number) => pts[i];
  const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const seen: Seen[] = [];
  const cfg: Partial<AvatarCfg> = {};
  const faceW = dist(at(234), at(454));
  const top = at(10);
  const chin = at(152);
  const faceH = dist(top, chin);
  // (turned well away from the camera: shapes can't be trusted, colors still can)
  const noseOff = Math.abs(at(1)[0] - (at(234)[0] + at(454)[0]) / 2) / faceW;
  const sideways = noseOff > 0.14;

  // ---- skin. A phone exposes for the face, so a face's lightness says little by itself: it's read
  // against the brightest things on the face, the whites of the eyes and the teeth.
  const skinSamples = [50, 280, 205, 425, 117, 346].flatMap((i) => patch(img, at(i)[0], at(i)[1], Math.max(2, Math.round(faceW * 0.02))));
  const skin = labMedian(skinSamples);
  const whites: number[] = [];
  for (const [c, a, b] of [
    [468, 33, 133],
    [473, 263, 362],
  ] as const)
    for (const e of [a, b])
      for (let t = 0; t <= 1; t += 0.125) {
        const k2 = 0.3 + 0.55 * t;
        for (const l of patch(img, at(c)[0] + (at(e)[0] - at(c)[0]) * k2, at(c)[1] + (at(e)[1] - at(c)[1]) * k2, 1)) whites.push(l[0]);
      }
  // teeth, when the mouth is open
  const lipGap = dist(at(13), at(14)) / faceH;
  if (lipGap > 0.03)
    for (let t = 0.2; t <= 0.8; t += 0.1)
      for (let u = 0.25; u <= 0.75; u += 0.25) {
        const x = at(78)[0] + (at(308)[0] - at(78)[0]) * t;
        const y = at(13)[1] + (at(14)[1] - at(13)[1]) * u;
        for (const l of patch(img, x, y, 1)) whites.push(l[0]);
      }
  const ws = whites.sort((a, b) => a - b);
  const white = ws.length > 10 ? ws[Math.floor(ws.length * 0.8)] : NaN;
  const ratio = skin[0] / white;
  dbg.skinL = skin[0];
  dbg.skinC = chroma(skin);
  dbg.white = white;
  dbg.ratio = ratio;
  if (Number.isFinite(skin[0])) {
    // (whites in shadow, or none to see: go by the skin's lightness, which says less)
    const idx = Number.isFinite(white) && white >= 62 ? skinFromRatio(ratio, chroma(skin)) : skinFromL(skin[0]);
    cfg.skin = idx;
    seen.push("skin");
  }

  // ---- face shape (height against width, jaw against cheekbones)
  if (!sideways) {
    const jaw = dist(at(172), at(397));
    const r1 = faceH / faceW;
    const r2 = jaw / faceW;
    const chinW = dist(at(148), at(377)) / faceW;
    Object.assign(dbg, { r1, r2, chinW });
    cfg.face = r1 > 1.27 ? "long" : r1 < 1.165 && r2 >= 0.81 ? "round" : r2 > 0.845 ? "square" : r2 < 0.795 ? "heart" : "oval";
    seen.push("face");
  }

  // ---- eyes: how open, and which way the outer corner goes
  if (!sideways) {
    const eyeOf = (outer: number, inner: number, up: number, down: number) => {
      const w = dist(at(outer), at(inner));
      const h = dist(at(up), at(down));
      // (outer corner higher than the inner one: upturned; the picture's y runs down)
      const tilt = (Math.atan2(at(inner)[1] - at(outer)[1], Math.abs(at(inner)[0] - at(outer)[0])) * 180) / Math.PI;
      return { open: h / w, tilt };
    };
    const a = eyeOf(33, 133, 159, 145);
    const b = eyeOf(263, 362, 386, 374);
    const open = (a.open + b.open) / 2;
    const tilt = (a.tilt + b.tilt) / 2;
    Object.assign(dbg, { open, tilt });
    cfg.eyes = open < 0.21 ? "narrow" : tilt > 5.6 ? "sharp" : tilt < 1.2 ? "droopy" : open > 0.335 ? "round" : "almond";
    seen.push("eyes");
  }
  const irisR = dist(at(468), at(469));
  const irisPx: Lab[] = [];
  for (const c of [468, 473]) {
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      const r = irisR * 0.62;
      irisPx.push(...patch(img, at(c)[0] + Math.cos(t) * r, at(c)[1] + Math.sin(t) * r, 0));
    }
  }
  const irisCol = labMedian(irisPx.filter((l) => l[0] > 8 && l[0] < 80));
  if (Number.isFinite(irisCol[0])) {
    // most eyes photograph near black: only a clear hue moves them off brown
    const c = chroma(irisCol);
    const hue = (Math.atan2(irisCol[2], irisCol[1]) * 180) / Math.PI;
    cfg.eyeColor =
      c < 6 ? (irisCol[0] < 32 ? 0 : 1) : hue < -60 && hue > -150 ? (irisCol[0] > 45 ? 6 : 5) : hue > 95 && hue < 170 ? 4 : nearest(irisCol, EYE_COLORS.slice(0, 4), [1, 1.6, 1.6]);
    seen.push("eyeColor");
  }

  // ---- brows: how thick, and their shape
  if (!sideways) {
    const browOf = (upper: number[], lower: number[]) => {
      const th = upper.reduce((s, u, i) => s + dist(at(u), at(lower[i])), 0) / upper.length / faceH;
      const ends: [P, P] = [at(upper[0]), at(upper[upper.length - 1])];
      const mid = at(upper[2]);
      const lineY = (ends[0][1] + ends[1][1]) / 2;
      const arch = (lineY - mid[1]) / faceH;
      const rise = (at(upper[upper.length - 1])[1] - at(upper[0])[1]) / faceH;
      return { th, arch, rise };
    };
    // (outer end first: rise > 0 means the inner end is lower, the outer higher)
    const r = browOf([70, 63, 105, 66, 107], [46, 53, 52, 65, 55]);
    const l = browOf([300, 293, 334, 296, 336], [276, 283, 282, 295, 285]);
    const th = (r.th + l.th) / 2;
    const arch = (r.arch + l.arch) / 2;
    const rise = -(r.rise + l.rise) / 2;
    Object.assign(dbg, { browTh: th, arch, rise });
    cfg.browWeight = th < 0.031 ? 0 : th < 0.037 ? 1 : 2;
    cfg.brows = rise > 0.058 ? "bold" : arch > 0.037 ? "arched" : arch < 0.028 ? "straight" : "soft";
    seen.push("brows");
  }

  // ---- hair
  const hairRead = readHair(img, pts, isHair, faceW, faceH, dbg);
  if (hairRead) {
    Object.assign(cfg, hairRead.cfg);
    seen.push(...hairRead.seen);
  }

  // ---- glasses: a frame's bottom rim under each eye, and its bridge between them
  const glasses = readGlasses(img, pts, faceW, skin, dbg);
  if (glasses) {
    cfg.glasses = glasses;
    seen.push("glasses");
  } else cfg.glasses = "none";

  // ---- facial hair: darker, greyer skin over the lip, the chin, the jaw
  const beard = readBeard(img, pts, faceW, skin, dbg);
  cfg.beard = beard;
  if (beard !== "none") seen.push("beard");

  return { cfg, seen, note: sideways ? "sideways" : undefined };
}

function readHair(
  img: Px,
  pts: P[],
  isHair: (x: number, y: number) => boolean,
  faceW: number,
  faceH: number,
  dbg: Record<string, number>,
): { cfg: Partial<AvatarCfg>; seen: Seen[] } | null {
  const at = (i: number) => pts[i];
  const top = at(10);
  const chin = at(152);
  const left = at(234);
  const right = at(454);
  const cx = (left[0] + right[0]) / 2;
  const step = Math.max(1, Math.round(faceW / 60));
  const frac = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    let h = 0;
    for (let y = y0; y < y1; y += step)
      for (let x = x0; x < x1; x += step) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        n++;
        if (isHair(x, y)) h++;
      }
    return n ? h / n : 0;
  };
  // how much hair stands above the forehead: up from the forehead's top while it stays hair (a
  // gap of more than a few steps ends it)
  const crownAt = (x: number) => {
    let y0 = top[1];
    let gap = 0;
    let last = top[1];
    for (let y = top[1]; y > Math.max(0, top[1] - faceH * 1.2); y -= step) {
      if (isHair(x, y)) {
        last = y;
        gap = 0;
      } else if (++gap > 4) break;
      y0 = y;
    }
    void y0;
    return (top[1] - last) / faceH;
  };
  const above = Math.max(crownAt(cx), crownAt(cx - faceW * 0.15), crownAt(cx + faceW * 0.15));
  const onTop = frac(left[0] + faceW * 0.1, top[1] - faceH * 0.3, right[0] - faceW * 0.1, top[1]);
  let wide = 0;
  const yW = top[1] + faceH * 0.15;
  for (let x = 0; x < img.w; x += step) if (isHair(x, yW)) wide++;
  const width = (wide * step) / faceW;
  // how low it falls beside the face
  let low = -Infinity;
  for (let y = Math.round(top[1]); y < img.h; y += step) {
    const besideL = isHair(left[0] - faceW * 0.1, y) || isHair(left[0] - faceW * 0.22, y);
    const besideR = isHair(right[0] + faceW * 0.1, y) || isHair(right[0] + faceW * 0.22, y);
    if (besideL || besideR) low = y;
  }
  const reachesEdge = low >= img.h - step * 3;
  const len = Number.isFinite(low) ? (low - chin[1]) / faceH : -1;
  // hair over the forehead, just above the brows (left and right halves, and the middle)
  const browTop = Math.min(at(105)[1], at(334)[1]);
  const band = [browTop - faceH * 0.2, browTop - faceH * 0.04] as const;
  const fl = frac(at(70)[0], band[0], cx, band[1]);
  const fr = frac(cx, band[0], at(300)[0], band[1]);
  const fringeCover = (fl + fr) / 2;
  const centre = frac(cx - faceW * 0.08, band[0], cx + faceW * 0.08, band[1]);
  // curls: crinkly texture inside the hair against straight hair's smooth runs
  const curl = texture(
    img,
    left[0] - faceW * 0.4,
    top[1] - faceH * 0.6,
    right[0] + faceW * 0.4,
    chin[1] + faceH * 0.4,
    2,
    (x, y) => isHair(x, y) && isHair(x - 3, y) && isHair(x + 3, y) && isHair(x, y - 3) && isHair(x, y + 3),
  );
  const hairPx: Lab[] = [];
  for (let y = Math.max(0, top[1] - faceH * 0.6); y < top[1] + faceH * 0.6; y += step)
    for (let x = left[0] - faceW * 0.4; x < right[0] + faceW * 0.4; x += step) {
      if (!isHair(x, y) || !isHair(x - 2, y) || !isHair(x + 2, y)) continue;
      hairPx.push(...patch(img, x, y, 0));
    }
  Object.assign(dbg, { above, onTop, width, len, reachesEdge: reachesEdge ? 1 : 0, fringeCover, fl, fr, centre, curl, hairN: hairPx.length });
  const seen: Seen[] = [];
  const cfg: Partial<AvatarCfg> = {};
  // bald, or shaved close: almost nothing on top
  if (onTop < 0.14) {
    cfg.hair = "bald";
    seen.push("hair");
    return { cfg, seen };
  }
  if (hairPx.length > 30) {
    // the middle of the hair's lightness (not its shine, not its shadow)
    const ls = hairPx.map((l) => l[0]).sort((a, b) => a - b);
    const lo = ls[Math.floor(ls.length * 0.3)];
    const hi = ls[Math.floor(ls.length * 0.75)];
    const mid = hairPx.filter((l) => l[0] >= lo && l[0] <= hi);
    const lab = labMedian(mid);
    Object.assign(dbg, { hairL: lab[0], hairA: lab[1], hairB: lab[2] });
    const dyed = chroma(lab) > 28;
    cfg.hairColor = dyed
      ? nearest(
          lab,
          HAIR_COLORS.map((h) => h[0]),
        )
      : hairShade(lab);
    seen.push("hairColor");
  }
  // (texture alone can't tell curls in a phone photo; hair that stands out wide round the face can)
  const curly = width > 0.9 && len > -0.3;
  dbg.curly = curly ? 1 : 0;
  if (onTop < 0.3) cfg.hair = "buzz";
  else if (width > 1.6 && above > 0.38) cfg.hair = "afro";
  else if (reachesEdge || len > 0.35) cfg.hair = curly ? "wavy" : "long";
  else if (len > -0.3) cfg.hair = curly ? "curly" : "bob";
  else cfg.hair = curly ? "curly" : "short";
  seen.push("hair");
  if (cfg.hair !== "buzz" && cfg.hair !== "afro") {
    if (fringeCover > 0.55) cfg.fringe = "full";
    else if (fringeCover > 0.24) cfg.fringe = Math.abs(fl - fr) > 0.25 ? "swept" : centre < 0.15 ? "middle" : "wisps";
    else cfg.fringe = cfg.hair === "short" || cfg.hair === "curly" ? (Math.abs(fl - fr) > 0.08 ? "swept" : "side") : "middle";
    seen.push("fringe");
  }
  return { cfg, seen };
}

/** A natural hair color from how light it photographs (photos make hair darker than it looks). */
function hairShade(lab: Lab): number {
  const [L, a, b] = lab;
  const c = Math.hypot(a, b);
  // grey and white: light with little color
  if (L > 55 && c < 12) return L > 70 ? 8 : 7;
  if (L > 50) return c > 20 ? 5 : 6;
  // red and copper: plenty of red for their lightness
  if (a > 10 && a > b * 0.75 && L > 20) return L > 32 ? 4 : 3;
  if (L > 34) return b > 18 ? 5 : 2;
  if (L > 24) return 2;
  if (L > 15) return 1;
  return 0;
}

function readGlasses(img: Px, pts: P[], faceW: number, skin: Lab, dbg: Record<string, number>): AvatarCfg["glasses"] | null {
  const at = (i: number) => pts[i];
  // the eye regions' darkness (sunglasses hide the eyes)
  const eyeDark = [468, 473].map((c) => labMedian(patch(img, at(c)[0], at(c)[1], Math.round(faceW * 0.05)))[0]);
  const dark = (eyeDark[0] + eyeDark[1]) / 2;
  let rim = 0;
  let ctrl = 0;
  for (const [c, lid] of [
    [468, 145],
    [473, 374],
  ] as const) {
    const x = at(c)[0];
    const yLid = at(lid)[1];
    const w = faceW * 0.12;
    rim += edges(img, x - w, yLid + faceW * 0.03, x + w, yLid + faceW * 0.11, "h");
    ctrl += edges(img, x - w, yLid + faceW * 0.16, x + w, yLid + faceW * 0.24, "h");
  }
  const b = at(168);
  const bridge = edges(img, b[0] - faceW * 0.04, b[1] - faceW * 0.02, b[0] + faceW * 0.04, at(6)[1], "h");
  const cheek = edges(img, at(50)[0] - faceW * 0.04, at(50)[1] - faceW * 0.04, at(50)[0] + faceW * 0.04, at(50)[1] + faceW * 0.04, "h");
  Object.assign(dbg, { eyeDark: dark, rim, ctrl, bridge, cheek, rimScore: rim / Math.max(1, ctrl), bridgeScore: bridge / Math.max(1, cheek) });
  // (cautious: a wrong pair of glasses is worse than none, which the player adds in a tap)
  if (dark < 16 && dark < skin[0] * 0.28) return "sun";
  const score = rim / Math.max(1, ctrl);
  const bridged = bridge / Math.max(1, cheek);
  if (score > 2.8 && bridged > 2.6 && rim > 12) return bridged > 4 ? "bold" : "square";
  return null;
}

function readBeard(img: Px, pts: P[], faceW: number, skin: Lab, dbg: Record<string, number>): AvatarCfg["beard"] {
  const at = (i: number) => pts[i];
  const r = Math.max(2, Math.round(faceW * 0.03));
  const box = (i: number, k = 0.06) => [at(i)[0] - faceW * k, at(i)[1] - faceW * k, at(i)[0] + faceW * k, at(i)[1] + faceW * k] as const;
  // hair is crinkly next to skin: texture on the chin, the upper lip and the jaw against the cheek
  const tex = (i: number, k = 0.05) => texture(img, ...box(i, k), 1);
  const cheek = (tex(50) + tex(280)) / 2;
  const chinT = tex(199, 0.05);
  const lipT = tex(164, 0.035);
  const jawT = (tex(136, 0.05) + tex(365, 0.05)) / 2;
  const lip = labMedian([164, 92, 322].flatMap((i) => patch(img, at(i)[0], at(i)[1] - faceW * 0.01, r)));
  const chinL = labMedian([199, 175].flatMap((i) => patch(img, at(i)[0], at(i)[1], r)));
  Object.assign(dbg, { cheekT: cheek, chinT, lipT, jawT, lipD: skin[0] - lip[0], chinD: skin[0] - chinL[0] });
  // (only a plain beard is read: a shadow under the nose or chin isn't a moustache)
  const k = (t: number) => t / Math.max(0.5, cheek);
  if (skin[0] - chinL[0] > 11 && skin[0] - lip[0] > 11 && chinT > 1.5 && k(chinT) > 1.8) return k(jawT) > 1.4 ? "full" : "goatee";
  return "none";
}
