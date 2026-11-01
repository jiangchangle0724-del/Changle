// Pictures on the phone: a photo made small enough to send, and a drawing cut into the
// pictures the site keeps (the whole figure, the round avatar from its top, and the figure alone).
import { keyOut } from "./cutout";

export function loadImage(b: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(b);
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(url);
      res(i);
    };
    i.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("image"));
    };
    i.src = url;
  });
}

function toJpeg(c: HTMLCanvasElement, q = 0.88): Promise<Blob> {
  return toBlob(c, "image/jpeg", q);
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), type, q));
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/** A photo for the AI: upright (the browser applies the camera's rotation), at most 1024 px. */
export async function photoForDrawing(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const { c, ctx } = canvas(img.naturalWidth * k, img.naturalHeight * k);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return toJpeg(c, 0.86);
}

/**
 * A drawing as the site keeps it: the whole figure 600 px wide, the round avatar (320 px) cut
 * from the top middle, where the drawing puts the head, and the figure lifted off its backdrop
 * for the games' stages (see cutout.ts).
 */
export async function finishFigure(drawing: Blob): Promise<{ full: Blob; round: Blob; cut: Blob | null }> {
  const img = await loadImage(drawing);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = Math.min(1, 600 / W);
  const f = canvas(W * k, H * k);
  f.ctx.drawImage(img, 0, 0, f.c.width, f.c.height);
  const side = Math.min(W * 0.72, H);
  const r = canvas(320, 320);
  r.ctx.drawImage(img, (W - side) / 2, Math.min(W * 0.03, H - side), side, side, 0, 0, 320, 320);
  let cut: Blob | null = null;
  try {
    cut = await cutFigure(img);
  } catch {
    cut = null; // (the stage then shows the round face instead)
  }
  return { full: await toJpeg(f.c), round: await toJpeg(r.c), cut };
}

/** The figure alone, see-through around it, trimmed to it: WebP where the browser writes it, else PNG. */
export async function cutFigure(src: Blob | HTMLImageElement): Promise<Blob | null> {
  const img = src instanceof Blob ? await loadImage(src) : src;
  for (const tall of [640, 480, 360]) {
    const k = Math.min(1, tall / img.naturalHeight);
    const { c, ctx } = canvas(img.naturalWidth * k, img.naturalHeight * k);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const box = keyOut(data.data, c.width, c.height);
    if (!box) return null;
    ctx.putImageData(data, 0, 0);
    const pad = Math.round(c.width * 0.02);
    const x0 = Math.max(0, box.x0 - pad);
    const y0 = Math.max(0, box.y0 - pad);
    const x1 = Math.min(c.width - 1, box.x1 + pad);
    const y1 = Math.min(c.height - 1, box.y1 + 1);
    const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
    out.ctx.drawImage(c, x0, y0, out.c.width, out.c.height, 0, 0, out.c.width, out.c.height);
    let blob = await toBlob(out.c, "image/webp", 0.9);
    if (blob.type !== "image/webp") blob = await toBlob(out.c, "image/png");
    if (blob.size <= 380_000) return blob;
  }
  return null;
}

/** What PUT /me/figure takes: the pictures as base64, and what was picked. */
export async function figureBody(d: { full: Blob; round: Blob; cut?: Blob | null; choices: unknown }) {
  return {
    full: await blobToB64(d.full),
    round: await blobToB64(d.round),
    mime: "image/jpeg",
    choices: d.choices,
    ...(d.cut ? { cut: await blobToB64(d.cut), cutMime: d.cut.type } : {}),
  };
}

export function blobToB64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}
