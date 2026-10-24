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

// Inside a claude.ai artifact the page is wrapped for us and :root already clears the phone's
// notch and home bar, so the screens drop their own top inset there.
const ARTIFACT_CSS = `
.home, .lobby, .over { padding-top: 24px; }
.top { top: env(safe-area-inset-top, 0px); padding-top: 8px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--surface); }
`;

async function demo() {
  // One self-contained page: the same client, with the room running inside the page.
  const res = await esbuild.build({ ...common, entryPoints: ["src/local/demo.tsx"], write: false, format: "iife" });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = await readFile("src/client/styles.css", "utf8");
  const body = `<div id="app"></div><script>${js}</script>`;
  // Standalone file you can open from disk.
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>到此一游试玩版</title><style>${css}</style></head><body>${body}</body></html>`;
  await writeFile("dist/demo.html", html);
  // Artifact page (the artifact service adds the document skeleton).
  const artifact = `<title>到此一游试玩版</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${css}${ARTIFACT_CSS}</style>\n${body}\n`;
  await writeFile("dist/demo.artifact.html", artifact);
  console.log(`dist/demo.html ${(html.length / 1024).toFixed(0)} KB, dist/demo.artifact.html ${(artifact.length / 1024).toFixed(0)} KB`);
}

if (watch) {
  await client.watch();
  console.log("watching…");
} else {
  await client.rebuild();
  await client.dispose();
  await demo();
}
