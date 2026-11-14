/**
 * Draws the 结清图 on a canvas (picture.ts says what is on it): 1080 pixels wide and as tall as it
 * needs, in the page's own night, its own type, and the tool's amber for the mark at the top and the
 * 两清 stamp, read from the design tokens (src/styles/tokens.css) where the picture is made. Sizes
 * are the page's, three times over: a phone's screen is about 360 wide, a chat app shows the picture
 * about that wide, and the text on it reads at the size it does in 两清.
 *
 * Checked in a browser (scripts/split_check.ts): the picture is saved beside the screens it is shown on.
 */
import type { Picture } from "./picture";
import { W } from "./words";

/** The page's colours and type, as the picture takes them. */
export type Look = { bg: string; text: string; text2: string; text3: string; line: string; amber: string; success: string; display: string; body: string };

const TOKENS: Record<keyof Look, string> = {
  bg: "--color-bg",
  text: "--color-text",
  text2: "--color-text-2",
  text3: "--color-text-3",
  line: "--color-line-soft",
  amber: "--type-tool",
  success: "--color-success",
  display: "--font-display",
  body: "--font-text",
};

/** The page's look, from its tokens. */
export function lookOf(root: Element = document.documentElement): Look {
  const style = getComputedStyle(root);
  return Object.fromEntries(Object.entries(TOKENS).map(([k, token]) => [k, style.getPropertyValue(token).trim()])) as Look;
}

/** The picture's width; everything else is the page's size times U. */
export const WIDTH = 1080;
const U = 3;
const PAD = 28 * U;
const INNER = WIDTH - 2 * PAD;

const font = (weight: number, size: number, family: string) => `${weight} ${size * U}px ${family}`;

/** Wait (a little) for the page's fonts in the weights the picture uses: a canvas draws in whatever has loaded. */
async function fontsFor(look: Look) {
  const faces = [font(700, 13, look.display), font(800, 30, look.display), font(800, 20, look.display), font(400, 14, look.body), font(500, 17, look.body), font(600, 14, look.body), font(700, 18, look.body)];
  const loading = Promise.all(faces.map((f) => document.fonts.load(f, `${W.name.zh} ${W.name.en} $0.`).catch(() => []))).then(() => document.fonts.ready);
  await Promise.race([loading, new Promise((done) => setTimeout(done, 3000))]);
}

/** Text cut to fit a width, ending in … when it had to be cut. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = [...text];
  while (cut.length > 1 && ctx.measureText(`${cut.join("").trimEnd()}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.join("").trimEnd()}…`;
}

/** Han characters and Chinese punctuation, where Chinese text can break between any two of them. */
const HAN = String.raw`\p{Script=Han}\u3000-\u303f\uff00-\uffef`;
/** Pieces of text to lay out: 两清 whole, any other Han character or mark alone, a Latin word, a space. */
const PIECES = new RegExp(`${W.name.zh}|[${HAN}]|[^\\s${HAN}]+|\\s+`, "gu");
/** What never starts a line: a comma, a full stop and the like, which stay at the end of the line before. */
const CLOSING = /^[\u3001\u3002\uff0c\uff1b\uff1a\uff1f\uff01\uff09\u300d\u300f\u300b\u3009\u3011\u2026,.;:?!)]$/u;

/** Text in lines of a width: Chinese breaks between any two characters (not inside 两清, not before a comma or full stop), Latin at spaces; past `most` lines, the last ends in …. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, most: number): string[] {
  const parts = text.match(PIECES) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const part of parts) {
    if (!line.trim() || CLOSING.test(part) || ctx.measureText(line + part).width <= width) {
      line = line.trim() ? line + part : part.trimStart();
      continue;
    }
    lines.push(line.trimEnd());
    line = part.trimStart();
  }
  if (line.trim()) lines.push(line.trimEnd());
  const kept = lines.slice(0, most).map((l) => fit(ctx, l, width + (CLOSING.test(l.slice(-1)) ? ctx.measureText(l.slice(-1)).width : 0)));
  if (lines.length > most) kept[most - 1] = fit(ctx, `${kept[most - 1]}…`, width);
  return kept;
}

/**
 * The picture laid out from the top: drawn on `ctx` when `draw`, otherwise only measured. Returns
 * how tall it is. (Measured first on a scratch canvas, then drawn on one that tall: setting a
 * canvas's size clears it.)
 */
function layout(ctx: CanvasRenderingContext2D, p: Picture, look: Look, draw: boolean): number {
  let y = PAD;
  const text = (s: string, x: number, at: number, colour: string, align: CanvasTextAlign = "left") => {
    if (!draw) return;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.fillText(s, x, at);
  };
  ctx.textBaseline = "top";

  // the mark, in the tool's light
  ctx.font = font(700, 13, look.display);
  text(p.mark, PAD, y, look.amber);
  y += 13 * U * 1.2 + 16 * U;

  // the ledger's name, in two lines at most, and how many transfers settle it
  ctx.font = font(800, 30, look.display);
  for (const line of wrap(ctx, p.name, INNER, 2)) {
    text(line, PAD, y, look.text);
    y += 30 * U * 1.15;
  }
  y += 8 * U;
  ctx.font = font(500, 17, look.body);
  for (const line of wrap(ctx, p.head, INNER, 3)) {
    text(line, PAD, y, look.text2);
    y += 17 * U * 1.4;
  }
  y += 18 * U;

  // the transfers: who pays whom, how much, and whether it is paid
  const rule = (at: number) => {
    if (!draw) return;
    ctx.fillStyle = look.line;
    ctx.fillRect(PAD, at, INNER, U);
  };
  for (const row of p.rows) {
    rule(y);
    y += 16 * U;
    ctx.font = font(800, 20, look.display);
    const amount = ctx.measureText(row.amount).width;
    text(row.amount, WIDTH - PAD, y, row.paid ? look.text2 : look.text, "right");
    ctx.font = font(700, 18, look.body);
    text(fit(ctx, row.who, INNER - amount - 16 * U), PAD, y + U, look.text);
    y += 20 * U * 1.25 + 4 * U;
    ctx.font = font(600, 14, look.body);
    if (row.paid) {
      const h = 14 * U;
      if (draw) {
        ctx.strokeStyle = look.success;
        ctx.lineWidth = 2.5 * U;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(PAD + 0.1 * h, y + 0.55 * h);
        ctx.lineTo(PAD + 0.4 * h, y + 0.85 * h);
        ctx.lineTo(PAD + 0.95 * h, y + 0.2 * h);
        ctx.stroke();
      }
      text(row.status, PAD + h + 6 * U, y, look.success);
    } else {
      text(row.status, PAD, y, look.text2);
    }
    y += 14 * U * 1.3 + 16 * U;
  }
  rule(y);

  // everyone square: the stamp, as the settle tab has it
  if (p.clear) {
    const r = 56 * U;
    y += 28 * U;
    if (draw) {
      ctx.save();
      ctx.translate(WIDTH / 2, y + r);
      ctx.rotate((-6 * Math.PI) / 180);
      ctx.strokeStyle = look.amber;
      ctx.lineWidth = 3 * U;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1.5 * U, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.lineWidth = U;
      ctx.beginPath();
      ctx.arc(0, 0, r - 7.5 * U, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = look.amber;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = font(800, 34, look.display);
      ctx.fillText(W.name.zh, 0, 6 * U);
      ctx.font = font(700, 11, look.display);
      ctx.fillText(W.name.en, 0, 24 * U);
      ctx.restore();
      ctx.textBaseline = "top";
    }
    y += 2 * r + 12 * U;
  }

  // when it was made, and what to go by after that; and where 两清 lives
  y += 22 * U;
  ctx.font = font(400, 14, look.body);
  for (const line of wrap(ctx, p.asOf, INNER, 4)) {
    text(line, PAD, y, look.text2);
    y += 14 * U * 1.5;
  }
  y += 8 * U;
  ctx.font = font(600, 13, look.body);
  text(p.site, PAD, y, look.text3);
  y += 13 * U * 1.3;
  return Math.ceil(y + PAD);
}

/** The picture on a canvas of its own, once the page's fonts have loaded (or a few seconds have passed). */
export async function paint(p: Picture, look: Look): Promise<HTMLCanvasElement> {
  await fontsFor(look);
  const scratch = document.createElement("canvas").getContext("2d");
  if (!scratch) throw new Error("no canvas");
  const height = layout(scratch, p, look, false);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  // the room's light, from the top, as the page has it
  const glow = ctx.createRadialGradient(WIDTH / 2, -WIDTH * 0.2, 0, WIDTH / 2, -WIDTH * 0.2, WIDTH * 0.9);
  glow.addColorStop(0, look.amber);
  glow.addColorStop(1, look.bg);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, Math.min(height, WIDTH));
  ctx.globalAlpha = 1;
  layout(ctx, p, look, true);
  return canvas;
}

/** The canvas as a PNG. */
export const pngOf = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("no picture"))), "image/png"));
