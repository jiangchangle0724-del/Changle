// Tests run inside the Workers runtime (local D1 and KV, no network): the parsers on saved feeds
// in tests/fixtures, and a whole day's run against those feeds.
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
