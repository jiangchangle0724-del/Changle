// Starts the server on Cloudflare's own runtime on this machine (`wrangler dev`), with the stand-in
// for the accounts service beside it (tests/accounts), for the tests that need the real thing:
// tests/platform/server.test.ts over plain requests, scripts/check-app.ts with a real browser.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ORIGIN = "https://money.changle.test";
export const MAIN = "https://main.changle.test";

/** A file with comments in it, as plain JSON. */
function plainJson(text: string): string {
  let out = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') quoted = false;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else {
      if (c === '"') quoted = true;
      out += c;
    }
  }
  return out;
}

export type Server = { base: string; port: number; kept: string; stop(): Promise<void> };

/**
 * Starts the Worker with wrangler.jsonc's own settings, except for `vars` (and no address on the internet). `kept`:
 * where its storage is, to start it again on the same. `secure`: over HTTPS, with a certificate wrangler makes for
 * itself, which is what a browser needs before it will keep this server's cookies. `limits`: "own" keeps the two
 * rate limits as wrangler.jsonc sets them; otherwise they are set far out of reach, because every test comes from
 * one address and a suite signs in more often in a minute than a person does.
 */
export async function start(port: number, vars: Record<string, string | undefined>, kept = mkdtempSync(join(tmpdir(), "moneylens-server-")), secure = false, limits: "own" | "far" = "far"): Promise<Server> {
  const settings = JSON.parse(plainJson(readFileSync("wrangler.jsonc", "utf8"))) as { vars: Record<string, string>; main: string; assets: { directory: string }; ratelimits: { simple: { limit: number } }[]; routes?: unknown; build?: unknown; $schema?: unknown };
  if (limits === "far") for (const limiter of settings.ratelimits) limiter.simple.limit = 1_000_000;
  delete settings.routes;
  delete settings.$schema;
  // (the pages are built once, before any server starts: see `before`)
  delete settings.build;
  settings.main = resolve(settings.main);
  settings.assets.directory = resolve(settings.assets.directory);
  settings.vars = { ...settings.vars, ORIGIN, MAIN_SITE: MAIN };
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined) delete settings.vars[name];
    else settings.vars[name] = value;
  }
  const file = join(kept, "moneylens.jsonc");
  writeFileSync(file, JSON.stringify(settings));
  // (a server left behind by a run that was cut short would answer in this one's place, with its own storage and its own idea of the files)
  if (await listening(port)) throw new Error(`port ${port} is taken: a server of an earlier run may still be running (pkill -f "wrangler dev")`);
  const child: ChildProcess = spawn("npx", ["wrangler", "dev", "-c", "tests/accounts/wrangler.jsonc", "-c", file, "--port", String(port), "--ip", "127.0.0.1", "--persist-to", join(kept, "state"), ...(secure ? ["--local-protocol", "https"] : [])], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
  });
  const base = `${secure ? "https" : "http"}://127.0.0.1:${port}`;
  const until = Date.now() + 90_000;
  for (;;) {
    try {
      const answer = secure ? await peek(`${base}/nothing-here`) : await fetch(`${base}/nothing-here`).then(async (got) => ({ status: got.status, text: await got.text() }));
      if ([404, 503].includes(answer.status) && answer.text.includes('"ok":false')) break;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error("wrangler dev did not start");
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    base,
    port,
    kept,
    stop: async () => {
      // wrangler and the runtime it started are one group: ask, then insist
      for (const signal of ["SIGTERM", "SIGKILL"] as const) {
        try {
          process.kill(-child.pid!, signal);
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    },
  };
}

/** One request over HTTPS to this machine, taking the certificate wrangler made for itself (which nothing vouches for). */
export function peek(url: string, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((done, failed) => {
    const request = https.request(url, { method: body === undefined ? "GET" : "POST", rejectUnauthorized: false }, (answer) => {
      let text = "";
      answer.setEncoding("utf8");
      answer.on("data", (piece: string) => (text += piece));
      answer.on("end", () => done({ status: answer.statusCode ?? 0, text }));
    });
    request.on("error", failed);
    request.end(body);
  });
}

/** Is anything listening on this port of this machine? */
function listening(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("error", () => done(false));
  });
}
