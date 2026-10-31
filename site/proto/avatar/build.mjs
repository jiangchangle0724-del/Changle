// Build the avatar preview as one HTML page (styles and script inline) with the photo-reading
// kit beside it in mp/, ready to publish or to serve from any folder.
//
//   node proto/avatar/build.mjs [outDir]     (default proto/avatar/dist)
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "../..");
const out = resolve(process.argv[2] ?? join(here, "dist"));
mkdirSync(join(out, "mp"), { recursive: true });

const res = await build({
  entryPoints: [join(here, "main.tsx")],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  outdir: out,
  jsx: "automatic",
  target: ["es2020", "safari15"],
  define: { "import.meta.env.DEV": "false", "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "empty", ".woff": "empty" },
  logLevel: "warning",
});
const js = res.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = res.outputFiles.find((f) => f.path.endsWith(".css")).text;
const fonts = "https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&family=Unbounded:wght@600..800&display=swap";
const html = `<title>头像小样</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>
`;
writeFileSync(join(out, "index.html"), html);
// the same page in the skeleton a host wraps it in (charset, viewport), to open locally
writeFileSync(
  join(out, "local.html"),
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>`,
);
const wasm = join(site, "node_modules/@mediapipe/tasks-vision/wasm");
copyFileSync(join(wasm, "vision_wasm_internal.js"), join(out, "mp/vision_wasm_internal.js"));
copyFileSync(join(wasm, "vision_wasm_internal.wasm"), join(out, "mp/vision_wasm_internal.wasm"));
for (const f of ["face_landmarker.task", "hair_segmenter.tflite"]) copyFileSync(join(site, "public/mp", f), join(out, "mp", f));
console.log(`${out}/index.html ${(html.length / 1024).toFixed(0)} KB`);
