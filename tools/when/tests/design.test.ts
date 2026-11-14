// The pages follow changle.ca's design rules (docs/DESIGN.md in the repository): the same tokens
// as the site, night colors, and no color or type size written out in the stylesheet.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const here = (path: string) => new URL(path, import.meta.url);
const styles = readFileSync(here("../src/client/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const siteTokens = here("../../../site/src/styles/tokens.css");

test("the tokens are the site's own, unchanged", { skip: !existsSync(siteTokens) && "the site isn't beside this tool" }, () => {
  assert.equal(readFileSync(here("../src/client/tokens.css"), "utf8"), readFileSync(siteTokens, "utf8"), "copy site/src/styles/tokens.css over src/client/tokens.css");
});

test("no color is written out: every one comes from a token", () => {
  const raw = styles.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(/gi) ?? [];
  assert.deepEqual(raw, [], "use var(--…) from tokens.css (color-mix of two tokens is fine)");
});

test("type sizes come from the tokens", () => {
  const sizes = [...styles.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => !/^var\(--text-[a-z0-9]+\)$/.test(value));
  assert.deepEqual(sizes, [], "font sizes use --text-*");
  const fonts = [...styles.matchAll(/\bfont:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => value !== "inherit");
  assert.deepEqual(fonts, [], "no font shorthand but inherit");
});

test("pressing and holding is off for the page, and back on for the pictures people save", () => {
  assert.match(styles, /\bbody\s*\{[^}]*-webkit-touch-callout:\s*none/);
  assert.match(styles, /\.share-img\s*\{[^}]*-webkit-touch-callout:\s*default/);
});

test("this is a tool: its light is the tools' amber", () => {
  assert.match(styles, /--gel:\s*var\(--type-tool\)/);
});

test("corners, shadows and timings come from the tokens", () => {
  const shadows = [...styles.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => value !== "none" && !/^var\(--(shadow-[a-z]+|glow)\)$/.test(value) && !/^inset 0 0 0 [12]px var\(--[a-z0-9-]+\)$/.test(value));
  assert.deepEqual(shadows, [], "shadows use --shadow-* (an inset ring of a token color is fine)");
  const times = styles.match(/\b\d+(\.\d+)?m?s\b/g) ?? [];
  assert.deepEqual(times, [], "durations use --dur-*");
});

test("every word a person reads is there in both languages", async () => {
  const source = readFileSync(here("../src/client/i18n.ts"), "utf8");
  const block = source.slice(source.indexOf("const STRINGS = {"), source.indexOf("} as const;"));
  const lines = block.split("\n").filter((line) => /^\s+\w+: \{/.test(line));
  assert.ok(lines.length > 60);
  for (const line of lines) {
    assert.match(line, /zh: "[^"]+|zh: '[^']+/, line);
    assert.match(line, /en: "(?:[^"\\]|\\.)+"/, line);
  }
});
