/**
 * The Worker's own classes (src/server/worker.ts), loaded on Node: `VaultDO` on Node's SQLite,
 * with a registry whose answer a test can hold back. What is tested here is the one thing about
 * them that neither the plain functions nor a run on the platform can show: that a notice which
 * does its work while the object waits for the registry is counted, so that the sign-in waiting
 * there opens nothing (flows.ts, `signInHere`; the review of #814, finding 1).
 *
 * worker.ts is bundled as it is; only `cloudflare:workers`, which exists on the platform alone,
 * is replaced, by two base classes that keep what they are given.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { newId } from "../src/core/ids";
import { isSetUp, type SignIn } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import type { Entered } from "../src/server/flows";
import { checkSession, hashOf, newToken } from "../src/server/sessions";
import { sqlite } from "./sqlremote";

type Storage = { sql: Db["sql"]; transactionSync: Db["atomically"]; deleteAll(): Promise<void> };
type Vault = { signIn(made: SignIn & { stamp: string }): Promise<Entered>; signEveryoneOut(): void; erase(): Promise<void> };
type Classes = { VaultDO: new (ctx: { storage: Storage }, env: object) => Vault };

const A = "uaaaaaa1";
const kept = mkdtempSync(join(tmpdir(), "moneylens-objects-"));
after(() => rmSync(kept, { recursive: true, force: true }));

const classes: Promise<Classes> = (async () => {
  const base = join(kept, "cloudflare-workers.mjs");
  writeFileSync(base, `export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n`);
  const out = join(kept, "worker.mjs");
  await build({ entryPoints: ["src/server/worker.ts"], bundle: true, format: "esm", platform: "node", target: "es2022", outfile: out, alias: { "cloudflare:workers": base }, logLevel: "silent" });
  return (await import(pathToFileURL(out).href)) as Classes;
})();

/** An account's object on Node's SQLite, and a registry that answers `stampNow` when the test says so. */
async function world() {
  const { VaultDO } = await classes;
  let db = sqlite();
  const emptied: (() => void)[] = [];
  let hold = false;
  const storage: Storage = {
    sql: { exec: (query, ...args) => db.sql.exec(query, ...args) },
    transactionSync: (work) => db.atomically(work),
    // (emptying takes a moment when the test says so, as it may on the platform)
    deleteAll: async () => {
      db = sqlite();
      if (hold) await new Promise<void>((resolve) => emptied.push(resolve));
    },
  };
  let stamp = "";
  const waiting: (() => void)[] = [];
  let asked = 0;
  const registry = {
    stampNow: async (): Promise<string> => {
      asked++;
      const read = stamp;
      await new Promise<void>((resolve) => waiting.push(resolve));
      return read;
    },
  };
  const env = { ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A, REGISTRY: { idFromName: (name: string) => name, get: (name: string) => (assert.equal(name, "registry"), registry) } };
  const vault = new VaultDO({ storage }, env);
  const hash = (await hashOf(newToken()))!;
  const made = (): SignIn & { stamp: string } => ({ account: A, session: newId(), hash, label: "Chrome on Windows", owner: false, stamp });
  /** Lets the registry's answers go, once every sign-in waiting has asked. */
  const answer = async (): Promise<void> => {
    for (let i = 0; i < 20 && waiting.length === 0; i++) await new Promise((r) => setImmediate(r));
    for (const go of waiting.splice(0)) go();
  };
  return {
    vault,
    made,
    answer,
    hash,
    db: () => db,
    asked: () => asked,
    restamp: () => (stamp = newId()),
    holdEmptying: () => (hold = true),
    finishEmptying: () => emptied.splice(0).forEach((go) => go()),
    live: () => isSetUp(db) && checkSession(db, hash, Date.now()) !== null,
  };
}

test("the object opens a session when nothing came in between, and asks the registry before it does", async () => {
  const w = await world();
  const pending = w.vault.signIn(w.made());
  await w.answer();
  assert.equal(await pending, "ok");
  assert.equal(w.asked(), 1);
  assert.equal(w.live(), true);
  // the stamp the Worker read is the one compared: another, or none, opens nothing
  for (const stamp of [newId(), undefined as unknown as string, 7 as unknown as string]) {
    const other = w.vault.signIn({ ...w.made(), stamp });
    await w.answer();
    assert.equal(await other, "try-again");
  }
  // a stamp set since the Worker read its own: nothing either
  const late = w.made();
  w.restamp();
  const stale = w.vault.signIn(late);
  await w.answer();
  assert.equal(await stale, "try-again");
  assert.equal(w.db().sql.exec(`SELECT COUNT(*) AS n FROM sessions`).toArray()[0]?.n, 1);
});

test("a change of address that is done here while the object waits for the registry: the sign-in opens nothing", async () => {
  const w = await world();
  const first = w.vault.signIn(w.made());
  await w.answer();
  assert.equal(await first, "ok");
  const pending = w.vault.signIn(w.made());
  for (let i = 0; i < 20 && w.asked() < 2; i++) await new Promise((r) => setImmediate(r));
  // (the notice's own stamp was set after the object's read, so the stamp it reads is still the one it began under)
  w.vault.signEveryoneOut();
  await w.answer();
  assert.equal(await pending, "try-again");
  assert.equal(w.live(), false);
  assert.equal(w.db().sql.exec(`SELECT COUNT(*) AS n FROM sessions`).toArray()[0]?.n, 0);
  // and the next one, which began after it, goes through
  const next = w.vault.signIn(w.made());
  await w.answer();
  assert.equal(await next, "ok");
});

test("an account emptied while the object waits for the registry: the sign-in writes nothing, even before the emptying is over", async () => {
  const w = await world();
  const first = w.vault.signIn(w.made());
  await w.answer();
  assert.equal(await first, "ok");
  const pending = w.vault.signIn(w.made());
  for (let i = 0; i < 20 && w.asked() < 2; i++) await new Promise((r) => setImmediate(r));
  w.holdEmptying();
  const emptying = w.vault.erase();
  // the registry answers while the storage is still being emptied
  await w.answer();
  assert.equal(await pending, "try-again");
  assert.equal(isSetUp(w.db()), false);
  w.finishEmptying();
  await emptying;
  assert.equal(isSetUp(w.db()), false);
});

test("a notice that came and went before the sign-in reached the object is told by the stamp alone", async () => {
  const w = await world();
  const began = w.made();
  // the whole notice: a new stamp, then its work here
  w.restamp();
  w.vault.signEveryoneOut();
  const pending = w.vault.signIn(began);
  await w.answer();
  assert.equal(await pending, "try-again");
  assert.equal(isSetUp(w.db()), false);
});

test("with no origin set, the object opens nothing and asks nobody", async () => {
  const { VaultDO } = await classes;
  const db = sqlite();
  const vault = new VaultDO({ storage: { sql: db.sql, transactionSync: (work) => db.atomically(work), deleteAll: async () => {} } }, { GATE: "list", ALLOWED_ACCOUNTS: A });
  assert.equal(await vault.signIn({ account: A, session: newId(), hash: (await hashOf(newToken()))!, label: "x", owner: false, stamp: "" }), "refused");
  assert.equal(isSetUp(db), false);
});
