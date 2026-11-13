import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { ROOMS_STAND_IN } from "./tests/accounts.ts";

// The tests run inside the Workers runtime with a local D1, set up from wrangler.jsonc. The rooms
// server this Worker asks about sign-ins (the ROOMS binding) is a stand-in: tests/accounts.ts.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { workers: [{ name: "changle-rooms", modules: true, script: ROOMS_STAND_IN, compatibilityDate: "2026-10-26" }] },
    }),
  ],
});
