// For tests that load Worker code: npx tsx --import ./tests/support/cloudflare.mjs tests/hub.test.ts
import { register } from "node:module";
register("./cloudflare-loader.mjs", import.meta.url);
