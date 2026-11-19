// The frame follows changle.ca's design rules (docs/DESIGN.md in the repository): the same tokens
// as the site, the gel the site's registry gives the game, and no written-out colors in the
// stylesheet beyond the game's own block at its top.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const here = (path: string) => new URL(path, import.meta.url);
const styles = readFileSync(here("../src/client/styles.css"), "utf8");
const siteTokens = here("../../../site/src/styles/tokens.css");
const registry = here("../../../site/src/games/registry.ts");

test("the tokens are the site's own, unchanged", { skip: !existsSync(siteTokens) && "the site isn't beside this game" }, () => {
  assert.equal(readFileSync(here("../src/client/tokens.css"), "utf8"), readFileSync(siteTokens, "utf8"), "copy site/src/styles/tokens.css over src/client/tokens.css");
});

test("the game's gel is the one in the site's registry", { skip: !existsSync(registry) && "the site isn't beside this game" }, () => {
  const entry = /id: "hide",[\s\S]*?gel: "(#[0-9a-f]{6})"/i.exec(readFileSync(registry, "utf8"));
  assert.ok(entry, "the registry has the game");
  const gel = /--gel: (#[0-9a-f]{6});/i.exec(styles);
  assert.equal(gel?.[1].toLowerCase(), entry![1].toLowerCase());
});

test("colors are written out only in the game's own block at the top of the stylesheet", () => {
  const block = styles.indexOf("/* ---------- the room ---------- */");
  assert.ok(block > 0);
  const rest = styles.slice(block).replace(/\/\*[\s\S]*?\*\//g, "");
  const raw = rest.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [];
  assert.deepEqual(raw, [], "use var(--…) from tokens.css, or add the color to the game's block");
});

test("type sizes, spacing and timings come from the tokens", () => {
  const rest = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  // (one exception: the big screen's root, html.is-tv, scales every token by half again, to read from across a room)
  const sizes = [...rest.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => !value.startsWith("var(--text-") && value !== "150%");
  assert.deepEqual(sizes, [], "font sizes use --text-*");
  const fonts = [...rest.matchAll(/\bfont:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => value !== "inherit" && !/var\(--text-[a-z0-9]+\)/.test(value));
  assert.deepEqual(fonts, [], "font shorthands use --text-*");
});

test("every colour the 3D view reads is defined: in the game's block, or the site's tokens", () => {
  const view = readFileSync(here("../src/client/ui/Arena3D.tsx"), "utf8");
  const tokens = readFileSync(here("../src/client/tokens.css"), "utf8");
  const block = styles.slice(0, styles.indexOf("/* ---------- the room ---------- */"));
  const names = [...view.matchAll(/read\("(--[a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(names.length > 40, "the view reads its colours with read(…)");
  const missing = names.filter((name) => !block.includes(`${name}:`) && !tokens.includes(`${name}:`));
  assert.deepEqual(missing, [], "define each in the game's block at the top of styles.css");
});
