// Who is signed in. A merchant uses their changle.ca account: the page sends the session the site
// keeps on the phone, and this Worker asks the rooms server (site/worker) whose it is, Worker to
// Worker (the ROOMS binding), never over the public address. The answer is kept for five minutes,
// under the session's fingerprint, so a merchant working through their orders asks once.
import { sha256 } from "./gate";

export interface Who {
  id: string;
  /** lower case, as accounts keep it */
  email: string;
  name: string;
  /** the site's owner */
  owner: boolean;
}

export type Asked = { ok: true; who: Who } | { ok: false; error: "signin" | "down" | "limit" };

/** A session as the site makes them (site/worker/hub.ts). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
const KEEP_SECONDS = 300;

/** Where an answer is kept: an address nobody can ask for, named by the session's fingerprint (never the session itself). */
export const whoKey = (fingerprint: string): Request => new Request(`https://who.tuan.invalid/${fingerprint}`);

/** The session a request carries, or null. */
export function tokenOf(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return TOKEN_RE.test(token) ? token : null;
}

/** `mayAsk`: whether this network may still have the rooms server asked today (sessions that turn out to be nobody's are counted). */
export async function whoIs(token: string, env: Env, ctx: ExecutionContext | undefined, mayAsk: () => Promise<boolean>): Promise<Asked> {
  const cache = caches.default;
  const key = whoKey(await sha256(token));
  // (keeping the answer is a saving, not something signing in depends on: a cache that fails is passed by)
  try {
    const kept = await cache.match(key);
    if (kept) return { ok: true, who: await kept.json<Who>() };
  } catch {
    // ask
  }
  if (!(await mayAsk())) return { ok: false, error: "limit" };

  let res: Response;
  try {
    res = await env.ROOMS.fetch("https://rooms.changle.ca/api/me", { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, error: "down" };
  }
  // 401: no such session, or it ran out. 403: the account is shut out.
  if (res.status === 401 || res.status === 403) return { ok: false, error: "signin" };
  if (!res.ok) return { ok: false, error: "down" };
  let user: Record<string, unknown> | undefined;
  try {
    user = (await res.json<{ user?: Record<string, unknown> }>()).user;
  } catch {
    return { ok: false, error: "down" };
  }
  if (!user || typeof user.id !== "string" || typeof user.email !== "string" || !user.email) return { ok: false, error: "signin" };

  const who: Who = { id: user.id, email: user.email.toLowerCase(), name: typeof user.name === "string" ? user.name : "", owner: user.master === true };
  const keep = cache.put(key, new Response(JSON.stringify(who), { headers: { "content-type": "application/json", "cache-control": `max-age=${KEEP_SECONDS}` } })).catch(() => {});
  if (ctx) ctx.waitUntil(keep);
  else await keep;
  return { ok: true, who };
}
