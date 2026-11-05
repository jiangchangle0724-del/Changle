// Build the game's pages into dist/client/hide (served at changle.ca/hide by the Worker):
//   app.html, app.js (the lobby and screens), arena.js (three.js and the 3D arena, loaded when a round
//   starts), app.css (fonts, changle.ca's tokens, the game's styles), fonts/, art/, licences.txt.
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const out = "dist/client/hide";
await rm("dist/client", { recursive: true, force: true });
await mkdir(out, { recursive: true });

// The art (credited in src/client/ui/Credits.tsx and DESIGN.md) and the fonts ship as files.
await cp("src/client/art", `${out}/art`, { recursive: true });
await mkdir(`${out}/fonts`, { recursive: true });
for (const font of ["unbounded.woff2", "figtree.woff2"]) await copyFile(`src/client/fonts/${font}`, `${out}/fonts/${font}`);

// app.html, not index.html: the bare /hide leads to the game's card on changle.ca, which the Worker
// decides, so no file may answer it first.
await copyFile("src/client/index.html", `${out}/app.html`);
const css = async () =>
  (await readFile("src/client/fonts/fonts.css", "utf8")) + "\n" + (await readFile("src/client/tokens.css", "utf8")) + "\n" + (await readFile("src/client/styles.css", "utf8"));
await writeFile(`${out}/app.css`, await css());

// Third-party licences in full: the bundles carry no comments, so the texts ship beside them.
const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const THIRD_PARTY = [
  ["Preact", "https://preactjs.com/", "node_modules/preact/LICENSE"],
  ["three.js", "https://threejs.org/", "node_modules/three/LICENSE"],
  // its licence is only in the header of its source
  ["qrcode-generator", "https://github.com/kazuhikoarase/qrcode-generator", MIT("2009 Kazuhiko Arase")],
  ["Unbounded (font)", "https://fonts.google.com/specimen/Unbounded", "src/client/fonts/licences/Unbounded-OFL.txt"],
  ["Figtree (font)", "https://fonts.google.com/specimen/Figtree", "src/client/fonts/licences/Figtree-OFL.txt"]
];
let licences = "藏在人群里 · Hide in the Crowd: third-party code and fonts, and their licences.\n" +
  "The art: see the credits page (/hide/credits) and DESIGN.md.\n\n";
for (const [name, url, file] of THIRD_PARTY) {
  const text = file.startsWith("MIT License") ? file : await readFile(file, "utf8").catch(() => null);
  if (!text) throw new Error(`missing licence text for ${name}: ${file}`);
  licences += `${"=".repeat(78)}\n${name}\n${url}\n${"=".repeat(78)}\n\n${text.trim()}\n\n`;
}
await writeFile(`${out}/licences.txt`, licences);

const context = await esbuild.context({
  entryPoints: { app: "src/client/main.tsx" },
  outdir: out,
  bundle: true,
  // the 3D arena (three.js) is its own file, fetched when a round starts: the lobby opens fast
  splitting: true,
  format: "esm",
  chunkNames: "[name]-[hash]",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2020", "chrome80", "safari14.1"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "info",
  metafile: true
});
if (watch) {
  await context.watch();
  console.log("watching…");
} else {
  const result = await context.rebuild();
  await context.dispose();
  const sizes = Object.entries(result.metafile.outputs)
    .filter(([file]) => file.endsWith(".js"))
    .map(([file, info]) => `${file.replace(`${out}/`, "")} ${(info.bytes / 1024).toFixed(0)} KB`);
  console.log(sizes.join("\n"));
}
