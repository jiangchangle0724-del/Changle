// The app's pages follow changle.ca's design rules (docs/DESIGN.md in the repository): the same
// tokens as the site, night colors, no color or type size written out in the stylesheet, every
// word in both languages. And they keep to what the page's content security policy allows
// (src/server/worker.ts, `PAGE_POLICY`): nothing written into the page to run or to style, and
// nothing from anywhere but this origin.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const here = (path: string) => new URL(path, import.meta.url);
const read = (path: string): string => readFileSync(here(path), "utf8");
const styles = read("../web/app/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
const siteTokens = here("../../../site/src/styles/tokens.css");
const screens = ["../web/app/main.tsx", ...readdirSync(here("../web/app/ui")).map((name) => `../web/app/ui/${name}`)].map((path) => ({ path, text: read(path) }));

test("the tokens are the site's own, unchanged", { skip: !existsSync(siteTokens) && "the site isn't beside this tool" }, () => {
  assert.equal(read("../web/app/tokens.css"), readFileSync(siteTokens, "utf8"), "copy site/src/styles/tokens.css over web/app/tokens.css");
});

test("no color is written out: every one comes from a token", () => {
  const raw = styles.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(/gi) ?? [];
  assert.deepEqual(raw, [], "use var(--…) from tokens.css (color-mix of two tokens is fine)");
});

test("type sizes come from the tokens", () => {
  const sizes = [...styles.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim()).filter((value) => !/^var\(--text-[a-z0-9]+\)$/.test(value));
  assert.deepEqual(sizes, [], "font sizes use --text-*");
  const fonts = [...styles.matchAll(/\bfont:\s*([^;]+);/g)].map((m) => m[1]!.trim()).filter((value) => value !== "inherit");
  assert.deepEqual(fonts, [], "no font shorthand but inherit");
});

test("corners, shadows and timings come from the tokens", () => {
  const shadows = [...styles.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1]!.trim()).filter((value) => value !== "none" && !/^var\(--(shadow-[a-z]+|glow)\)$/.test(value) && !/^inset 0 0 0 [12]px var\(--[a-z0-9-]+\)$/.test(value));
  assert.deepEqual(shadows, [], "shadows use --shadow-* (an inset ring of a token color is fine)");
  const corners = [...styles.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]!.trim()).filter((value) => !/^var\(--r-[a-z]+\)$/.test(value));
  assert.deepEqual(corners, [], "corners use --r-*");
  const times = styles.match(/\b\d+(\.\d+)?m?s\b/g) ?? [];
  assert.deepEqual(times, [], "durations use --dur-*");
});

test("this is a tool: its light is the tools' amber", () => {
  assert.match(styles, /--gel:\s*var\(--type-tool\)/);
});

test("nothing but a field can be selected, pressing and holding brings up no menu, and a double tap never zooms", () => {
  assert.match(styles, /\bbody\s*\{[^}]*-webkit-touch-callout:\s*none/);
  assert.match(styles, /\bbody\s*\{[^}]*user-select:\s*none/);
  assert.match(styles, /input,\s*textarea\s*\{[^}]*user-select:\s*text/);
  assert.match(styles, /\*,\s*\*::before,\s*\*::after\s*\{[^}]*touch-action:\s*manipulation/);
  // (iPhone Safari looks at touch-action only near something that listens for clicks: the page itself listens)
  assert.match(read("../web/app/main.tsx"), /document\.documentElement\.addEventListener\("click"/);
});

test("with reduced motion, nothing slides or shrinks", () => {
  const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(styles);
  assert.ok(reduced, "the stylesheet ends with what changes under reduced motion");
  const moving = [...styles.matchAll(/([^{}]+)\{[^{}]*\b(?:animation|transition):/g)].map((m) => m[1]!.trim().split(/\s*,\s*/)).flat();
  assert.ok(moving.length >= 2);
  for (const selector of moving) assert.ok(reduced[1]!.includes(`${selector} {`) || reduced[1]!.includes(`${selector},`), `${selector} still moves under reduced motion`);
});

test("every word a person reads is there in both languages", () => {
  const source = read("../web/app/i18n.ts");
  const block = source.slice(source.indexOf("const STRINGS = {"), source.indexOf("} as const;"));
  const lines = block.split("\n").filter((line) => /^\s+\w+: \{/.test(line));
  assert.ok(lines.length > 70);
  for (const line of lines) {
    assert.match(line, /zh: "(?:[^"\\]|\\.)+"/, line);
    assert.match(line, /en: "(?:[^"\\]|\\.)+"/, line);
    // what is filled in, is filled in in both
    const [zh, en] = [/zh: "((?:[^"\\]|\\.)+)"/.exec(line)![1]!, /en: "((?:[^"\\]|\\.)+)"/.exec(line)![1]!];
    assert.deepEqual((zh.match(/\{\w+\}/g) ?? []).sort(), (en.match(/\{\w+\}/g) ?? []).sort(), line);
  }
  // and no screen says anything of its own: letters or Chinese between tags, or in a label
  for (const { path, text } of screens) {
    // (after a tag, and before the next one: `<p>words</p>`, `<b>words<`; a type's own angle brackets are followed by no tag, and what stands between two branches of a choice is not words)
    const said = [...text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").matchAll(/<\/?[A-Za-z][^<>]*>\s*([^<>{}\n]*[A-Za-z一-鿿][^<>{}\n]*)\s*</g)].map((m) => m[1]!.trim()).filter((words) => !/^\)|\($|=>|&&|\|\||===/.test(words));
    assert.deepEqual(said, [], `${path} says something that is not in i18n.ts`);
    assert.ok(!/(?:aria-label|title|placeholder|alt)="[^"]*[A-Za-z一-鿿]/.test(text), `${path} has a label written out`);
  }
});

test("what is said about the encryption is what may be said (VAULT-6)", () => {
  const source = read("../web/app/i18n.ts");
  assert.ok(source.includes("stored is encrypted with a key that stays on your devices; the operator cannot read your stored transactions"));
  for (const not of [/zero.knowledge/i, /impossible to access/i, /bank.level/i, /military.grade/i, /unhackable/i, /零知识/, /银行级/, /军用级/, /绝对安全/]) assert.ok(!not.test(source), `the app says ${not}`);
});

test("the screens write nothing into the page to run or to style: the page's policy would stop it", () => {
  for (const { path, text } of screens) {
    assert.ok(!/\bstyle=/.test(text), `${path} sets a style on an element`);
    assert.ok(!/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(text), `${path} writes markup or runs text`);
    assert.ok(!/<script|<style|<iframe|<object|<embed/.test(text), `${path} adds a script, a style, or a frame`);
  }
  const page = read("../web/app/index.html");
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(page));
  assert.deepEqual([...page.matchAll(/<script[^>]*>/g)].map((m) => m[0]), ['<script src="/assets/__JS__" defer>']);
  assert.deepEqual([...page.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]), ["/assets/icon.svg", "/assets/__CSS__", "/assets/__JS__"]);
});

test("the fonts and the styles load from this origin and nowhere else", () => {
  const css = [read("../web/app/fonts/fonts.css"), read("../web/app/tokens.css"), read("../web/app/styles.css")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual([...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!.replace(/["']/g, "")).sort(), ["/assets/fonts/figtree.woff2", "/assets/fonts/unbounded.woff2"]);
  assert.ok(!/@import/.test(css));
  // the only address outside this origin that the screens know is the way back to the site's tools: a link, which asks nothing until it is pressed
  const outside = screens.flatMap(({ text }) => text.match(/https?:\/\/[^"'`\s)]+/g) ?? []);
  assert.deepEqual([...new Set(outside)], ["https://changle.ca/tools"]);
});

test("every place the app keeps something in the browser is one of the two it says it has", () => {
  // the language, in localStorage; the cache, which holds sealed lines only (src/web/idbcache.ts, T-24). Nothing else.
  const keeps = screens.concat([{ path: "../web/app/i18n.ts", text: read("../web/app/i18n.ts") }]).flatMap(({ path, text }) => (text.match(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|serviceWorker/g) ?? []).map((what) => `${path.split("/").pop()}: ${what}`));
  assert.deepEqual([...new Set(keeps)], ["i18n.ts: localStorage"]);
  assert.deepEqual([...new Set(read("../web/app/i18n.ts").match(/localStorage\.\w+\("[^"]+"/g))], ['localStorage.getItem("moneylens.lang"', 'localStorage.setItem("moneylens.lang"']);
});
