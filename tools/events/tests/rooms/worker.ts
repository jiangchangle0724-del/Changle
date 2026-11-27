// A stand-in for the rooms server (site/worker), which isn't part of this tool. It knows three
// sessions and nothing else:
//   GET /api/me     answered the way site/worker does: 200 { user }, or 401
//   Mail.send()     the mail door (site/worker/mail.ts): it "mails" the owner only, and keeps what
//                   it sent for the tests to read (GET /test/mails)
import { WorkerEntrypoint } from "cloudflare:workers";

export const SESSIONS: Record<string, { id: string; name: string; email: string; master: boolean }> = {
  "test-session-owner-0000000": { id: "uowner01", name: "Steve", email: "owner@example.com", master: true },
  "test-session-visitor-00000": { id: "uvisit01", name: "Visitor", email: "visitor@example.com", master: false },
};

let mails: unknown[] = [];

export class Mail extends WorkerEntrypoint {
  async send(notice: { app?: unknown; to?: unknown } | null): Promise<{ status: "sent" } | { status: "failed"; why: string }> {
    if (!notice || notice.app !== "events" || notice.to !== "owner@example.com") return { status: "failed", why: "to" };
    mails.push(notice);
    return { status: "sent" };
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/test/mails") {
      const sent = mails;
      mails = [];
      return Response.json(sent);
    }
    if (url.pathname !== "/api/me") return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const user = SESSIONS[auth.startsWith("Bearer ") ? auth.slice(7) : ""];
    return user ? Response.json({ user }) : Response.json({ error: "signin" }, { status: 401 });
  },
};
