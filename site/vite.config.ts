import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The photo reader's runtime (MediaPipe's WebAssembly, Apache 2.0) is served from /mp beside its two
 * models (public/mp): straight from node_modules while developing, copied into the build.
 */
function mediapipeRuntime(): Plugin {
  const dir = resolve(__dirname, "node_modules/@mediapipe/tasks-vision/wasm");
  const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];
  return {
    name: "mediapipe-runtime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = files.find((x) => req.url?.split("?")[0] === `/mp/${x}`);
        if (!f) return next();
        res.setHeader("Content-Type", f.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        createReadStream(resolve(dir, f)).pipe(res);
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: `mp/${f}`, source: readFileSync(resolve(dir, f)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeRuntime()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
  server: {
    // 到此一游 lives at changle.ca/trip (games/been-there in the changle-ca repository). Run it
    // locally with `npx wrangler dev --port 8799` there and the site's /trip reaches it here too.
    // 随便 lives at changle.ca/eat the same way (tools/suibian): `npx wrangler dev --port 8798` there.
    proxy: {
      "/trip": { target: "http://127.0.0.1:8799", ws: true, changeOrigin: false },
      "/eat": { target: "http://127.0.0.1:8798", ws: true, changeOrigin: false },
    },
  },
});
