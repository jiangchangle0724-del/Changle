// A stand-in for the rooms server (site/worker), which isn't part of this tool. It answers the one
// question 两清 asks it, the way site/worker does: GET /api/me is 200 { user }, or 401, or 503. It
// knows the sessions in tests/accounts.ts and nothing else. And as site/worker does when an account
// is deleted (DELETE /api/me), it tells 两清, through its binding to 两清's `Internal` entrypoint;
// here it only tells (the account itself is the stand-in's to forget, and it keeps none).
import { ACCOUNTS, ANYONE } from "../accounts";

type Env = { SPLIT: { accountGone(account: string): Promise<{ files: number; left: number }> } };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/api/me" || (req.method !== "GET" && req.method !== "DELETE")) return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const session = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const account = ACCOUNTS[session] ?? (ANYONE.test(session) ? { id: session.replace(ANYONE, "$1"), name: "Test", email: "test@example.com" } : undefined);
    if (account === "down") return Response.json({ error: "paused" }, { status: 503 });
    if (!account) return Response.json({ error: "signin" }, { status: 401 });
    if (req.method === "DELETE") return Response.json(await env.SPLIT.accountGone(account.id));
    return Response.json({ user: account });
  },
};
