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
await copyFile("src/client/index.html", out + "/index.html");
await writeFile(out + "/app.css", (await readFile("src/client/tokens.css", "utf8")) + "\n" + (await readFile("src/client/styles.css", "utf8")));

if (watch) {
  await client.watch();
  console.log("watching…");
} else {
  await client.rebuild();
  await client.dispose();
}