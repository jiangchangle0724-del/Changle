// Build the pages into dist/client/party (served at changle.ca/party).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
// Everything the Worker serves sits under /party, so the files do too (dist/client is the root).
const out = "dist/client/party";
await rm("dist/client", { recursive: true, force: true });
await mkdir(out, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: { screen: "src/client/screen.ts", join: "src/client/join.ts", moves: "src/client/moves.ts" },
  outdir: out,
  format: "iife",
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2019", "chrome80", "safari14.1"],
  legalComments: "none",
  logLevel: "info",
});
// /party/ (which page is which), /party/screen (the speaker), /party/join (a phone), /party/moves
// (the moves, danced by the coach)
await copyFile("src/client/index.html", `${out}/index.html`);
await copyFile("src/client/screen.html", `${out}/screen.html`);
await copyFile("src/client/join.html", `${out}/join.html`);
await copyFile("src/client/moves.html", `${out}/moves.html`);
await copyFile("src/client/party.css", `${out}/party.css`);

if (watch) {
  await ctx.watch();
  console.log("watching…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
