import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { buildSync } from "esbuild";
import { defineConfig } from "vitest/config";

// The tests run inside the Workers runtime with a local D1, set up from wrangler.jsonc. The rooms
// server this Worker asks about sign-ins and sends mail through (the ROOMS and MAIL bindings) is a
// stand-in, tests/rooms/worker.ts, made into one script here.
const rooms = buildSync({ entryPoints: ["tests/rooms/worker.ts"], bundle: true, format: "esm", target: "es2022", external: ["cloudflare:workers"], write: false }).outputFiles[0].text;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { workers: [{ name: "changle-rooms", modules: true, script: rooms, compatibilityDate: "2026-10-26" }] },
    }),
  ],
  test: { include: ["tests/*.test.ts"] },
});
