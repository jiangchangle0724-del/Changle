// The changle.ca accounts the tests sign in with. The rooms server isn't part of this tool, so the
// tests run a stand-in for it (vitest.config.ts) that knows these sessions and nothing else: it
// answers GET /api/me the way site/worker does, 200 { user } or 401.

/** A session, as the site keeps one on a phone: what a page sends as "Authorization: Bearer …". */
export const SESSION = {
  /** the site's owner */
  owner: "test-session-owner-0000000",
  /** runs the test shop */
  leader: "test-session-leader-000000",
  /** has an account, runs nothing */
  visitor: "test-session-visitor-00000",
  /** a session the rooms server has never heard of */
  nobody: "test-session-nobody-000000",
  /** the rooms server can't answer for this one (503) */
  down: "test-session-down-00000000",
} as const;

export const ACCOUNTS: Record<string, { id: string; name: string; email: string; master: boolean } | "down"> = {
  [SESSION.owner]: { id: "uowner01", name: "Steve", email: "owner@example.com", master: true },
  [SESSION.leader]: { id: "uleader1", name: "团长", email: "leader@example.com", master: false },
  [SESSION.visitor]: { id: "uvisit01", name: "路人", email: "visitor@example.com", master: false },
  [SESSION.down]: "down",
};

/** The stand-in rooms server, as a Worker's source. */
export const ROOMS_STAND_IN = `
const accounts = ${JSON.stringify(ACCOUNTS)};
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/me" || req.method !== "GET") return Response.json({ error: "notfound" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const account = accounts[auth.startsWith("Bearer ") ? auth.slice(7) : ""];
    if (account === "down") return Response.json({ error: "paused" }, { status: 503 });
    return account ? Response.json({ user: account }) : Response.json({ error: "signin" }, { status: 401 });
  },
};
`;
