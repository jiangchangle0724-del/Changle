// The board's few words as outlines: the 22 airport codes and the cities' Chinese names, the owners'
// letters and the travel news tags, drawn as paths in the same fonts (Big Shoulders Display 800, ZCOOL
// QingKe HuangYou, Space Mono Bold). Text in an SVG
// is laid out again by the browser whenever anything above it moves, every frame of a first-person
// move; a path is only moved.
//   node scripts/board-type.mjs   (after `npm run fonts` has fetched the fonts; re-run when a city,
//                                  a letter or a piece of news changes: tests/fonts.test.ts reminds you)
// Output: src/client/art/boardType.ts (committed).
import { readFile, writeFile } from "node:fs/promises";
import * as hb from "harfbuzzjs";
import { CITIES, NEWS } from "../src/engine/index.ts";
import { BOARD_ZH, CODE } from "../src/client/art/stamps.tsx";
import { newsTag } from "../src/client/ui/newsTag.ts";

const CACHE = "node_modules/.cache/been-there-fonts";

async function font(file, variations) {
  const face = new hb.Face(new hb.Blob(await readFile(`${CACHE}/${file}`)));
  const f = new hb.Font(face);
  if (variations) f.setVariations(Object.entries(variations).map(([tag, value]) => hb.Variation.fromString(`${tag}=${value}`)));
  return { face, font: f, upem: face.upem };
}

/** `text` as one path: `size` px, centred on x = 0 with its baseline at `y`, `spacing` px between letters. */
function outline({ font: f, upem }, text, size, y, spacing = 0) {
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(f, buf);
  const glyphs = buf.getGlyphInfosAndPositions();
  const k = size / upem;
  let width = 0;
  glyphs.forEach((g, i) => (width += g.xAdvance * k + (i < glyphs.length - 1 ? spacing : 0)));
  let pen = -width / 2;
  const parts = [];
  for (const g of glyphs) {
    const d = f.glyphToPath(g.codepoint);
    const x0 = pen + g.xOffset * k;
    const y0 = y - g.yOffset * k;
    // Font units, y up → board units, y down; every coordinate pair of the absolute path.
    parts.push(
      d.replace(/(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)/g, (_, x, yy) => `${+(x0 + Number(x) * k).toFixed(1)},${+(y0 - Number(yy) * k).toFixed(1)}`),
    );
    pen += g.xAdvance * k + spacing;
  }
  return parts.join("");
}

const PAIR = /(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)/g;

/** An absolute path (M, L, Q, Z) as a short one. ZCOOL rounds every corner of its strokes with a curve
 * half a board unit across, which no screen shows at the board's size: each becomes a plain corner, the
 * straight runs either side of it one line. Then every point goes on a grid of `step` board units and
 * is written relative to the one before. (As harfbuzz writes them, the 22 names would be four times
 * the size of the airport codes.) */
function compact(d, step, tiny = 1.5) {
  const subpaths = [];
  let cur = null;
  let at = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const nums = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (cmd === "M") subpaths.push((cur = { start: pts[0], segs: [] }));
    else if (cmd === "Z") cur = null;
    else if (cmd === "L") cur.segs.push({ t: "L", p: pts[0] });
    else if (cmd === "Q") {
      const span = Math.max(...[at, pts[0], pts[1]].flatMap((a, i, all) => all.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
      if (span <= tiny) cur.segs.push({ t: "L", p: pts[0] }, { t: "L", p: pts[1] });
      else cur.segs.push({ t: "Q", c: pts[0], p: pts[1] });
    } else throw new Error(`unexpected ${cmd} in a glyph`);
    if (cmd !== "Z") at = pts[pts.length - 1];
    if (cmd === "M") at = pts[0];
  }
  const q = (v) => Math.round(v / step) * step;
  const fmt = (v) => String(+v.toFixed(2)).replace(/^(-?)0\./, "$1.");
  const join = (nums) => nums.map((v, i) => (i && v >= 0 ? " " : "") + fmt(v)).join("");
  let out = "";
  let pen = [0, 0];
  for (const sp of subpaths) {
    // (straight runs merged: a line that goes on the way the last one went replaces it)
    const segs = [];
    let from = sp.start;
    for (const s of sp.segs) {
      const last = segs[segs.length - 1];
      if (s.t === "L" && Math.hypot(s.p[0] - from[0], s.p[1] - from[1]) < 1e-6) continue;
      if (s.t === "L" && last?.t === "L") {
        const a = last.from;
        const cross = (from[0] - a[0]) * (s.p[1] - a[1]) - (from[1] - a[1]) * (s.p[0] - a[0]);
        const along = (from[0] - a[0]) * (s.p[0] - from[0]) + (from[1] - a[1]) * (s.p[1] - from[1]);
        if (Math.abs(cross) < 0.05 && along >= 0) {
          last.p = s.p;
          from = s.p;
          continue;
        }
      }
      segs.push({ ...s, from });
      from = s.p;
    }
    // (a corner rounded by two curves leaves a short slant: the two lines either side meet instead)
    const len = (s) => Math.hypot(s.p[0] - s.from[0], s.p[1] - s.from[1]);
    for (let i = 1; i < segs.length - 1; i++) {
      const [a, s, b] = [segs[i - 1], segs[i], segs[i + 1]];
      if (a.t !== "L" || s.t !== "L" || b.t !== "L" || len(s) > 1.2 || len(a) <= len(s) || len(b) <= len(s)) continue;
      const [dx1, dy1, dx2, dy2] = [a.p[0] - a.from[0], a.p[1] - a.from[1], b.p[0] - b.from[0], b.p[1] - b.from[1]];
      const den = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(den) < 1e-9) continue;
      const u = ((b.from[0] - a.from[0]) * dy2 - (b.from[1] - a.from[1]) * dx2) / den;
      const x = [a.from[0] + u * dx1, a.from[1] + u * dy1];
      if (Math.hypot(x[0] - (s.from[0] + s.p[0]) / 2, x[1] - (s.from[1] + s.p[1]) / 2) > 1.5) continue;
      a.p = x;
      b.from = x;
      segs.splice(i, 1);
      i--;
    }
    const start = [q(sp.start[0]), q(sp.start[1])];
    out += "m" + join([start[0] - pen[0], start[1] - pen[1]]);
    pen = start;
    const begin = pen;
    let cmd = "";
    for (const s of segs) {
      const p = [q(s.p[0]), q(s.p[1])];
      if (s.t === "L") {
        out += (cmd === "l" ? (p[0] - pen[0] >= 0 ? " " : "") : "l") + join([p[0] - pen[0], p[1] - pen[1]]);
        cmd = "l";
      } else {
        const c = [q(s.c[0]), q(s.c[1])];
        out += (cmd === "q" ? (c[0] - pen[0] >= 0 ? " " : "") : "q") + join([c[0] - pen[0], c[1] - pen[1], p[0] - pen[0], p[1] - pen[1]]);
        cmd = "q";
      }
      pen = p;
    }
    out += "z";
    pen = begin;
  }
  return out;
}

/** `lines` one under another, `size` px, `gap` px between them, the whole block centred on (0, `cy`). */
function block(f, lines, size, gap, cy) {
  const d = lines.map((line, i) => outline(f, line, size, i * (size + gap))).join("");
  const pts = [...d.matchAll(PAIR)].map((m) => [Number(m[1]), Number(m[2])]);
  const mid = (k) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2;
  const [dx, dy] = [-mid(0), cy - mid(1)];
  return compact(
    d.replace(PAIR, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`),
    0.25,
  );
}

const display = await font("bigshouldersdisplay_BigShouldersDisplay_5Bwght_5D.ttf", { wght: 800 });
const mono = await font("spacemono_SpaceMono-Bold.ttf");
const zcool = await font("zcoolqingkehuangyou_ZCOOLQingKeHuangYou-Regular.ttf");

// The same sizes and baselines as the text they replace (art.css, RoundBoard.tsx).
const codes = Object.fromEntries(CITIES.map((c) => [c.id, outline(display, CODE[c.id], 34, 11, 1)]));
// A city's Chinese name where its code goes, about as big as the code: two characters as tall as the
// code's capitals, three smaller, two lines smaller again; centred where the code's capitals are.
const zhSize = (lines) => (lines.length > 1 ? 18 : [...lines[0]].length >= 3 ? 18 : 25);
const zh = Object.fromEntries(CITIES.map((c) => [c.id, block(zcool, BOARD_ZH[c.id], zhSize(BOARD_ZH[c.id]), 1.5, -2.6)]));
const owners = Object.fromEntries([..."ABCDEF"].map((l) => [l, outline(mono, l, 19, 6.5)]));
const tags = [...new Set(NEWS.map(newsTag))];
const news = Object.fromEntries(tags.map((t) => [t, outline(display, t, 17, 6)]));

const out = `// Generated by scripts/board-type.mjs: the board's airport codes, Chinese city names, owners' letters and
// news tags as outlines (Big Shoulders Display 800, ZCOOL QingKe HuangYou and Space Mono Bold, SIL OFL 1.1).
// Don't edit by hand.
export const CODE_PATH: Record<string, string> = ${JSON.stringify(codes, null, 2)};

export const ZH_PATH: Record<string, string> = ${JSON.stringify(zh, null, 2)};

export const OWNER_PATH: Record<string, string> = ${JSON.stringify(owners, null, 2)};

export const NEWS_PATH: Record<string, string> = ${JSON.stringify(news, null, 2)};
`;
await writeFile("src/client/art/boardType.ts", out);
console.log(`${Object.keys(codes).length} codes, ${Object.keys(zh).length} Chinese names, ${Object.keys(owners).length} letters, ${tags.length} news tags (${tags.join(" ")}): ${(out.length / 1024).toFixed(1)} KB`);
