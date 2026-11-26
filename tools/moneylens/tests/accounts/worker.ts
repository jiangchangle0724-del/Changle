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
// or that its email address changed.
import { WorkerEntrypoint } from "cloudflare:workers";

type Env = {
  APP: Fetcher;
  MONEY: { accountGone(id: string): Promise<void>; accountChanged(id: string): Promise<void>; count(): Promise<number> };
};

type Stood = { id: string; master: boolean; nonce: string; aud: string };
const codes = new Map<string, Stood>();
const gone = new Set<string>();

export class Handoff extends WorkerEntrypoint<Env> {
  redeem(code: string, aud: string): { id: string; master: boolean; nonce: string } | null {
    const stood = codes.get(code);
    if (!stood || stood.aud !== aud) return null;
    codes.delete(code);
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
      codes.set(code, { id: String(asked.id), master: asked.master === true, nonce: String(asked.nonce), aud: String(asked.aud) });
      return Response.json({ code });
    }
    if (url.pathname === "/test/count") return Response.json({ accounts: await env.MONEY.count() });
    if (url.pathname === "/test/gone" || url.pathname === "/test/changed") {
      try {
        if (url.pathname === "/test/gone") {
          gone.add(id);
          await env.MONEY.accountGone(id);
        } else await env.MONEY.accountChanged(id);
        return new Response("done");
      } catch {
        return new Response("threw", { status: 500 });
      }
    }
    return env.APP.fetch(new Request(`https://money.changle.test${url.pathname}${url.search}`, request));
  },
};
