// Build the web pages into dist/client/tools/suibian, the path they're served at on changle.ca
// (BASE in src/room/protocol.ts).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const out = "dist/client/tools/suibian";
await mkdir(out, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: { app: "src/client/main.tsx" },
  outdir: out,
  format: "iife",
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2019", "chrome80", "safari14.1"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "info",
});
await copyFile("src/client/index.html", `${out}/index.html`);
await copyFile("src/client/styles.css", `${out}/app.css`);

if (watch) {
  await ctx.watch();
  console.log("watching…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
