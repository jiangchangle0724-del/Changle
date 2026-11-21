// Builds the statement check (web/check) into one file, dist/moneylens-check.html, with everything
// inside it: the page's own code, PDF.js, and the source of PDF.js's worker as a string the page
// starts a Web Worker from. The page loads nothing and can send nothing (web/check/page.html).
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// PDF.js ships its worker as a module. A page opened from a file can start a worker from a string
// of plain script, but not from a string that is a module, so the worker is wrapped as plain script.
const wrapped = await build({
  entryPoints: ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  write: false,
  legalComments: "inline",
  logLevel: "warning",
});
const worker = wrapped.outputFiles[0].text;
const bundle = await build({
  entryPoints: ["web/check/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  write: false,
  legalComments: "inline",
  define: { PDF_WORKER: JSON.stringify(worker) },
  logLevel: "warning",
});
// (inside a <script>, the text "</script" would end it, and "<!--" would open a comment)
const inline = (code) => code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const css = (await readFile("web/check/page.css", "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const html = (await readFile("web/check/page.html", "utf8")).replace("/*STYLE*/", () => inline(css)).replace("/*SCRIPT*/", () => inline(bundle.outputFiles[0].text));
await mkdir("dist", { recursive: true });
await writeFile("dist/moneylens-check.html", html);
console.log(`dist/moneylens-check.html: ${Math.round(html.length / 1024)} KB`);
