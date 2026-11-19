// Tests run inside the Workers runtime (local D1 and KV, no network): the parsers on saved feeds
// in tests/fixtures, and a whole day's run against those feeds.
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // (no remote bindings: Workers AI only answers in Cloudflare; tests stand in for it, see tests/ai.test.ts)
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" }, remoteBindings: false })],
  // CSS is skipped in tests (imports come back empty), except the site's tokens, which
  // tests/page.test.ts reads as text to check the page's copy of them
  test: { css: { include: [/site\/src\/styles\/tokens\.css/] } },
});
