// Build the pages into dist/client/tuan (served at changle.ca/tuan by the Worker):
//   index.html                  the one page (home, every group buy, every order, the merchant's pages)
//   assets/app-<hash>.js        the script of the buyer's pages (src/client/main.tsx)
//   assets/my-<hash>.js         the merchant's pages, loaded only at /tuan/my… (src/client/my.tsx)
//   assets/chunk-<hash>.js      what the two share (Preact, the words and parts both use)
//   assets/app-<hash>.css       the styles (fonts, changle.ca's tokens, this tool's own)
//   assets/fonts/               the site's two fonts
//   licences.txt                the fonts' licences
// A buyer's phone downloads app and its chunks only: the build stops if any of the merchant's
// pages ends up in them, and says how big each part is.
// File names carry a hash of their contents, so phones keep them for a year and still get a new
// version the moment there is one (the page itself is never kept: src/server/worker.ts).
// wrangler runs this before `wrangler dev` and `wrangler deploy` (build.command in wrangler.jsonc).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change (plain names, nothing minified)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

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

/** `preload`: the scripts the page's own script imports, fetched alongside it rather than after it. */
async function page(js, cssName, preload = []) {
  const html = await readFile("src/client/index.html", "utf8");
  const links = preload.map((name) => `    <link rel="modulepreload" href="/tuan/assets/${name}" />\n`).join("");
  await writeFile(`${out}/index.html`, html.replace("__JS__", js).replace("__CSS__", cssName).replace("__PRELOAD__", links));
}

/** The merchant's pages: none may be in what a buyer downloads. */
const MERCHANT = ["src/client/my.tsx", "src/client/i18n-my.ts", "src/client/ui/My.tsx", "src/client/ui/MyOffer.tsx", "src/client/ui/Editor.tsx", "src/client/ui/Owner.tsx", "src/client/ui/ShopEdit.tsx", "src/client/ui/Apply.tsx", "src/client/ui/Review.tsx", "src/client/ui/photos.ts", "src/client/ui/sheets.ts", "src/client/ui/poster.ts", "node_modules/uqr/dist/index.mjs", "src/engine/chain.ts"];

/** The files a script brings in before it runs: itself, and what it imports (not what it may import later). */
function closure(outputs, file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const one of outputs[file].imports) if (one.kind === "import-statement") closure(outputs, one.path, seen);
  return seen;
}

const options = {
  entryPoints: { app: "src/client/main.tsx", my: "src/client/my.tsx" },
  outdir: `${out}/assets`,
  format: "esm",
  splitting: true,
  chunkNames: "chunk-[hash]",
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
  const { outputs } = built.metafile;
  const entry = (name) => Object.keys(outputs).find((file) => outputs[file].entryPoint === name);
  const buyer = closure(outputs, entry("src/client/main.tsx"));
  const merchant = [...closure(outputs, entry("src/client/my.tsx"))].filter((file) => !buyer.has(file));
  const strayed = [...buyer].flatMap((file) => Object.keys(outputs[file].inputs)).filter((input) => MERCHANT.includes(input));
  if (strayed.length) throw new Error(`a buyer's page would download the merchant's: ${strayed.join(", ")}`);
  const size = async (files) => {
    const bytes = await Promise.all(files.map((file) => readFile(file)));
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    return `${kb(bytes.reduce((sum, one) => sum + one.length, 0))} (${kb(bytes.reduce((sum, one) => sum + gzipSync(one).length, 0))} gzipped)`;
  };
  console.log(`  a buyer's page: ${await size([...buyer])}; the merchant's pages add ${await size(merchant)}`);

  const name = (file) => file.split("/").pop();
  const { code } = await esbuild.transform(await css(), { loader: "css", minify: true, target: options.target });
  const cssName = `app-${createHash("sha256").update(code).digest("hex").slice(0, 8).toUpperCase()}.css`;
  await writeFile(`${out}/assets/${cssName}`, code);
  await page(name(entry("src/client/main.tsx")), cssName, [...buyer].filter((file) => file !== entry("src/client/main.tsx")).map(name));
}
