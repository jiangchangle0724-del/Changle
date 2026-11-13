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

test("the board's codes, Chinese names, owners' letters and news tags are all drawn as outlines", async () => {
  // (scripts/board-type.mjs: text in the board's SVG would be laid out again on every frame of a move)
  const { CODE_PATH, ZH_PATH, OWNER_PATH, NEWS_PATH } = await import("../src/client/art/boardType");
  const { CITIES, NEWS } = await import("../src/engine");
  const { newsTag } = await import("../src/client/ui/newsTag");
  const { BOARD_ZH } = await import("../src/client/art/stamps");
  const missing = [
    ...CITIES.filter((c) => !CODE_PATH[c.id]).map((c) => c.id),
    // (every city's Chinese name on the board, its lines making up its name)
    ...CITIES.filter((c) => !ZH_PATH[c.id] || !BOARD_ZH[c.id] || !c.name.zh.startsWith(BOARD_ZH[c.id].join(""))).map((c) => `zh:${c.id}`),
    ...[..."ABCDEF"].filter((l) => !OWNER_PATH[l]),
    ...NEWS.map(newsTag).filter((t) => !NEWS_PATH[t]),
  ];
  assert.deepEqual(missing, [], "run `node scripts/board-type.mjs` to draw these");
});
