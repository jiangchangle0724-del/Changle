// Build the web pages: dist/client/trip (the online game, served at changle.ca/trip) and
// dist/demo.html (single-file, single-device demo, also served at changle.ca/trip/demo).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { mkdir, readFile, readdir, writeFile, copyFile, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
// Everything the worker serves sits under /trip, so the files do too (dist/client is the root).
const out = "dist/client/trip";
await rm("dist/client", { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2019", "chrome80", "safari14.1"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "info",
};

// globe.js (three.js) is its own file: only the big screen loads it.
const client = await esbuild.context({ ...common, entryPoints: { app: "src/client/main.tsx", globe: "src/client/globe/main.ts" }, outdir: out, format: "iife" });
// app.html, not index.html: on changle.ca the bare /trip leads to the game's card, which the worker
// decides, so no file may answer it first. The worker serves app.html for room and big-screen links.
await copyFile("src/client/index.html", `${out}/app.html`);
// The web app manifest: added to a Home Screen from a game page, changle.ca opens as an app.
await copyFile("src/client/app.webmanifest", `${out}/app.webmanifest`);

// One stylesheet: the fonts (made by scripts/fonts.mjs), the art, then the screens.
const FONT_FILES = ["unbounded.woff2", "figtree.woff2", "zcool.woff2", "bigshoulders.woff2", "spacemono-400.woff2", "spacemono-700.woff2"];
const appCss = async () =>
  (await readFile("src/client/fonts/fonts.css", "utf8")) + (await readFile("src/client/art/art.css", "utf8")) + (await readFile("src/client/styles.css", "utf8"));
await mkdir(`${out}/fonts`, { recursive: true });
for (const f of FONT_FILES) await copyFile(`src/client/fonts/${f}`, `${out}/fonts/${f}`);
await writeFile(`${out}/app.css`, await appCss());
// The city photos and recordings (credited in src/client/media.ts). Pages fetch them when they're
// needed, so they ship as files beside the game and stay out of the single-file pages.
for (const kind of ["photos", "sounds"]) {
  await mkdir(`${out}/${kind}`, { recursive: true });
  for (const f of await readdir(`src/client/media/${kind}`)) if (!f.startsWith(".")) await copyFile(`src/client/media/${kind}/${f}`, `${out}/${kind}/${f}`);
}
/** The same stylesheet with the fonts inside it, for the single-file pages. */
async function inlineCss() {
  let css = await appCss();
  for (const f of FONT_FILES) css = css.replace(`url(fonts/${f})`, `url(data:font/woff2;base64,${(await readFile(`src/client/fonts/${f}`)).toString("base64")})`);
  return css;
}

// Third-party licences in full: the code inside the pages, the map data and the fonts. The bundles
// carry no comments, so the texts ship beside them as licences.txt, and inside the single-file pages
// as a text block the credits page shows.
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
  // Its licence is only in the header of its source.
  ["qrcode-generator", "https://github.com/kazuhikoarase/qrcode-generator", MIT("2009 Kazuhiko Arase")],
  ["world-atlas (the map: Natural Earth 1:110m land, public domain)", "https://github.com/topojson/world-atlas", "node_modules/world-atlas/LICENSE"],
  ["Unbounded", "https://fonts.google.com/specimen/Unbounded", "src/client/fonts/licences/Unbounded-OFL.txt"],
  ["Figtree", "https://fonts.google.com/specimen/Figtree", "src/client/fonts/licences/Figtree-OFL.txt"],
  ["ZCOOL QingKe HuangYou", "https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou", "src/client/fonts/licences/ZCOOLQingKeHuangYou-OFL.txt"],
  ["Big Shoulders Display", "https://fonts.google.com/specimen/Big+Shoulders+Display", "src/client/fonts/licences/BigShouldersDisplay-OFL.txt"],
  ["Space Mono", "https://fonts.google.com/specimen/Space+Mono", "src/client/fonts/licences/SpaceMono-OFL.txt"],
];
async function licences() {
  const parts = [];
  for (const [name, url, src] of THIRD_PARTY) {
    const text = src.includes("\n") ? src : await readFile(src, "utf8");
    parts.push(`=== ${name}\n${url}\n\n${text.trim()}\n`);
  }
  parts.push("=== Weather data\nhttps://open-meteo.com/\n\nWeather data by Open-Meteo.com, licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/\n");
  return `Been There, Bought That (到此一游): third-party licences\n\n${parts.join("\n")}`;
}
const LICENCES = await licences();
await writeFile(`${out}/licences.txt`, LICENCES);
/** The licences inside a single-file page, for the credits page to show. */
const licenceBlock = () => `<script type="text/plain" id="licences">${LICENCES.replace(/<\//g, "<\\/")}</script>`;

// Inside a claude.ai artifact the page is wrapped for us and :root already clears the phone's
// notch and home bar, so the screens drop their own top inset there.
const ARTIFACT_CSS = `
.home, .lobby, .over { padding-top: 24px; }
.top { top: env(safe-area-inset-top, 0px); padding-top: 8px; }
.top::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--night); }
`;

async function demo() {
  // One self-contained page: the same client, with the room running inside the page.
  const res = await esbuild.build({ ...common, entryPoints: ["src/local/demo.tsx"], write: false, format: "iife" });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = await inlineCss();
  const body = `<div id="app"></div><script>${js}</script>${licenceBlock()}`;
  // Standalone file you can open from disk.
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0e0c22"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="开席"><link rel="manifest" href="/trip/app.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
  const html = `<!doctype html><html lang="zh-CN"><head>${head}<title>到此一游试玩版</title><style>${css}</style></head><body>${body}</body></html>`;
  await writeFile("dist/demo.html", html);
  // changle.ca/trip/demo: a game's "one phone" way to play.
  await writeFile(`${out}/demo.html`, html);
  // Artifact page (the artifact service adds the document skeleton).
  const artifact = `<title>到此一游试玩版</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${css}${ARTIFACT_CSS}</style>\n${body}\n`;
  await writeFile("dist/demo.artifact.html", artifact);
  console.log(`dist/demo.html ${(html.length / 1024).toFixed(0)} KB, dist/demo.artifact.html ${(artifact.length / 1024).toFixed(0)} KB`);
}

// Step 5 style sheet: the three art directions side by side (dist/styles.html + an artifact copy).
const SAMPLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=ZCOOL+QingKe+HuangYou&family=Space+Mono:wght@400;700&family=Baloo+2:wght@800&family=ZCOOL+KuaiLe&family=Outfit:wght@600;800&display=swap";
async function samples() {
  const res = await esbuild.build({ ...common, entryPoints: ["src/samples/styles.tsx"], write: false, format: "iife", logLevel: "warning" });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = (await readFile("src/client/art/art.css", "utf8")) + (await readFile("src/samples/styles.css", "utf8"));
  const head = `<title>到此一游美术样张</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="stylesheet" href="${SAMPLE_FONTS}">\n<style>${css}</style>`;
  const body = `<div id="app"></div><script>${js}</script>${licenceBlock()}`;
  await writeFile("dist/styles.html", `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${body}</body></html>`);
  await writeFile("dist/styles.artifact.html", `${head}\n${body}\n`);
  console.log(`dist/styles.html ${((head.length + body.length) / 1024).toFixed(0)} KB`);
}

if (watch) {
  await client.watch();
  console.log("watching…");
} else {
  await client.rebuild();
  await client.dispose();
  await demo();
  await samples();
}
