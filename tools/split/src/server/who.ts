// Who is signed in. 两清 uses changle.ca's own accounts: the page sends the session the site keeps
// on the phone (`Authorization: Bearer …`, site/src/lib/api.ts), and this Worker asks the rooms
// server (site/worker) whose it is, Worker to Worker over the ROOMS binding, never over the public
// address. The same way as 跟一单 (tools/tuan/src/server/who.ts, docs/briefs/tuan.md).
//
// A sign-in found is kept for five minutes under the session's fingerprint, so a phone going
// through its ledgers asks once. One not found isn't kept: signing in again works at once.
import { ACCOUNT_RE } from "../room/protocol";

/** A signed-in account: its id, and how changle.ca shows it (its name; its photo's version, 0 for none; the colour of its letter), which an invitation it sends carries. */
export type Who = { id: string; name: string; av: number; ac?: number };
export type Asked = { ok: true; who: Who } | { ok: false; error: "signin" | "down" };
/** As much of a name as an invitation shows. */
const NAME_MOST = 40;

/** The account the rooms server describes (`user` in its answer), as 两清 keeps it; null when it isn't one. (Kept answers from before names were kept have only the id.) */
function asWho(user: Record<string, unknown> | undefined): Who | null {
  if (!user || typeof user.id !== "string" || !ACCOUNT_RE.test(user.id)) return null;
  const av = typeof user.av === "number" && Number.isSafeInteger(user.av) && user.av >= 0 ? user.av : 0;
  const ac = typeof user.ac === "number" && Number.isSafeInteger(user.ac) && user.ac >= 0 ? user.ac : undefined;
  return { id: user.id, name: typeof user.name === "string" ? user.name.trim().slice(0, NAME_MOST) : "", av, ...(ac === undefined ? {} : { ac }) };
}

/** A session as the site makes them (site/worker/hub.ts). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
const KEEP_SECONDS = 300;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where an answer is kept: an address nobody can ask for, named by the session's fingerprint (never the session itself). */
const keptAt = (fingerprint: string): Request => new Request(`https://who.split.invalid/${fingerprint}`);

/** The session a request carries; null when it carries none, or something that isn't one. */
export function sessionOf(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return TOKEN_RE.test(token) ? token : null;
}

/** Whose sign-in this is. "signin": nobody's (or it ran out, or the account is shut out). "down": the rooms server can't say right now. */
export async function whoIs(token: string, rooms: Fetcher, waitUntil?: (p: Promise<unknown>) => void): Promise<Asked> {
  const key = keptAt(await sha256(`split:${token}`));
  // (keeping the answer is a saving, not something signing in depends on: a cache that fails is passed by)
  try {
    const kept = await caches.default.match(key);
    const who = kept ? asWho(await kept.json<Record<string, unknown>>()) : null;
    if (who) return { ok: true, who };
  } catch {
    // ask
  }
  let res: Response;
  try {
    res = await rooms.fetch("https://rooms.changle.ca/api/me", { headers: { authorization: `Bearer ${token}` } });
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
  const who = asWho(user);
  if (!who) return { ok: false, error: "signin" };
  const keep = caches.default.put(key, new Response(JSON.stringify(who), { headers: { "content-type": "application/json", "cache-control": `max-age=${KEEP_SECONDS}` } })).catch(() => {});
  if (waitUntil) waitUntil(keep);
  else await keep;
  return { ok: true, who };
}

/**
 * Is `other` a friend, on changle.ca, of the account signed in with `token`? The rooms server says
 * (`GET /api/users/<other>`, whose `relation` is "friends" for one), Worker to Worker as above.
 * "no": not friends, or no such account. "signin" and "down" as for `whoIs`. Never kept: a
 * friendship can end at any moment.
 */
export async function friendOf(token: string, other: string, rooms: Fetcher): Promise<"yes" | "no" | "signin" | "down"> {
  if (!ACCOUNT_RE.test(other)) return "no";
  let res: Response;
  try {
    res = await rooms.fetch(`https://rooms.changle.ca/api/users/${other}`, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return "down";
  }
  if (res.status === 404) return "no";
  if (res.status === 401 || res.status === 403) return "signin";
  if (!res.ok) return "down";
  try {
    return (await res.json<{ relation?: unknown }>()).relation === "friends" ? "yes" : "no";
  } catch {
    return "down";
  }
}
