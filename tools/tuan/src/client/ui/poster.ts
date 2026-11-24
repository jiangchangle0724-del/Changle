// A group buy as a picture to send on: what it is, when it closes, a few of the goods, and a code to
// scan (or, in WeChat, to press and hold) that opens it. Drawn on the merchant's phone, from the
// page's own colours and fonts; nothing is sent anywhere. Only the merchant's pages load this.

import { encode } from "uqr";
import { photoUrl } from "../api";

export interface PosterParts {
  shop: string;
  title: string;
  /** "截单 11月21日 周五 20:00" */
  closes: string;
  /** What can be had, in the page's order: the poster shows the first two or four that fit. */
  items: { name: string; price: string; photo: string | null }[];
  /** "还有 12 样": the goods the poster has no room for. */
  more: (n: number) => string;
  /** The group buy's address, which the code holds and the foot shows. */
  link: string;
  /** "长按识别二维码" */
  scan: string;
  /** "跟一单" */
  brand: string;
}

const W = 1080;
const H = 1440;
const PAD = 72;

/** The page's own colours and fonts (tokens.css), as the canvas needs them: plain values. */
function look() {
  const app = document.getElementById("app") ?? document.documentElement;
  const css = getComputedStyle(app);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { bg: v("--color-bg"), sheet: v("--color-sheet"), surface: v("--color-surface"), raised: v("--color-raised"), text: v("--color-text"), text2: v("--color-text-2"), gel: v("--gel"), onGel: v("--on-gel"), display: v("--font-display"), body: v("--font-text") || v("--font-zh") };
}

/** Lines that fit `width`: Chinese breaks between any two characters, other words at their spaces; past `most` lines the last ends in "…". */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number, most: number): string[] {
  const units = text.match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+\s*|\s+/g) ?? [];
  const out: string[] = [];
  let line = "";
  for (const unit of units) {
    if (ctx.measureText(line + unit).width <= width || !line) {
      line += unit;
      // a word longer than the line is cut where it runs out
      while (ctx.measureText(line).width > width && line.length > 1) {
        let fit = line.length - 1;
        while (fit > 1 && ctx.measureText(line.slice(0, fit)).width > width) fit -= 1;
        out.push(line.slice(0, fit));
        line = line.slice(fit);
      }
    } else {
      out.push(line.trimEnd());
      line = unit.trimStart();
    }
  }
  if (line.trim()) out.push(line.trimEnd());
  if (out.length <= most) return out;
  const kept = out.slice(0, most);
  let last = kept[most - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[most - 1] = `${last}…`;
  return kept;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function picture(id: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => done(img);
    img.onerror = () => done(null);
    // (the large copy: the small one is a square for the list, too small for a card this size)
    img.src = photoUrl(id, false);
  });
}

/** The poster, as a PNG. */
export async function drawPoster(parts: PosterParts): Promise<Blob> {
  const c = look();
  const display = (weight: number, size: number) => `${weight} ${size}px ${c.display}`;
  const body = (weight: number, size: number) => `${weight} ${size}px ${c.body}`;
  const shown = parts.items.slice(0, 4);
  const QR = 280;
  const footTop = H - PAD - QR;
  const pictures = await Promise.all(shown.map((item) => (item.photo ? picture(item.photo) : Promise.resolve(null))));
  // the fonts the page has, loaded for the words the poster draws
  const said = [parts.shop, parts.title, parts.closes, parts.scan, parts.brand, parts.more(0), ...shown.flatMap((item) => [item.name, item.price])].join("");
  await Promise.allSettled([document.fonts.load(display(800, 76), said), document.fonts.load(body(700, 34), said)]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.textBaseline = "top";

  // the night, and the tool's light from above
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -260, 40, W / 2, -260, 1100);
  glow.addColorStop(0, c.gel);
  glow.addColorStop(1, c.bg);
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  let y = PAD;
  ctx.fillStyle = c.text2;
  ctx.font = body(700, 34);
  for (const line of lines(ctx, parts.shop, W - PAD * 2, 1)) ctx.fillText(line, PAD, y);
  y += 60;
  ctx.fillStyle = c.text;
  ctx.font = display(800, 72);
  for (const line of lines(ctx, parts.title, W - PAD * 2, 3)) {
    ctx.fillText(line, PAD, y);
    y += 92;
  }
  y += 12;
  ctx.fillStyle = c.gel;
  ctx.font = body(800, 36);
  ctx.fillText(lines(ctx, parts.closes, W - PAD * 2, 1)[0] ?? "", PAD, y);
  y += 84;

  // the goods, two by two: two rows when the title leaves room for them, else one; the rest are counted
  const gap = 28;
  const cardW = (W - PAD * 2 - gap) / 2;
  const MORE = 54;
  const room = footTop - 48 - y;
  const rows = shown.length > 2 && room - MORE >= 2 * 296 + gap ? 2 : shown.length ? 1 : 0;
  const drawn = shown.slice(0, rows * 2);
  const left = parts.items.length - drawn.length;
  // (one row, under a long title, may be taller: its pictures take the room the second row would have)
  const cardH = rows ? Math.min(rows === 1 ? 440 : 330, Math.floor((room - (left > 0 ? MORE : 0) - (rows - 1) * gap) / rows)) : 0;
  drawn.forEach((item, at) => {
    const x = PAD + (at % 2) * (cardW + gap);
    const top = y + Math.floor(at / 2) * (cardH + gap);
    ctx.fillStyle = c.sheet;
    rounded(ctx, x, top, cardW, cardH, 32);
    ctx.fill();
    const pw = cardW - 32;
    const ph = cardH - 172;
    const px = x + 16;
    const py = top + 16;
    const img = pictures[at];
    ctx.save();
    rounded(ctx, px, py, pw, ph, 22);
    ctx.clip();
    if (img) {
      const scale = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
      const sw = pw / scale;
      const sh = ph / scale;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, px, py, pw, ph);
    } else {
      ctx.fillStyle = c.raised;
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = c.gel;
      ctx.font = display(800, 72);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText([...item.name.trim()][0] ?? "", px + pw / 2, py + ph / 2 + 4);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }
    ctx.restore();
    // the name, two lines at most, and the price at the card's foot
    ctx.fillStyle = c.text;
    ctx.font = body(700, 30);
    lines(ctx, item.name, cardW - 56, 2).forEach((line, n) => ctx.fillText(line, x + 28, py + ph + 18 + n * 40));
    ctx.fillStyle = c.gel;
    ctx.font = body(800, 32);
    ctx.fillText(lines(ctx, item.price, cardW - 56, 1)[0] ?? "", x + 28, top + cardH - 26 - 34);
  });
  y += rows * cardH + Math.max(0, rows - 1) * gap;
  if (left > 0) {
    y += 24;
    ctx.fillStyle = c.text2;
    ctx.font = body(700, 30);
    ctx.fillText(lines(ctx, parts.more(left), W - PAD * 2, 1)[0] ?? "", PAD, y);
  }

  // the code to scan, dark on light as scanners want it, at the foot
  const qr = encode(parts.link, { ecc: "M", border: 0 });
  const box = QR;
  const bx = W - PAD - box;
  const by = footTop;
  ctx.fillStyle = c.text;
  rounded(ctx, bx, by, box, box, 28);
  ctx.fill();
  const inner = box - 44;
  const cell = inner / qr.size;
  ctx.fillStyle = c.bg;
  qr.data.forEach((row, r) =>
    row.forEach((dark, col) => {
      if (dark) ctx.fillRect(bx + 22 + col * cell, by + 22 + r * cell, Math.ceil(cell), Math.ceil(cell));
    }),
  );
  ctx.fillStyle = c.text;
  ctx.font = display(800, 52);
  ctx.fillText(parts.brand, PAD, by + 40);
  ctx.fillStyle = c.text2;
  ctx.font = body(700, 32);
  lines(ctx, parts.scan, bx - PAD - 32, 2).forEach((line, n) => ctx.fillText(line, PAD, by + 128 + n * 44));
  ctx.font = body(600, 26);
  ctx.fillText(lines(ctx, parts.link.replace(/^https?:\/\//, ""), bx - PAD - 32, 1)[0] ?? "", PAD, by + box - 30);

  return new Promise((done, fail) => canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error("no picture"))), "image/png"));
}
