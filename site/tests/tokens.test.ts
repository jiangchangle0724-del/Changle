/*
 * The design tokens (src/styles/tokens.css, rules in docs/DESIGN.md). Run with `npx tsx tests/tokens.test.ts`
 *  1. A name tokens.css shares with global.css has the same value there, so loading tokens.css
 *     changes nothing on screen until the migration is done.
 *  2. The shared components in src/ui/ write no colors or font sizes of their own: tokens only.
 *  3. The type scale is the one docs/DESIGN.md promises.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

const here = new URL("..", import.meta.url).pathname;
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
    const p = join(dir, n);
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

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
