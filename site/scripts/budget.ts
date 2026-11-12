/*
 * The home page's first download, after `npm run build` (UI plan A6). Run with `npx tsx scripts/budget.ts`;
 * CI runs it after the build and fails when the home page grows past its budget.
 *
 * Counted: what dist/index.html makes every phone download before anything shows: its script, the
 * modules it preloads, its stylesheet. Each game, the tools and the wishlist tab load later, on their
 * own. Sizes are gzip (what a phone actually downloads; Cloudflare serves gzip or smaller brotli).
 * React's own part is about 60 KB of that and can't shrink.
 *
 * When a change makes the home page smaller, lower the budget to just above the new size, so it stays
 * there. Raising it is a decision: say why in the PR.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// KB, gzip. JS was 150 until A6 step 2 took GSAP out (147.7 → 115.7). 118 → 119 with 最后一张 (2026-11-05):
// main stood at 117.96 and a new game's card (its words in two languages, its icon, its lazy route) adds
// about 0.6, so no new game fitted any more; the game itself still loads only when it starts.
// 119 → 120 with 一起跳 going live (2026-11-05): main stood at 118.9 and its card (two languages, the
// stage and join buttons) adds 0.3; the game is another Worker, so nothing of it loads here at all.
const BUDGET = { js: 120, css: 22 };

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const html = readFileSync(join(dist, "index.html"), "utf8");
const find = (re: RegExp) => Array.from(html.matchAll(re), (m) => m[1]);
const js = [...find(/<script[^>]*\bsrc="(\/assets\/[^"]+\.js)"/g), ...find(/<link rel="modulepreload"[^>]*\bhref="(\/assets\/[^"]+\.js)"/g)];
const css = find(/<link rel="stylesheet"[^>]*\bhref="(\/assets\/[^"]+\.css)"/g);
if (!js.length) throw new Error("dist/index.html loads no script: run npm run build first");

const kb = (files: string[]) =>
  files.reduce(
    (sum, f) => {
      const bytes = readFileSync(join(dist, f));
      return { raw: sum.raw + bytes.length / 1024, gz: sum.gz + gzipSync(bytes, { level: 9 }).length / 1024 };
    },
    { raw: 0, gz: 0 },
  );

let over = 0;
for (const [kind, files] of [["js", js], ["css", css]] as const) {
  const { raw, gz } = kb(files);
  const limit = BUDGET[kind];
  const ok = gz <= limit;
  if (!ok) over++;
  console.log(`${ok ? "ok  " : "OVER"} home ${kind.padEnd(3)} ${gz.toFixed(1).padStart(6)} KB gzip (budget ${limit}), ${raw.toFixed(1)} KB unzipped, ${files.length} file(s)`);
}
if (over) {
  console.log("\nThe home page's first download grew past its budget (scripts/budget.ts). Load the new part later (import() or React.lazy), or raise the budget in the PR and say why.");
  process.exit(1);
}
