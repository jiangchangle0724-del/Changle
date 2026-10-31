// Pictures on the phone: a photo made small enough to send, and a drawing cut into the two
// pictures the site keeps (the whole figure, and the round avatar from its top).

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
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q));
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
 * A drawing as the site keeps it: the whole figure 600 px wide, and the round avatar (320 px)
 * cut from the top middle, where the drawing puts the head.
 */
export async function finishFigure(drawing: Blob): Promise<{ full: Blob; round: Blob }> {
  const img = await loadImage(drawing);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = Math.min(1, 600 / W);
  const f = canvas(W * k, H * k);
  f.ctx.drawImage(img, 0, 0, f.c.width, f.c.height);
  const side = Math.min(W * 0.72, H);
  const r = canvas(320, 320);
  r.ctx.drawImage(img, (W - side) / 2, Math.min(W * 0.03, H - side), side, side, 0, 0, 320, 320);
  return { full: await toJpeg(f.c), round: await toJpeg(r.c) };
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
