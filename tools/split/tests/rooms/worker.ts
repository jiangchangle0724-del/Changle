// A stand-in for the rooms server (site/worker), which isn't part of this tool. It answers the one
// question 两清 asks it, the way site/worker does: GET /api/me is 200 { user }, or 401, or 503. It
// knows the sessions in tests/accounts.ts and nothing else.
import { ACCOUNTS, ANYONE } from "../accounts";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/api/me" || req.method !== "GET") return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const session = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const account = ACCOUNTS[session] ?? (ANYONE.test(session) ? { id: session.replace(ANYONE, "$1"), name: "Test", email: "test@example.com" } : undefined);
    if (account === "down") return Response.json({ error: "paused" }, { status: 503 });
    return account ? Response.json({ user: account }) : Response.json({ error: "signin" }, { status: 401 });
  },
};
