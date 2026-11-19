// Build the web pages into dist/client/eat (served at changle.ca/eat).
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild on change
import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
// Everything the worker serves sits under /eat, so the files do too (dist/client is the root).
const out = "dist/client/eat";
await rm("dist/client", { recursive: true, force: true });
await mkdir(`${out}/fonts`, { recursive: true });

for (const font of ["unbounded.woff2", "figtree.woff2"]) await copyFile(`src/client/fonts/${font}`, `${out}/fonts/${font}`);
const licences = await Promise.all(["Unbounded", "Figtree"].map(async (name) => `${name} (font), SIL Open Font License 1.1\n\n${await readFile(`src/client/fonts/licences/${name}-OFL.txt`, "utf8")}`));
await writeFile(`${out}/licences.txt`, `随便 · Whatever's Fine: third-party fonts and their licences.\n\n${licences.join("\n\n")}`);

const target = ["es2019", "chrome80", "safari14.1"];
const styles = async () => {
  const css = (await Promise.all(["src/client/fonts/fonts.css", "src/client/tokens.css", "src/client/styles.css"].map((file) => readFile(file, "utf8")))).join("\n");
  const { code } = await esbuild.transform(css, { loader: "css", minify: !watch, target });
  await writeFile(`${out}/app.css`, code);
};

const ctx = await esbuild.context({
  entryPoints: { app: "src/client/main.tsx" },
  outdir: out,
  format: "iife",
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target,
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "info",
  plugins: [{ name: "styles", setup: (build) => build.onEnd(styles) }],
});
// The app's page: /eat/ (home), and the worker serves it for /eat/r/1234 and /eat/r/1234/rate too.
await copyFile("src/client/index.html", `${out}/index.html`);
// Plain pages, served at /eat/privacy and /eat/terms (Google sign-in needs both to be public).
await copyFile("src/client/privacy.html", `${out}/privacy.html`);
await copyFile("src/client/terms.html", `${out}/terms.html`);

if (watch) {
  await ctx.watch();
  console.log("watching…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
