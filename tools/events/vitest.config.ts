// Tests run inside the Workers runtime (local D1 and KV, no network): the parsers on saved feeds
// in tests/fixtures, and a whole day's run against those feeds.
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { buildSync } from "esbuild";
import { defineConfig } from "vitest/config";

// The rooms server (the ROOMS and MAIL bindings: who a session is, and its mail door) is a stand-in,
// tests/rooms/worker.ts, made into one script here (as tools/tuan does).
const rooms = buildSync({ entryPoints: ["tests/rooms/worker.ts"], bundle: true, format: "esm", target: "es2022", external: ["cloudflare:workers"], write: false }).outputFiles[0].text;

export default defineConfig({
  // (no remote bindings: Workers AI only answers in Cloudflare; tests stand in for it, see tests/ai.test.ts)
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: { workers: [{ name: "changle-rooms", modules: true, script: rooms, compatibilityDate: "2026-10-26" }] },
    }),
  ],
  // CSS is skipped in tests (imports come back empty), except the site's tokens, which
  // tests/page.test.ts reads as text to check the page's copy of them
  test: { css: { include: [/site\/src\/styles\/tokens\.css/] } },
});
