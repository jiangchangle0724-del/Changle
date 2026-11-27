// The Worker's own module (src/server/worker.ts), loaded on Node for the tests that need the thing
// itself and not the plain functions under it: tests/objects.test.ts, tests/pages.test.ts.
//
// worker.ts is bundled as it is; only `cloudflare:workers`, which exists on the platform alone, is
// replaced, by two base classes that keep what they are given.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

/** worker.ts as a module: its default export (`fetch`), `VaultDO`, `Registry`, `Internal`. Typed by whoever asks. */
export function workerModule(): Promise<unknown> {
  const kept = mkdtempSync(join(tmpdir(), "moneylens-worker-"));
  after(() => rmSync(kept, { recursive: true, force: true }));
  return (async () => {
    const base = join(kept, "cloudflare-workers.mjs");
    writeFileSync(base, `export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n`);
    const out = join(kept, "worker.mjs");
    await build({ entryPoints: ["src/server/worker.ts"], bundle: true, format: "esm", platform: "node", target: "es2022", outfile: out, alias: { "cloudflare:workers": base }, logLevel: "silent" });
    return import(pathToFileURL(out).href);
  })();
}
