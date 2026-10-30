// Build the web pages into dist/client/eat (served at changle.ca/eat).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
// Everything the worker serves sits under /eat, so the files do too (dist/client is the root).
const out = "dist/client/eat";
await rm("dist/client", { recursive: true, force: true });
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
// The one page: /eat/ (home), and the worker serves it for /eat/r/1234 and /eat/r/1234/rate too.
await copyFile("src/client/index.html", `${out}/index.html`);
await copyFile("src/client/styles.css", `${out}/app.css`);

if (watch) {
  await ctx.watch();
  console.log("watching…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
