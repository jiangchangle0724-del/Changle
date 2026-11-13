// A stand-in for the rooms server (site/worker), which isn't part of this tool. It knows the
// sessions in tests/accounts.ts and nothing else:
//   GET /api/me     answered the way site/worker does: 200 { user }, or 401, or 503
//   Mail.send()     the rooms server's mail door (site/worker/mail.ts): it "mails" only these
//                   accounts, and keeps what it sent for the tests to read
// The unit tests run it beside the Worker (vitest.config.ts), and so does a local run without the
// real rooms server: `npm run dev:alone`, which is also what the phone-in-a-browser tests use.
import { WorkerEntrypoint } from "cloudflare:workers";
import { ACCOUNTS } from "../accounts.ts";

interface Notice {
  app?: unknown;
  to?: unknown;
}

const emails = new Set(Object.values(ACCOUNTS).flatMap((account) => (account === "down" ? [] : [account.email])));
let mails: Notice[] = [];
let door = "open";

export class Mail extends WorkerEntrypoint {
  async send(notice: Notice | null): Promise<{ status: "sent" } | { status: "full" } | { status: "failed"; why: string }> {
    if (door === "full") return { status: "full" };
    if (door === "down") return { status: "failed", why: "mail" };
    if (!notice || notice.app !== "tuan" || typeof notice.to !== "string" || !emails.has(notice.to)) return { status: "failed", why: "to" };
    mails.push(notice);
    return { status: "sent" };
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // for the tests only: what the door sent since last asked, and how the door answers from now on
    if (url.pathname === "/test/mails") {
      const sent = mails;
      mails = [];
      return Response.json(sent);
    }
    if (url.pathname === "/test/door") {
      door = url.searchParams.get("is") || "open";
      return Response.json({ door });
    }
    if (url.pathname !== "/api/me" || req.method !== "GET") return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const account = ACCOUNTS[auth.startsWith("Bearer ") ? auth.slice(7) : ""];
    if (account === "down") return Response.json({ error: "paused" }, { status: 503 });
    return account ? Response.json({ user: account }) : Response.json({ error: "signin" }, { status: 401 });
  },
};
