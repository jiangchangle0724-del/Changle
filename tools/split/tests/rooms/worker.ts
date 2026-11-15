// A stand-in for the rooms server (site/worker), which isn't part of this tool. It answers the two
// questions 两清 asks it, the way site/worker does: GET /api/me is 200 { user }, or 401, or 503;
// and GET /api/users/<id> is 200 { user, relation } (friends, as tests/accounts.ts has them), or
// 404 for an account there is no such one of, or 401. It knows the sessions in tests/accounts.ts
// and nothing else. And as site/worker does when an account is deleted (DELETE /api/me), it tells
// 两清, through its binding to 两清's `Internal` entrypoint; here it only tells (the account
// itself is the stand-in's to forget, and it keeps none).
import { ACCOUNTS, ANYONE, STRANGER, relation } from "../accounts";

type Env = { SPLIT: { accountGone(account: string): Promise<{ files: number; left: number }> } };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const other = /^\/api\/users\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname)?.[1];
    if (!(url.pathname === "/api/me" && (req.method === "GET" || req.method === "DELETE")) && !(other && req.method === "GET")) return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const session = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    // (an account of a test's own is named by what comes after the "_" in it, when there is one: "tripA_Amy" is Amy)
    const anyone = ANYONE.test(session) ? session.replace(ANYONE, "$1") : null;
    const account = ACCOUNTS[session] ?? (anyone ? { id: anyone, name: anyone.includes("_") ? anyone.slice(anyone.indexOf("_") + 1) : "Test", email: "test@example.com" } : undefined);
    if (account === "down") return Response.json({ error: "paused" }, { status: 503 });
    if (!account) return Response.json({ error: "signin" }, { status: 401 });
    if (other) return other === STRANGER ? Response.json({ error: "none" }, { status: 404 }) : Response.json({ user: { id: other, name: "Friend" }, relation: relation(account.id, other) });
    if (req.method === "DELETE") return Response.json(await env.SPLIT.accountGone(account.id));
    return Response.json({ user: account });
  },
};
