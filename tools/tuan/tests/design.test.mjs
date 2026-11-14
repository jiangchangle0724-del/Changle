// The pages follow changle.ca's design rules (docs/DESIGN.md in the repository): the same tokens
// as the site, night colors, and no color, type size, shadow or timing written out in the
// stylesheet. Plain Node (`node --test`): the other tests run inside the Workers runtime, which
// has no files to read.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const here = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(here(path), "utf8");
const styles = read("../src/client/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = read("../src/client/tokens.css");
const siteTokens = here("../../../site/src/styles/tokens.css");

test("the tokens are the site's own, unchanged", { skip: !existsSync(siteTokens) && "the site isn't beside this tool" }, () => {
  assert.equal(tokens, readFileSync(siteTokens, "utf8"), "copy site/src/styles/tokens.css over src/client/tokens.css");
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

test("this is a tool: its light is the tools' amber", () => {
  assert.match(styles, /--gel:\s*var\(--type-tool\)/);
});

test("corners, shadows and timings come from the tokens", () => {
  const shadows = [...styles.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => value !== "none" && !/^var\(--(shadow-[a-z]+|glow)\)$/.test(value) && !/^inset 0 0 0 [12]px var\(--[a-z0-9-]+\)$/.test(value));
  assert.deepEqual(shadows, [], "shadows use --shadow-* (an inset ring of a token color is fine)");
  const corners = [...styles.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((value) => !/^(0|inherit|(var\(--r-[a-z]+\)( 0| var\(--r-[a-z]+\))*))$/.test(value));
  assert.deepEqual(corners, [], "corners use --r-*");
  const times = styles.match(/\b\d+(\.\d+)?m?s\b/g) ?? [];
  assert.deepEqual(times, [], "durations use --dur-*");
});

test("every token the styles use is one the site has", () => {
  const known = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g), ...styles.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const unknown = [...new Set([...styles.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((name) => !known.has(name));
  assert.deepEqual(unknown, [], "not in tokens.css");
});

/**
 * The words inside the strings of a piece of code that starts at `from` with a quote or a brace:
 * "a b" → a, b; {`a${on ? " b" : ""}`} → a, b. A string being compared (=== "x") isn't one of them.
 * Returns the words and where the piece ends.
 */
function stringWords(code, from) {
  const words = [];
  const stack = [];
  let text = "";
  let compared = false;
  const keep = () => {
    if (!compared) words.push(...text.split(/\s+/).filter(Boolean));
    text = "";
    compared = false;
  };
  let i = from;
  do {
    const ch = code[i];
    const mode = stack[stack.length - 1] ?? "code";
    if (mode === "quote") {
      if (ch === '"') (keep(), stack.pop());
      else text += ch;
    } else if (mode === "template") {
      if (ch === "`") (keep(), stack.pop());
      else if (ch === "$" && code[i + 1] === "{") (keep(), stack.push("code"), i++);
      else text += ch;
    } else if (ch === '"') {
      compared = /[=!]==\s*$/.test(code.slice(Math.max(0, i - 8), i));
      stack.push("quote");
    } else if (ch === "`") stack.push("template");
    else if (ch === "{") stack.push("code");
    else if (ch === "}") stack.pop();
    i++;
  } while (stack.length && i < code.length);
  return { words, end: i };
}

test("every class a page uses has its styles, and no styles are left over", () => {
  const dir = here("../src/client/ui/");
  const pages = readdirSync(dir).map((name) => readFileSync(new URL(name, dir), "utf8")).join("\n") + read("../src/client/api.ts");
  // class="…", class={…}, and .className = "…": class names are always written out whole in a
  // string (never built from parts), so they can be found here
  const used = new Set();
  for (const m of pages.matchAll(/\bclass(?:Name)?\s*=\s*(?=["{])/g)) for (const word of stringWords(pages, m.index + m[0].length).words) used.add(word);
  const styled = new Set([...styles.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
  assert.ok(used.size > 60);
  assert.deepEqual([...used].filter((name) => !styled.has(name)).sort(), [], "used in a page, missing from styles.css");
  // (has-sheet is put on <html> while a sheet is open: src/client/ui/common.tsx)
  assert.deepEqual([...styled].filter((name) => !used.has(name) && name !== "has-sheet").sort(), [], "in styles.css, used by no page");
});

// The words: the ones a buyer's pages use in src/client/i18n.ts, the ones only the merchant's pages
// use in src/client/i18n-my.ts (they come with the merchant's own script).
const wordFiles = { buyer: ["../src/client/i18n.ts", "STRINGS"], merchant: ["../src/client/i18n-my.ts", "MY_STRINGS"] };
const words = Object.fromEntries(
  Object.entries(wordFiles).map(([who, [path, name]]) => {
    const source = read(path);
    const start = source.indexOf(`const ${name} = {`);
    const end = source.indexOf("} as const;", start);
    const lines = source.slice(start, end).split("\n").filter((line) => /^\s+\w+: \{/.test(line));
    return [who, { lines, keys: lines.map((line) => /^\s+(\w+):/.exec(line)[1]), rest: source.slice(end) }];
  }),
);
const client = (path) => read(`../src/client/${path}`);
const uiFiles = readdirSync(here("../src/client/ui/"));
/** The files of a buyer's pages: what src/client/main.tsx brings in. The build checks the same from the other side (scripts/build.mjs). */
const buyerFiles = ["main.tsx", "api.ts", "ui/Offer.tsx", "ui/Order.tsx", "ui/Home.tsx", "ui/common.tsx"];

test("every word a person reads is there in both languages", () => {
  for (const { lines } of Object.values(words)) {
    assert.ok(lines.length > 60);
    for (const line of lines) {
      assert.match(line, /zh: "[^"]+|zh: '[^']+/, line);
      assert.match(line, /en: "(?:[^"\\]|\\.)+"/, line);
    }
  }
  const twice = words.buyer.keys.filter((key) => words.merchant.keys.includes(key));
  assert.deepEqual(twice, [], "a word is in one of the two lists, not both");
});

test("no line is left over: every one is asked for by a page", () => {
  // (that every line a page asks for exists is the type checker's job: t() takes only the keys of the two lists)
  const pages = [...uiFiles.map((name) => `ui/${name}`), "main.tsx", "my.tsx", "api.ts"].map(client).join("\n") + words.buyer.rest + words.merchant.rest;
  const keys = [...words.buyer.keys, ...words.merchant.keys];
  assert.deepEqual(keys.filter((key) => !pages.includes(`"${key}"`)).sort(), [], "in i18n.ts or i18n-my.ts, asked for by no page");
});

test("a buyer's page asks only for words it downloads, and a merchant's word is only a merchant's", () => {
  const buyer = buyerFiles.map(client).join("\n") + words.buyer.rest;
  assert.deepEqual(words.merchant.keys.filter((key) => buyer.includes(`"${key}"`)).sort(), [], "move these to i18n.ts: a buyer's page uses them");
  const merchant = [...uiFiles.map((name) => `ui/${name}`).filter((path) => !buyerFiles.includes(path)), "my.tsx"].map(client).join("\n");
  const merchantOnly = words.buyer.keys.filter((key) => merchant.includes(`"${key}"`) && !buyer.includes(`"${key}"`));
  assert.deepEqual(merchantOnly.sort(), [], "move these to i18n-my.ts: only the merchant's pages use them");
});
