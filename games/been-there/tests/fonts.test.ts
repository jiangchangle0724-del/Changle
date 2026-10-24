// The heading font only carries the Chinese characters the game uses (scripts/fonts.mjs).
// If new text adds a character it lacks, that character would show in a fallback font: re-run the script.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

test("every Chinese character in the game is in the heading font", () => {
  const covered = new Set(readFileSync("src/client/fonts/chars.txt", "utf8"));
  const sources = [...walk("src/client"), ...walk("src/local"), "src/engine/data.ts"];
  const missing = new Set<string>();
  for (const f of sources)
    for (const ch of readFileSync(f, "utf8")) if (/[⺀-鿿　-〿＀-￯]/.test(ch) && !covered.has(ch)) missing.add(ch);
  assert.equal([...missing].join(""), "", "run `npm run fonts` to add these characters");
});
