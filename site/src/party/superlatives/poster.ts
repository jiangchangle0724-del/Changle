/**
 * 颁奖海报: the night's awards as one picture to send to the group chat (PosterSheet shows it and
 * hands it over). Drawn on a canvas 1080 wide, as tall as the shelves need, in the page's own
 * colors and fonts; the words come in the phone's language.
 */
import { initialOf } from "../../account/Avatar";
import { GAME_BY_ID } from "../../games/registry";

export type PosterShelf = { name: string; awards: string[]; top: boolean; color: string };
export type Poster = {
  lang: "zh" | "en";
  /** 颁奖典礼 / The Awards */
  heading: string;
  /** the game's name and the date */
  sub: string;
  /** the mind reader's line, if anyone hit */
  mind: string | null;
  /** everyone, the most decorated first */
  shelves: PosterShelf[];
  /** 全场最佳 / MVP */
  topTag: string;
  /** 今晚低调 / Kept a low profile */
  none: string;
  site: string;
};

type Look = { night: string; dusk: string; moon: string; haze: string; gold: string; gel: string; display: string; body: string };

/** The page's look, from its tokens (the gel is the game's own). */
export function lookOf(root: Element = document.documentElement): Look {
  const s = getComputedStyle(root);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return { night: v("--night") || "#0e0c22", dusk: v("--dusk-2") || "#221f44", moon: v("--moon") || "#f5f4fd", haze: v("--haze") || "#b6b4d0", gold: v("--gel-amber") || "#ffb82e", gel: GAME_BY_ID.superlatives.gel, display: v("--font-display") || "sans-serif", body: v("--font-text") || "sans-serif" };
}

export const WIDTH = 1080;
const PAD = 64;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Words cut to a width, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > width) t = t.slice(0, -1);
  return t + "…";
}

/** Words wrapped to a width: by spaces where there are any, by character where there aren't (Chinese). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  const parts = text.includes(" ") ? text.split(" ") : [...text];
  const glue = text.includes(" ") ? " " : "";
  let line = "";
  for (const part of parts) {
    const next = line ? line + glue + part : part;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = part;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lays the poster out, drawing it when `draw` is on, and returns its height: run once to measure,
 * then once more on a canvas that size.
 */
function layout(ctx: CanvasRenderingContext2D, p: Poster, look: Look, draw: boolean): number {
  const W = WIDTH - PAD * 2;
  let y = 0;
  const text = (s: string, x: number, at: number, color: string, align: CanvasTextAlign = "left") => {
    if (!draw) return;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, at);
  };
  const pill = (s: string, x: number, at: number, h: number, padX: number, bg: string, color: string, font: string, align: "left" | "center" = "left") => {
    ctx.font = font;
    const w = ctx.measureText(s).width + padX * 2;
    const left = align === "center" ? x - w / 2 : x;
    if (draw) {
      ctx.fillStyle = bg;
      roundRect(ctx, left, at, w, h, h / 2);
      ctx.fill();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = color;
      ctx.fillText(s, left + padX, at + h / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
    return w;
  };

  // the backdrop: night, a glow of the gel at the top, a gold rule
  if (draw) {
    ctx.fillStyle = look.night;
    ctx.fillRect(0, 0, WIDTH, ctx.canvas.height);
    const glow = ctx.createRadialGradient(WIDTH / 2, 0, 40, WIDTH / 2, 0, 760);
    glow.addColorStop(0, look.gel + "55");
    glow.addColorStop(1, look.gel + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, 760);
  }
  y = PAD + 36;

  // a trophy: a gold cup, drawn simply
  if (draw) {
    const cx = WIDTH / 2;
    ctx.fillStyle = look.gold;
    roundRect(ctx, cx - 44, y - 24, 88, 70, 22);
    ctx.fill();
    ctx.fillRect(cx - 8, y + 44, 16, 26);
    roundRect(ctx, cx - 36, y + 68, 72, 14, 7);
    ctx.fill();
    ctx.strokeStyle = look.gold;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx - 52, y + 6, 20, Math.PI * 0.55, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 52, y + 6, 20, -Math.PI * 0.5, Math.PI * 0.45);
    ctx.stroke();
  }
  y += 150;

  ctx.font = `800 76px ${look.display}`;
  text(p.heading, WIDTH / 2, y, look.moon, "center");
  y += 54;
  ctx.font = `600 30px ${look.body}`;
  text(p.sub, WIDTH / 2, y, look.haze, "center");
  y += 44;

  if (p.mind) {
    ctx.font = `700 30px ${look.body}`;
    const lines = wrap(ctx, p.mind, W - 80);
    for (const line of lines) {
      pill(line, WIDTH / 2, y, 58, 36, look.gel + "33", look.moon, `700 30px ${look.body}`, "center");
      y += 68;
    }
    y += 10;
  } else y += 14;

  // the shelves
  for (const s of p.shelves) {
    const rowTop = y;
    // the face: a colored disc with the name's first letter
    if (draw) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(PAD + 40, y + 40, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 38px ${look.display}`;
      ctx.fillStyle = look.night;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initialOf(s.name), PAD + 40, y + 42);
      ctx.textBaseline = "alphabetic";
    }
    const x = PAD + 108;
    ctx.font = `800 40px ${look.display}`;
    const name = fit(ctx, s.name, W - 108 - (s.top ? 200 : 0));
    text(name, x, y + 52, look.moon);
    if (s.top) {
      ctx.font = `800 40px ${look.display}`;
      const nameW = ctx.measureText(name).width;
      pill(p.topTag, x + nameW + 18, y + 20, 44, 18, look.gel, look.night, `800 24px ${look.body}`);
    }
    y += 84;
    if (s.awards.length) {
      // the award chips, wrapped
      let cx = x;
      const h = 52;
      const gap = 12;
      ctx.font = `700 28px ${look.body}`;
      for (const a of s.awards) {
        const label = "🏆 " + a;
        const w = ctx.measureText(label).width + 44;
        if (cx + w > PAD + W && cx > x) {
          cx = x;
          y += h + gap;
        }
        pill(label, cx, y, h, 22, look.dusk, look.gel, `700 28px ${look.body}`);
        cx += w + gap;
      }
      y += h;
    } else {
      ctx.font = `600 28px ${look.body}`;
      text(p.none, x, y + 30, look.haze);
      y += 44;
    }
    y += 34;
    if (draw) {
      ctx.fillStyle = look.dusk;
      ctx.fillRect(PAD, y, W, 2);
    }
    y += 34;
    void rowTop;
  }

  // the foot
  y += 10;
  ctx.font = `700 28px ${look.body}`;
  text(p.site, WIDTH / 2, y, look.gel, "center");
  y += PAD;
  return y;
}

export async function paintPoster(p: Poster, look: Look = lookOf()): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const measure = document.createElement("canvas");
  measure.width = WIDTH;
  measure.height = 10;
  const mctx = measure.getContext("2d");
  if (!mctx) throw new Error("no canvas");
  const height = Math.ceil(layout(mctx, p, look, false));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  layout(ctx, p, look, true);
  return canvas;
}

export const pngOf = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("no picture"))), "image/png"));

/** The file's name, in plain letters with the day. */
export function posterName(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `superlatives-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.png`;
}

/** What the ceremony puts on the poster: everyone, their awards and the mind reader, in the phone's language. */
export function posterOf({ lang, people, awards, hits, round }: { lang: "zh" | "en"; people: { id: string; name: string; color: string }[]; awards: Record<string, { zh: string; en: string }[]>; hits: Record<string, number>; round: number }): Poster {
  const zh = lang === "zh";
  const won = (id: string) => awards[id]?.length ?? 0;
  const top = Math.max(0, ...people.map((p) => won(p.id)));
  const shelves = people
    .slice()
    .sort((a, b) => won(b.id) - won(a.id))
    .map((p) => ({ name: p.name, awards: (awards[p.id] ?? []).map((a) => (zh ? a.zh : a.en)), top: top > 0 && won(p.id) === top, color: p.color }));
  const best = Math.max(0, ...Object.values(hits));
  const readers = best >= 1 && round >= 1 ? people.filter((p) => hits[p.id] === best).map((p) => p.name) : [];
  const date = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-CA", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  return {
    lang,
    heading: zh ? "颁奖典礼" : "The Awards",
    sub: `${zh ? "最佳称号" : "Superlatives"} · ${date}`,
    mind: readers.length ? (zh ? `读心术奖：${readers.join("、")}，${round} 个奖猜中 ${best} 个` : `Mind reader: ${readers.join(", ")}, called ${best} of ${round}`) : null,
    shelves,
    topTag: zh ? "全场最佳" : "MVP",
    none: zh ? "今晚低调" : "Kept a low profile",
    site: "changle.ca/g/superlatives",
  };
}
