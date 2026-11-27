// Builds the app's pages (web/app) into dist/app, which the Worker hands out (src/server/worker.ts,
// and `assets` in wrangler.jsonc):
//   index.html                  the one page
//   assets/app-<hash>.js|css    the script and the styles (the fonts, changle.ca's tokens, the app's own)
//   assets/fonts/               the site's two fonts
//   assets/icon.svg             the tab's icon
//   licences.txt                the licences of the fonts and of Preact
// A file under assets/ never changes under one name (its name carries a hash of what is in it, and
// the fonts and the icon do not change), so browsers keep them for a year; the page itself is
// never kept. Nothing is loaded from anywhere else, and no script is written into the page: the
// page's content security policy allows neither.
//   node scripts/build-app.mjs           build once
//   node scripts/build-app.mjs --watch   rebuild on change (plain names, nothing minified)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const out = "dist/app";
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/assets/fonts`, { recursive: true });

for (const font of ["unbounded.woff2", "figtree.woff2"]) await copyFile(`web/app/fonts/${font}`, `${out}/assets/fonts/${font}`);
await copyFile("web/app/icon.svg", `${out}/assets/icon.svg`);

const licences = ["Unbounded", "Figtree"].map(async (name) => `${name} (font), SIL Open Font License 1.1\n\n${await readFile(`web/app/fonts/licences/${name}-OFL.txt`, "utf8")}`);
licences.push(readFile("node_modules/preact/LICENSE", "utf8").then((text) => `Preact, MIT License\n\n${text}`));
await writeFile(`${out}/licences.txt`, `心里有数 · MoneyLens: third-party fonts and code, and their licences.\n\n${(await Promise.all(licences)).join("\n\n")}`);

const css = async () => (await Promise.all(["web/app/fonts/fonts.css", "web/app/tokens.css", "web/app/styles.css"].map((file) => readFile(file, "utf8")))).join("\n");

async function page(js, cssName) {
  const html = await readFile("web/app/index.html", "utf8");
  await writeFile(`${out}/index.html`, html.replace("__JS__", js).replace("__CSS__", cssName));
}

const options = {
  entryPoints: { app: "web/app/main.tsx" },
  outdir: `${out}/assets`,
  format: "iife",
  bundle: true,
  target: ["es2019", "chrome80", "safari14.1"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "warning",
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
  const js = Object.keys(built.metafile.outputs)
    .find((file) => file.endsWith(".js"))
    .split("/")
    .pop();
  const { code } = await esbuild.transform(await css(), { loader: "css", minify: true, target: options.target });
  const cssName = `app-${createHash("sha256").update(code).digest("hex").slice(0, 8).toUpperCase()}.css`;
  await writeFile(`${out}/assets/${cssName}`, code);
  await page(js, cssName);
  const size = Object.values(built.metafile.outputs).reduce((sum, file) => sum + file.bytes, 0);
  console.log(`dist/app: script ${Math.round(size / 1024)} KB, styles ${Math.round(code.length / 1024)} KB`);
}
