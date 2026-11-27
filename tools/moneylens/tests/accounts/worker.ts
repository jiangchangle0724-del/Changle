// A stand-in for the accounts service (site/worker), which is not part of this tool, for runs on
// this machine and in CI (`npm run test:server`). Never published.
//
// As the real one does, it offers `Handoff` over a service binding: `redeem` trades a code once,
// for the audience it was made for, and `exists` says which accounts are still there. A code is
// what the real one's is, 256 random bits, and stands for what a test asked for when it had it
// made (`POST /test/mint`: the account, whether it is the owner's, the nonce, the audience), so a
// test can have one for any account. The real one makes a code only for whoever is signed in to
// the main site.
//
// It is also the door the tests come in by. Requests to it are passed on to MoneyLens untouched,
// as if they had come to money.changle.test, and two more addresses of its own do what the real
// accounts service does over its binding to MoneyLens's `Internal`: say that an account is gone,
// or that its email address changed. A test can also have a code made that brings such a notice
// with it (`during`): the notice is sent, and heard, after the code is traded and before the
// trade is answered, which is the one moment a test cannot otherwise hit (src/server/flows.ts).
//
// `Probe` is not part of the stand-in at all: it shows what this platform does with a transaction
// inside a transaction, which signing in relies on (src/server/account.ts, `signIn`).
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

type Notice = { what: "gone" | "changed"; id: string };
type Env = {
  APP: Fetcher;
  MONEY: { accountGone(id: string): Promise<void>; accountChanged(id: string): Promise<void>; count(): Promise<number> };
  PROBE: DurableObjectNamespace<Probe>;
};

type Stood = { id: string; master: boolean; nonce: string; aud: string; during?: Notice };
const codes = new Map<string, Stood>();
const gone = new Set<string>();

/** What the real accounts service does when an account is deleted or its address changes: its own part first, then the app is told. */
async function tell(env: Env, notice: Notice): Promise<void> {
  if (notice.what === "gone") {
    gone.add(notice.id);
    await env.MONEY.accountGone(notice.id);
  } else await env.MONEY.accountChanged(notice.id);
}

export class Handoff extends WorkerEntrypoint<Env> {
  async redeem(code: string, aud: string): Promise<{ id: string; master: boolean; nonce: string } | null> {
    const stood = codes.get(code);
    if (!stood || stood.aud !== aud) return null;
    codes.delete(code);
    if (stood.during) await tell(this.env, stood.during);
    return { id: stood.id, master: stood.master, nonce: stood.nonce };
  }

  exists(ids: string[]): string[] {
    return ids.filter((id) => !gone.has(id));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    if (url.pathname === "/test/mint") {
      const asked = (await request.json()) as Stood;
      const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const during: Notice | undefined = asked.during && (asked.during.what === "gone" || asked.during.what === "changed") ? { what: asked.during.what, id: String(asked.during.id) } : undefined;
      codes.set(code, { id: String(asked.id), master: asked.master === true, nonce: String(asked.nonce), aud: String(asked.aud), ...(during ? { during } : {}) });
      return Response.json({ code });
    }
    if (url.pathname === "/test/nested") return Response.json(await env.PROBE.get(env.PROBE.idFromName("probe")).nested());
    if (url.pathname === "/test/count") return Response.json({ accounts: await env.MONEY.count() });
    if (url.pathname === "/test/gone" || url.pathname === "/test/changed") {
      try {
        await tell(env, { what: url.pathname === "/test/gone" ? "gone" : "changed", id });
        return new Response("done");
      } catch {
        return new Response("threw", { status: 500 });
      }
    }
    return env.APP.fetch(new Request(`https://money.changle.test${url.pathname}${url.search}`, request));
  },
};

/** What a transaction inside a transaction does here: asked once by the tests, and never by MoneyLens. */
export class Probe extends DurableObject<Env> {
  nested(): { same: boolean; tables: number; rows: number[] } {
    const sql = this.ctx.storage.sql;
    const whole = <T>(work: () => T): T => this.ctx.storage.transactionSync(work);
    const SIGN = Symbol("sign");
    // The inner one finished, then the outer one failed: nothing of either is left, not even the table, and what
    // was thrown comes out as the very thing that was thrown.
    let same = false;
    try {
      whole(() => {
        sql.exec(`CREATE TABLE t (n INTEGER)`);
        sql.exec(`INSERT INTO t VALUES (1)`);
        whole(() => void sql.exec(`INSERT INTO t VALUES (2)`));
        throw SIGN;
      });
    } catch (thrown) {
      same = thrown === SIGN;
    }
    const tables = sql.exec(`SELECT name FROM sqlite_master WHERE name = 't'`).toArray().length;
    // The inner one failed and the outer one went on: only the inner one's write is gone.
    sql.exec(`CREATE TABLE IF NOT EXISTS t (n INTEGER)`);
    whole(() => {
      sql.exec(`INSERT INTO t VALUES (3)`);
      try {
        whole(() => {
          sql.exec(`INSERT INTO t VALUES (4)`);
          throw new Error("inner");
        });
      } catch {
        // (the outer one goes on)
      }
      sql.exec(`INSERT INTO t VALUES (5)`);
    });
    const rows = sql
      .exec(`SELECT n FROM t ORDER BY n`)
      .toArray()
      .map((row) => Number(row.n));
    sql.exec(`DROP TABLE t`);
    return { same, tables, rows };
  }
}
