// Keep the skin on changle.ca's shared tokens; later cards may only tighten these rules.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const here = (path: string) => new URL(path, import.meta.url);
const styles = readFileSync(here("../src/client/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const siteTokens = here("../../../site/src/styles/tokens.css");
// Match declarations ending at either a semicolon or the block's closing brace.
const values = (property: string) => [...styles.matchAll(new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;}]+)`, "gi"))].map((m) => m[1].trim());

test("the tokens are the site's own, unchanged", { skip: !existsSync(siteTokens) && "the site isn't beside this tool" }, () => {
  assert.equal(readFileSync(here("../src/client/tokens.css"), "utf8"), readFileSync(siteTokens, "utf8"), "copy site/src/styles/tokens.css over src/client/tokens.css");
});

test("no color is written out: every one comes from a token", () => {
  assert.deepEqual(styles.match(/#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(|\boklab\s*\(/gi) ?? [], [], "use var(--…) from tokens.css (color-mix of tokens is fine)");
});

test("type sizes come from the tokens, without font shorthands", () => {
  assert.deepEqual(values("font-size").filter((value) => !/^var\(--text-[a-z0-9]+\)$/.test(value)), [], "font sizes use --text-*");
  assert.deepEqual(values("font").filter((value) => value !== "inherit"), [], "no font shorthand but inherit");
});

test("shadows are tokens or inset rings of token colors", () => {
  const invalid = values("box-shadow").filter((value) => value !== "none" && !/^var\(--(?:shadow-[a-z]+|glow)\)$/.test(value) && !/^inset 0 0 0 [12]px var\(--(?:color-[a-z0-9-]+|type-tool|gel)\)$/.test(value));
  assert.deepEqual(invalid, [], "use --shadow-*, --glow or an inset token ring");
});

test("corners come from the tokens", () => {
  assert.deepEqual(values("border-radius").filter((value) => value !== "0" && !/^var\(--r-[a-z]+\)$/.test(value)), [], "corners use --r-*");
});

test("durations come from the tokens", () => {
  assert.deepEqual(styles.match(/(?:\d*\.)?\d+m?s\b/gi) ?? [], [], "durations use --dur-*");
});

test("padding, margins and gaps come from the spacing tokens", () => {
  const spacing = values("(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?");
  const invalid = spacing.filter((value) => [...value.matchAll(/(-?(?:\d*\.)?\d+)(px|rem|em)\b/gi)].some((m) => m[2].toLowerCase() !== "px" || Math.abs(Number(m[1])) >= 3));
  assert.deepEqual(invalid, [], "use --space-*, --gutter, --pad-card or --gap-section; 1px and 2px nudges are fine");
});

test("this is a tool: its light is the tools' amber", () => {
  assert.match(styles, /--gel:\s*var\(--type-tool\)/);
});
