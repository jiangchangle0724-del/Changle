/**
 * 一本正经's picture for the end of the night: the words the table learned, tonight's titles, and a
 * code to come and play. Drawn on a canvas in the phone, nothing sent anywhere until the player
 * shares it: 1080 wide, as tall as the words need and never shorter than 3:4 (the shape Xiaohongshu
 * shows whole). Colors and fonts are the site's own, read off its tokens. Loaded only when a player
 * asks for the picture (it brings the QR code maker with it).
 */
import QRCode from "qrcode";

export type Picture = {
  lang: "zh" | "en";
  /** the game's name, and the lines under it */
  title: string;
  subtitle: string;
  date: string;
  words: { term: string; definition: string }[];
  titlesHeading: string;
  /** each title: its picture, its name, who earned it, the line under it */
  titles: { art: string; label: string; names: string; note: string }[];
  scan: string;
  /** where the code leads, and the address printed beside it */
  url: string;
  site: string;
  backdrop: string;
  /** the game's own light */
  gel: string;
};

const W = 1080;
const PAD = 72;
/** 3:4 */
const MIN_H = 1440;
const INNER = W - PAD * 2;

type Ctx = CanvasRenderingContext2D;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`picture: ${src}`));
    img.src = src;
  });
}

/** A rounded rectangle's path. */
function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chinese punctuation that may not start a line: it stays at the end of the one before. */
const NO_START = /^[，。、；：！？）」』”’》〉…,.;:!?)\]]/;

/** Lines of text no wider than `max`: Chinese breaks between characters, English between words. */
export function wrap(ctx: Ctx, text: string, max: number): string[] {
  const tokens = text.match(/[⺀-鿿豈-﫿　-〿＀-￯]|[^\s⺀-鿿豈-﫿　-〿＀-￯]+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const tk of tokens) {
    const next = line + tk;
    if (!line.trim() || ctx.measureText(next).width <= max || NO_START.test(tk)) {
      line = next;
      continue;
    }
    lines.push(line.trimEnd());
    line = tk.trimStart();
  }
  if (line.trim()) lines.push(line.trimEnd());
  // a single word wider than the line (a long English word): cut it by letters
  return lines.flatMap((l) => {
    if (ctx.measureText(l).width <= max) return [l];
    const out: string[] = [];
    let part = "";
    for (const ch of l) {
      if (part && ctx.measureText(part + ch).width > max) {
        out.push(part);
        part = "";
      }
      part += ch;
    }
    return part ? [...out, part] : out;
  });
}

/** The largest size from `start` down to `min` at which the text fits on one line. */
function fit(ctx: Ctx, text: string, weight: number, family: string, max: number, start: number, min: number) {
  let size = start;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= max) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

export async function drawPicture(p: Picture): Promise<HTMLCanvasElement> {
  const css = getComputedStyle(document.documentElement);
  const tok = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const C = {
    night: tok("--night", "#0e0c22"),
    card: tok("--dusk-2", "#221f44"),
    text: tok("--color-text", "#f5f4fd"),
    text2: tok("--color-text-2", "#b6b4d0"),
    line: tok("--color-line-soft", "rgba(255,255,255,0.1)"),
  };
  const display = tok("--font-display", "sans-serif");
  const body = tok("--font-text", "sans-serif");

  // the fonts first, or the first picture of the night comes out in the fallback
  try {
    await Promise.all([
      document.fonts.load(`700 80px ${display}`, p.title + p.words.map((w) => w.term).join("")),
      document.fonts.load(`400 34px ${body}`, p.subtitle + p.words.map((w) => w.definition).join("")),
      document.fonts.load(`700 40px ${body}`, p.titles.map((x) => x.names).join("")),
    ]);
  } catch {
    /* the fallback fonts draw too */
  }
  const [backdrop, ...arts] = await Promise.all([load(p.backdrop), ...p.titles.map((x) => load(x.art))]);

  // measure everything once, then draw at the measured places
  const scratch = document.createElement("canvas").getContext("2d")!;
  const titleSize = fit(scratch, p.title, 700, display, INNER, p.lang === "zh" ? 96 : 76, 44);
  // a word's card: its lines and where each sits from the card's top
  const PAD_X = 52;
  const PAD_Y = 36;
  const TEXT_W = INNER - PAD_X * 2;
  const DEF = 34;
  const DEF_LH = 52;
  const words = p.words.map((w) => {
    const termSize = fit(scratch, w.term, 700, display, TEXT_W, 56, 28);
    const termLines = scratch.measureText(w.term).width > TEXT_W ? wrap(scratch, w.term, TEXT_W) : [w.term];
    scratch.font = `400 ${DEF}px ${body}`;
    const defLines = wrap(scratch, w.definition, TEXT_W);
    const termAt = termLines.map((_, i) => PAD_Y + termSize * 0.92 + i * termSize * 1.2);
    const lastTerm = termAt[termAt.length - 1];
    const defAt = defLines.map((_, i) => lastTerm + termSize * 0.28 + 16 + DEF * 1.05 + i * DEF_LH);
    const h = (defAt[defAt.length - 1] ?? lastTerm) + DEF * 0.3 + PAD_Y;
    return { termSize, termLines, termAt, defLines, defAt, h };
  });
  const WORDS_TOP = 600;
  const GAP = 22;
  const wordsH = words.reduce((n, w) => n + w.h, 0) + GAP * Math.max(0, words.length - 1);
  const ROW = 152;
  const titlesH = p.titles.length ? 64 + 34 + p.titles.length * ROW : 0;
  const FOOT = 330;
  const H = Math.max(MIN_H, Math.ceil(WORDS_TOP + wordsH + titlesH + FOOT + PAD));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // the room: night, the game's own scene fading into it, a little of the game's light
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const bh = (backdrop.naturalHeight / backdrop.naturalWidth) * W;
  ctx.globalAlpha = 0.6;
  ctx.drawImage(backdrop, 0, -40, W, bh);
  ctx.globalAlpha = 1;
  // the scene fades out well before it ends, so its edge never shows
  const FADE = 1150;
  const fade = ctx.createLinearGradient(0, 0, 0, FADE);
  fade.addColorStop(0, C.night);
  fade.addColorStop(0.07, "rgba(0,0,0,0)");
  fade.addColorStop(0.35, "rgba(0,0,0,0)");
  fade.addColorStop(1, C.night);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, FADE);
  ctx.fillStyle = C.night;
  ctx.fillRect(0, FADE, W, H - FADE);
  const glow = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, W);
  glow.addColorStop(0, p.gel + "33");
  glow.addColorStop(1, p.gel + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // the name, the night, the date
  ctx.textAlign = "center";
  ctx.fillStyle = p.gel;
  ctx.font = `700 ${titleSize}px ${display}`;
  ctx.fillText(p.title, W / 2, 176);
  ctx.fillStyle = C.text;
  ctx.font = `700 46px ${body}`;
  ctx.fillText(p.subtitle, W / 2, 252);
  ctx.fillStyle = C.text2;
  ctx.font = `400 30px ${body}`;
  ctx.fillText(p.date, W / 2, 304);
  ctx.textAlign = "left";

  // the words
  let y = WORDS_TOP;
  words.forEach((w, i) => {
    ctx.fillStyle = C.card;
    ctx.globalAlpha = 0.94;
    rounded(ctx, PAD, y, INNER, w.h, 28);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.gel;
    rounded(ctx, PAD, y + 26, 8, w.h - 52, 4);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.font = `700 ${w.termSize}px ${display}`;
    w.termLines.forEach((l, k) => ctx.fillText(l, PAD + PAD_X, y + w.termAt[k]));
    ctx.fillStyle = C.text2;
    ctx.font = `400 ${DEF}px ${body}`;
    w.defLines.forEach((l, k) => ctx.fillText(l, PAD + PAD_X, y + w.defAt[k]));
    y += w.h + (i < words.length - 1 ? GAP : 0);
  });

  // tonight's titles
  if (p.titles.length) {
    y += 64;
    ctx.fillStyle = C.text2;
    ctx.font = `600 30px ${body}`;
    ctx.fillText(p.titlesHeading, PAD, y + 26);
    y += 34;
    p.titles.forEach((x, i) => {
      const cy = y + ROW / 2 + 8;
      const r = 56;
      ctx.save();
      ctx.beginPath();
      ctx.arc(PAD + r, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(arts[i], PAD, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = p.gel;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(PAD + r, cy, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      const tx = PAD + r * 2 + 32;
      const tw = W - PAD - tx;
      ctx.fillStyle = p.gel;
      ctx.font = `700 28px ${display}`;
      ctx.fillText(x.label, tx, cy - 32);
      ctx.fillStyle = C.text;
      fit(ctx, x.names, 700, body, tw, 42, 26);
      ctx.fillText(x.names, tx, cy + 16);
      ctx.fillStyle = C.text2;
      ctx.font = `400 28px ${body}`;
      ctx.fillText(x.note, tx, cy + 56);
      y += ROW;
    });
  }

  // the way in: a code to scan, and the address
  const fy = H - PAD - 232;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, fy - 48);
  ctx.lineTo(W - PAD, fy - 48);
  ctx.stroke();
  ctx.fillStyle = C.text;
  rounded(ctx, PAD, fy, 232, 232, 24);
  ctx.fill();
  const qr = QRCode.create(p.url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = Math.floor(200 / n);
  const q0 = PAD + (232 - cell * n) / 2;
  const q1 = fy + (232 - cell * n) / 2;
  ctx.fillStyle = C.night;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) if (qr.modules.get(row, col)) ctx.fillRect(q0 + col * cell, q1 + row * cell, cell, cell);
  }
  const fx = PAD + 232 + 44;
  ctx.fillStyle = C.text;
  fit(ctx, p.scan, 700, display, W - PAD - fx, 48, 30);
  ctx.fillText(p.scan, fx, fy + 104);
  ctx.fillStyle = p.gel;
  ctx.font = `600 34px ${body}`;
  ctx.fillText(p.site, fx, fy + 160);
  return canvas;
}
