// Everything a player reads exists in Chinese and English, and none of it has em dashes or curly
// quotes; the old name is gone everywhere in the game's folder.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { STRINGS } from "../src/client/i18n";

const FORBIDDEN = /[—–“”‘’]/;

test("every string has both languages, without em dashes or curly quotes", () => {
  for (const [key, entry] of Object.entries(STRINGS)) {
    assert.ok(entry.length >= 2 && entry[0].trim() && entry[1].trim(), `${key} has Chinese and English`);
    for (const text of entry) assert.ok(!FORBIDDEN.test(text), `${key}: "${text}"`);
    assert.ok(/[一-鿿]/.test(entry[0]) || /^[\w {}·:.%×-]+$/.test(entry[0]), `${key}: the first is Chinese`);
    assert.ok(!/[一-鿿]/.test(entry[1]) || key === "language", `${key}: the second is English`);
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    assert.equal(vars(entry[0]), vars(entry[1]), `${key}: both languages fill the same blanks`);
  }
});

test("the page's own words (title, description) follow the same rules", () => {
  const html = readFileSync(new URL("../src/client/index.html", import.meta.url), "utf8");
  assert.ok(!FORBIDDEN.test(html));
  assert.match(html, /藏在人群里 · Hide in the Crowd/);
});

test("nothing in the game's folder uses the commercial game's name", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const skip = new Set(["node_modules", "dist", ".wrangler", "test-results", "playwright-report"]);
  const old = new RegExp(["un", "spot", "table"].join(""), "i");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      if (skip.has(name)) return [];
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  for (const file of walk(root)) {
    assert.ok(!old.test(file), file);
    const data = readFileSync(file);
    assert.ok(!old.test(data.toString("latin1")), `${file} mentions it`);
  }
});
