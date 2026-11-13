// Build the pages into dist/client/tuan (served at changle.ca/tuan by the Worker):
//   index.html                  the one page (home, every group buy, every order)
//   assets/app-<hash>.js|css    the script and the styles (fonts, changle.ca's tokens, this tool's own)
//   assets/fonts/               the site's two fonts
//   licences.txt                the fonts' licences
// File names carry a hash of their contents, so phones keep them for a year and still get a new
// version the moment there is one (the page itself is never kept: src/server/worker.ts).
// wrangler runs this before `wrangler dev` and `wrangler deploy` (build.command in wrangler.jsonc).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change (plain names, nothing minified)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const out = "dist/client/tuan";
await rm("dist/client", { recursive: true, force: true });
await mkdir(`${out}/assets/fonts`, { recursive: true });

for (const font of ["unbounded.woff2", "figtree.woff2"]) await copyFile(`src/client/fonts/${font}`, `${out}/assets/fonts/${font}`);

const licences = ["Unbounded", "Figtree"].map(async (name) => `${name} (font), SIL Open Font License 1.1\n\n${await readFile(`src/client/fonts/licences/${name}-OFL.txt`, "utf8")}`);
await writeFile(`${out}/licences.txt`, `跟一单 · Count Me In: third-party fonts and their licences.\n\n${(await Promise.all(licences)).join("\n\n")}`);

// Scripts, styles and fonts never change under one name: a year, no questions asked.
await writeFile("dist/client/_headers", "/tuan/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n");

const css = async () => (await Promise.all(["src/client/fonts/fonts.css", "src/client/tokens.css", "src/client/styles.css"].map((file) => readFile(file, "utf8")))).join("\n");

async function page(js, cssName) {
  const html = await readFile("src/client/index.html", "utf8");
  await writeFile(`${out}/index.html`, html.replace("__JS__", js).replace("__CSS__", cssName));
}

const options = {
  entryPoints: { app: "src/client/main.tsx" },
  outdir: `${out}/assets`,
  format: "iife",
  bundle: true,
  target: ["es2019", "chrome80", "safari14.1"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const styles = async () => writeFile(`${out}/assets/app.css`, await css());
  await styles();
  await page("app.js", "app.css");
  const ctx = await esbuild.context({ ...options, sourcemap: "inline", plugins: [{ name: "styles", setup: (build) => build.onEnd(styles) }] });
  await ctx.watch();
  console.log("watching…");
} else {
  const built = await esbuild.build({ ...options, minify: true, entryNames: "[name]-[hash]", metafile: true });
  const js = Object.keys(built.metafile.outputs).find((file) => file.endsWith(".js")).split("/").pop();
  const { code } = await esbuild.transform(await css(), { loader: "css", minify: true, target: options.target });
  const cssName = `app-${createHash("sha256").update(code).digest("hex").slice(0, 8).toUpperCase()}.css`;
  await writeFile(`${out}/assets/${cssName}`, code);
  await page(js, cssName);
}
