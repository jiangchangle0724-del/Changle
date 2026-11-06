/*
 * The design tokens (src/styles/tokens.css, rules in docs/DESIGN.md). Run with `npx tsx tests/tokens.test.ts`
 *  1. A name tokens.css shares with global.css has the same value there, so loading tokens.css
 *     changes nothing on screen until the migration is done.
 *  2. The shared components in src/ui/ write no colors or font sizes of their own: tokens only.
 *  3. The type scale is the one docs/DESIGN.md promises.
 *  4. The site's frame (UI plan C8) writes no raw font sizes, colors, shadows, corners or short
 *     durations. Until C8 is done, a file may keep at most what tests/raw-values.json allows, and
 *     that only goes down. `UPDATE_RAW=1 npx tsx tests/tokens.test.ts` writes the new, lower counts.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

// a file path on every system (a URL's pathname is /C:/... on Windows)
const here = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(here, p), "utf8");

/** custom properties declared in a file's first :root block, comments stripped */
function rootVars(css: string): Map<string, string> {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].replace(/\s+/g, " ").trim());
  return out;
}

const tokens = rootVars(read("src/styles/tokens.css"));
const global = rootVars(read("src/styles/global.css"));

// 1. same names, same values (global.css loses its copies once the migration is done; then nothing is shared)
ok(tokens.size >= 60, `tokens.css defines ${tokens.size} tokens`);
const shared = [...tokens.keys()].filter((k) => global.has(k));
for (const k of shared) ok(tokens.get(k) === global.get(k), `${k} is the same in both (${tokens.get(k)})`);

// every semantic name resolves to something defined in tokens.css
for (const [k, v] of tokens) {
  for (const ref of v.matchAll(/var\((--[\w-]+)/g)) ok(tokens.has(ref[1]), `${k} points at ${ref[1]}, which tokens.css defines`);
}

// 2. src/ui/ uses tokens only
function walk(dir: string): string[] {
  return readdirSync(join(here, dir)).flatMap((n) => {
    // forward slashes on every system, so tests/raw-values.json reads the same on Windows
    const p = join(dir, n).replace(/\\/g, "/");
    return statSync(join(here, p)).isDirectory() ? walk(p) : [p];
  });
}
const ui = walk("src/ui").filter((p) => /\.(tsx?|css)$/.test(p) && !p.endsWith("types.ts"));
for (const p of ui) {
  const src = read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const px = src.match(/font-?[sS]ize\s*[:=]\s*["'{]?\s*\d/g) ?? [];
  const rgb = src.match(/\b(rgba?|hsla?)\(/g) ?? [];
  ok(hex.length === 0, `${p}: no raw hex colors${hex.length ? ` (found ${hex.slice(0, 3).join(", ")})` : ""}`);
  ok(rgb.length === 0, `${p}: no rgb()/hsl() colors`);
  ok(px.length === 0, `${p}: no font sizes in numbers, only var(--text-*)`);
}
ok(true, `${ui.length} component file(s) in src/ui checked`);

// 3. the scale
const rem = (k: string) => tokens.get(k) ?? "";
ok(rem("--text-xs") === "0.75rem" && rem("--text-sm") === "0.875rem" && rem("--text-md") === "1rem" && rem("--text-lg") === "1.125rem", "12 / 14 / 16 / 18 are fixed steps");
const fluid = (k: string, lo: number, hi: number) => {
  const m = rem(k).match(/^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  const at = (w: number) => Math.min(d * 16, Math.max(a * 16, b * 16 + (c / 100) * w));
  return Math.abs(at(370) - lo) < 0.05 && Math.abs(at(1440) - hi) < 0.05;
};
ok(fluid("--text-xl", 22, 26), "--text-xl runs 22px at 370 wide to 26px at 1440");
ok(fluid("--text-2xl", 28, 34), "--text-2xl runs 28px to 34px");
ok(fluid("--text-3xl", 40, 48), "--text-3xl runs 40px to 48px");
ok(rem("--text-4xl") === "4rem", "--text-4xl is 64px");
for (const n of [1, 2, 3, 4, 6, 8, 12]) ok(tokens.get(`--space-${n}`) === `${n * 4}px`, `--space-${n} is ${n * 4}px`);

// 4. the site's frame uses tokens: raw values only go down (C8), to none
// The frame: everything around the games. A game's own picture (party.css, drama.css, the TV's
// screens, src/party/) keeps its art for now; so do spacing values and long choreography (> 600ms).
const FRAME = [
  ...["home", "account", "admin", "avatar", "online", "tools", "components", "global", "landscape"].map((n) => `src/styles/${n}.css`),
  "src/games/GameShell.css",
  "src/games/GameLoading.css",
  "src/App.tsx",
  ...["src/home", "src/account", "src/tools", "src/components"].flatMap((d) => walk(d)),
  ...walk("src/online").filter((p) => !p.includes("/games/")),
  ...walk("src/games").filter((p) => /\/Game\w*\.tsx$|\/Resume\.tsx$/.test(p)),
].filter((p) => /\.(tsx|css)$/.test(p));
type Raw = { font: number; color: number; shadow: number; radius: number; time: number };
/** what a file writes out instead of a token; custom property declarations (--x: …) are definitions, not uses */
function raw(p: string): Raw {
  const src = read(p).replace(/\/\*[\s\S]*?\*\//g, "");
  const r: Raw = { font: 0, color: 0, shadow: 0, radius: 0, time: 0 };
  if (p.endsWith(".tsx")) {
    r.font = (src.match(/fontSize\s*:\s*["']?\d/g) ?? []).length;
    return r;
  }
  for (const m of src.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = m;
    if (prop.startsWith("--")) continue;
    const v = value.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "");
    if ((prop === "font-size" || prop === "font") && /\d(\.\d+)?px/.test(v)) r.font++;
    r.color += (v.match(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/g) ?? []).length;
    if (prop === "box-shadow" && v.trim() !== "none" && /\S/.test(v.replace(/,/g, ""))) r.shadow++;
    if (/^border(-[a-z]+)*-radius$/.test(prop) && /\d(\.\d+)?(px|rem|em)/.test(v)) r.radius++;
    if (/^(transition|animation)(-duration|-delay)?$/.test(prop))
      r.time += [...v.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].filter(([, n, u]) => Number(n) * (u === "s" ? 1000 : 1) <= 600 && Number(n) > 0).length;
  }
  return r;
}
const baselineFile = join(here, "tests/raw-values.json");
const baseline: Record<string, Partial<Raw>> = JSON.parse(readFileSync(baselineFile, "utf8"));
const now: Record<string, Partial<Raw>> = {};
let rawLeft = 0;
for (const p of FRAME) {
  const r = raw(p);
  const kept = Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0)) as Partial<Raw>;
  if (Object.keys(kept).length) now[p] = kept;
  for (const [k, n] of Object.entries(r) as [keyof Raw, number][]) {
    rawLeft += n;
    const most = baseline[p]?.[k] ?? 0;
    ok(n <= most, `${p}: ${n} raw ${k}${n > most ? ` (at most ${most}: use the tokens in src/styles/tokens.css)` : ""}`);
  }
}
if (process.env.UPDATE_RAW) {
  writeFileSync(baselineFile, JSON.stringify(now, null, 2) + "\n");
  console.log("wrote tests/raw-values.json");
}
ok(true, `${FRAME.length} frame file(s) checked, ${rawLeft} raw value(s) left (C8 takes this to 0)`);

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
