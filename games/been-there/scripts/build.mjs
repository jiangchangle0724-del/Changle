// Build the web pages: dist/client (online game) and dist/demo.html (single-file, single-device demo).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const out = "dist/client";
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

const client = await esbuild.context({ ...common, entryPoints: { app: "src/client/main.tsx" }, outdir: out, format: "iife" });
await copyFile("src/client/index.html", `${out}/index.html`);
await copyFile("src/client/styles.css", `${out}/app.css`);

async function demo() {
  // One self-contained HTML file: the same client, with the room running inside the page.
  const res = await esbuild.build({ ...common, entryPoints: ["src/local/demo.tsx"], write: false, format: "iife" });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = await readFile("src/client/styles.css", "utf8");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>到此一游 · 单机试玩</title><style>${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`;
  await writeFile("dist/demo.html", html);
  console.log(`dist/demo.html ${(html.length / 1024).toFixed(0)} KB`);
}

if (watch) {
  await client.watch();
  console.log("watching…");
} else {
  await client.rebuild();
  await client.dispose();
  await demo();
}
