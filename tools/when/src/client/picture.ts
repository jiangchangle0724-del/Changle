// The two pictures people pass around in the group chat: the invitation (what it is, which days,
// a code to scan) and the result (when it is, who can make it, the same code). Drawn on a canvas
// in the phone when someone asks for one, 1080 × 1440: the shape of the backgrounds in art/, whose
// top and bottom fifths hold the drawing and whose middle is left dark for what is drawn here.
// The words come from the page; the colors and fonts are changle.ca's, read off its tokens.
// Nothing is sent anywhere.
import qrcode from "qrcode-generator";

export type Picture = {
  kind: "invite" | "result";
  /** the tool's name, small, over everything */
  brand: string;
  /** the gathering's name, as typed */
  title: string;
  /** the result only: the small line over the time ("the time is set") */
  label?: string;
  /** the invitation's question; the result's day and part */
  headline: string;
  /** which days (the invitation); who can make it (the result) */
  detail: string;
  /** under the code: what scanning it does */
  scan: string;
  /** where the code leads, and the address printed under it */
  url: string;
  site: string;
  /** the background's address */
  backdrop: string;
};

export const W = 1080;
export const H = 1440;
const PAD = 72;
const INNER = W - PAD * 2;
// The backgrounds keep y = 288 to 1151 empty: everything drawn here stays inside that.
const BRAND_AT = 362;
const TEXT_TOP = 404;
const CARD_BOTTOM = 1040;
const SCAN_AT = 1094;
const SITE_AT = 1138;
/** The side of the code's white card. The invitation is about the code; the result is about the time. */
const CARD = { invite: 300, result: 240 } as const;
/** Between the words and the card. */
const CARD_GAP = 40;

/**
 * Where the code sits for a code of this many modules: its top left corner and the side of one
 * module. The card around it is the quiet white border a scanner needs (four modules or more).
 */
export function codePlace(kind: Picture["kind"], modules: number): { left: number; top: number; cell: number } {
  const card = CARD[kind];
  const cell = Math.floor(card / (modules + 8));
  const side = cell * modules;
  return { cell, left: Math.round((W - side) / 2), top: CARD_BOTTOM - card + Math.round((card - side) / 2) };
}

type Ctx = CanvasRenderingContext2D;
type Block = { text: string; display: boolean; weight: number; size: number; min: number; lines: number; color: string; gap: number };
type Colors = { night: string; paper: string; text: string; text2: string; gel: string };

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`picture: ${src}`));
    img.src = src;
  });
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chinese, Japanese and Korean text, and the full-width punctuation that goes with it: a line may break between any two. */
const wide = (ch: string) => (ch.codePointAt(0) ?? 0) >= 0x2e80;
/** Punctuation that never starts a line: it stays at the end of the one before. */
const NO_START = "，。、；：！？）」』”’》〉…,.;:!?)]";

/** The text in lines no wider than `max`: Chinese breaks between characters, English between words, a word too long for a line between its letters. */
export function wrap(measure: (text: string) => number, text: string, max: number): string[] {
  // the pieces a line can break between: one wide character, a run of spaces, or a word
  const pieces: string[] = [];
  for (const ch of text.replace(/\s+/g, " ").trim()) {
    const last = pieces[pieces.length - 1];
    if (last !== undefined && !wide(ch) && !wide(last) && (ch === " ") === (last === " ")) pieces[pieces.length - 1] = last + ch;
    else pieces.push(ch);
  }
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
  };
  for (const piece of pieces) {
    if (!line.trim() || measure((line + piece).trimEnd()) <= max || NO_START.includes(piece[0])) {
      line += piece;
      continue;
    }
    push();
    if (piece !== " ") line = piece;
  }
  push();
  // a single word wider than the line: cut it between letters (never before punctuation that can't start one)
  return lines.flatMap((whole) => {
    if (measure(whole) <= max) return [whole];
    const parts: string[] = [];
    let part = "";
    for (const ch of whole) {
      if (part && measure(part + ch) > max && !NO_START.includes(ch)) {
        parts.push(part);
        part = "";
      }
      part += ch;
    }
    return part ? [...parts, part] : parts;
  });
}

/**
 * How a block is set: on one line as large as it goes (down to three quarters of its size), or
 * wrapped as large as its lines allow; text too long even at its smallest is cut with an ellipsis.
 */
function set(ctx: Ctx, block: Block, family: string, scale: number): { size: number; lines: string[] } {
  const start = Math.round(block.size * scale);
  const min = Math.min(start, Math.round(block.min * scale));
  const measure = (text: string) => ctx.measureText(text).width;
  const at = (size: number) => (ctx.font = `${block.weight} ${size}px ${family}`);
  for (let size = start; size >= Math.max(min, start * 0.75); size -= 2) {
    at(size);
    if (measure(block.text) <= INNER) return { size, lines: [block.text] };
  }
  for (let size = start; size >= min; size -= 2) {
    at(size);
    const lines = wrap(measure, block.text, INNER);
    if (lines.length <= block.lines) return { size, lines };
  }
  at(min);
  const lines = wrap(measure, block.text, INNER).slice(0, block.lines);
  const last = [...(lines.pop() ?? "")];
  while (last.length && measure(`${last.join("")}…`) > INNER) last.pop();
  return { size: min, lines: [...lines, `${last.join("").trimEnd()}…`] };
}

const leading = (block: Block, size: number) => size * (block.display ? 1.24 : 1.4);

/** The words between the name at the top and the code: what each says, and how big it may be. */
function blocks(p: Picture, C: Colors): Block[] {
  if (p.kind === "invite") {
    return [
      { text: p.title, display: true, weight: 800, size: 92, min: 54, lines: 2, color: C.text, gap: 34 },
      { text: p.headline, display: false, weight: 700, size: 48, min: 36, lines: 2, color: C.gel, gap: 16 },
      { text: p.detail, display: false, weight: 500, size: 38, min: 30, lines: 2, color: C.text2, gap: 0 },
    ];
  }
  return [
    { text: p.title, display: true, weight: 700, size: 56, min: 40, lines: 2, color: C.text, gap: 30 },
    { text: p.label ?? "", display: false, weight: 600, size: 34, min: 28, lines: 1, color: C.text2, gap: 12 },
    { text: p.headline, display: true, weight: 800, size: 92, min: 52, lines: 2, color: C.gel, gap: 26 },
    { text: p.detail, display: false, weight: 500, size: 38, min: 30, lines: 3, color: C.text, gap: 0 },
  ].filter((block) => block.text);
}

export async function drawPicture(p: Picture): Promise<HTMLCanvasElement> {
  // the page's own colors and fonts (#app carries the tool's amber light)
  const css = getComputedStyle(document.getElementById("app") ?? document.documentElement);
  const tok = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const C: Colors = {
    night: tok("--night", "#0e0c22"),
    paper: tok("--color-paper", "#ffffff"),
    text: tok("--color-text", "#f5f4fd"),
    text2: tok("--color-text-2", "#b6b4d0"),
    gel: tok("--gel", "#ffb82e"),
  };
  const display = tok("--font-display", "sans-serif");
  const body = tok("--font-text", "sans-serif");

  // the fonts first, or the first picture comes out in the fallback
  try {
    await Promise.all([document.fonts.load(`800 80px ${display}`, p.brand + p.title + p.headline), document.fonts.load(`500 40px ${body}`, p.headline + p.detail + p.scan + p.site), document.fonts.load(`700 40px ${body}`, p.headline)]);
  } catch {
    /* the fallback fonts draw too */
  }
  // without its background (the phone is offline) the picture is still worth having
  const backdrop = await load(p.backdrop).catch(() => null);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("picture: no canvas");
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // the tool's name
  ctx.fillStyle = C.gel;
  ctx.font = `700 30px ${display}`;
  ctx.fillText(p.brand, W / 2, BRAND_AT);

  // the words, set to fit between the name and the code's card: smaller all round if they must be
  const card = CARD[p.kind];
  const room = CARD_BOTTOM - card - CARD_GAP - TEXT_TOP;
  const all = blocks(p, C);
  let scale = 1;
  let setting = all.map((block) => set(ctx, block, block.display ? display : body, scale));
  const height = () => all.reduce((sum, block, i) => sum + setting[i].lines.length * leading(block, setting[i].size) + (i < all.length - 1 ? block.gap * scale : 0), 0);
  for (let tries = 0; tries < 4 && height() > room; tries++) {
    scale *= room / height();
    setting = all.map((block) => set(ctx, block, block.display ? display : body, scale));
  }
  let y = TEXT_TOP + Math.max(0, (room - height()) / 2);
  all.forEach((block, i) => {
    const { size, lines } = setting[i];
    const lh = leading(block, size);
    ctx.fillStyle = block.color;
    ctx.font = `${block.weight} ${size}px ${block.display ? display : body}`;
    lines.forEach((line, k) => ctx.fillText(line, W / 2, y + k * lh + (lh - size) / 2 + size * 0.82));
    y += lines.length * lh + block.gap * scale;
  });

  // the code, dark on white card stock
  const qr = qrcode(0, "M");
  qr.addData(p.url);
  qr.make();
  const n = qr.getModuleCount();
  const { left, top, cell } = codePlace(p.kind, n);
  ctx.fillStyle = C.paper;
  rounded(ctx, (W - card) / 2, CARD_BOTTOM - card, card, card, 28);
  ctx.fill();
  ctx.fillStyle = C.night;
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (qr.isDark(row, col)) ctx.fillRect(left + col * cell, top + row * cell, cell, cell);

  // what the code is for, and the address for anyone who would rather type it
  ctx.fillStyle = C.text;
  ctx.font = `500 30px ${body}`;
  const scan = set(ctx, { text: p.scan, display: false, weight: 500, size: 30, min: 22, lines: 1, color: C.text, gap: 0 }, body, 1);
  ctx.font = `500 ${scan.size}px ${body}`;
  ctx.fillText(scan.lines[0], W / 2, SCAN_AT);
  ctx.fillStyle = C.text2;
  const site = set(ctx, { text: p.site, display: false, weight: 500, size: 28, min: 20, lines: 1, color: C.text2, gap: 0 }, body, 1);
  ctx.font = `500 ${site.size}px ${body}`;
  ctx.fillText(site.lines[0], W / 2, SITE_AT);
  return canvas;
}
