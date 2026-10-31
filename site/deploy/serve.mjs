// A tiny read-only file server for the site folder, on this computer only: logs and results
// (songcache/build.log, src/data/songs.ts, deploy/last-deploy.txt) can be read in a browser.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || file.includes("node_modules")) { res.writeHead(403); return res.end("no"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    const start = Number(url.searchParams.get("start") || 0), len = Number(url.searchParams.get("len") || 0);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "X-Size": String(st.size), "Access-Control-Allow-Origin": "*" });
    fs.createReadStream(file, len ? { start, end: Math.min(st.size - 1, start + len - 1) } : {}).pipe(res);
  });
}).listen(8765, "127.0.0.1", () => console.log("listening on http://127.0.0.1:8765/"));
