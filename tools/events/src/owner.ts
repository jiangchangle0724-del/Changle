// The site's owner, for /go/admin: the page sends the changle.ca session the site keeps on the phone
// (localStorage "changle.session"), and the Worker asks the rooms server whose it is, Worker to
// Worker (the ROOMS binding, as 跟一单 does: tools/tuan/src/server/who.ts). Only the owner ("master")
// is let in. The owner's sign-in email is remembered, so a new submission can be mailed to them
// through the rooms server's mail door (the MAIL binding, site/worker/mail.ts).
import type { Submission } from "./submit";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
const OWNER_EMAIL = "owner:email";

export type Owner = { ok: true; email: string } | { ok: false; status: 401 | 403 | 503 };

/** The session a request carries ("Authorization: Bearer …"), or null. */
export function tokenOf(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return TOKEN_RE.test(token) ? token : null;
}

/** Whether the request is the owner's: 401 not signed in, 403 someone else, 503 the rooms server can't say. */
export async function ownerOf(req: Request, env: Pick<Env, "ROOMS" | "CACHE">): Promise<Owner> {
  const token = tokenOf(req);
  if (!token) return { ok: false, status: 401 };
  let res: Response;
  try {
    res = await env.ROOMS.fetch("https://rooms.changle.ca/api/me", { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, status: 503 };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, status: 401 };
  if (!res.ok) return { ok: false, status: 503 };
  const user = ((await res.json().catch(() => null)) as { user?: { email?: unknown; master?: unknown } } | null)?.user;
  if (!user || user.master !== true || typeof user.email !== "string") return { ok: false, status: 403 };
  const email = user.email.toLowerCase();
  if ((await env.CACHE.get(OWNER_EMAIL)) !== email) await env.CACHE.put(OWNER_EMAIL, email);
  return { ok: true, email };
}

interface MailDoor {
  send(notice: { app: "events"; to: string; subject: string; text: string; link?: string; lang: "zh" | "en" }): Promise<{ status: string; why?: string }>;
}

/**
 * Tells the owner a submission came in (once the owner has opened /go/admin, so their email is
 * known). The rooms server keeps a day's allowance for this app; a notice that doesn't go out is
 * only logged: the submission waits on the page either way.
 */
export async function noticeOwner(env: Pick<Env, "CACHE" | "MAIL">, s: Pick<Submission, "id" | "link" | "text"> & { title: string | null; hasImage: boolean }): Promise<string> {
  const to = await env.CACHE.get(OWNER_EMAIL);
  if (!to) return "no owner email yet";
  const what = [s.title ? `「${s.title}」` : null, s.link, s.text ? s.text.slice(0, 300) : null, s.hasImage ? "（附了一张图）" : null].filter(Boolean).join("\n");
  const door = env.MAIL as unknown as MailDoor;
  try {
    const sent = await door.send({ app: "events", to, subject: s.title ? `玩什么有新投稿：${s.title}`.slice(0, 120) : "玩什么有新投稿", text: `有人投了一个活动，等你看一眼：\n\n${what}`.slice(0, 2000), link: "https://changle.ca/go/admin", lang: "zh" });
    return sent.status === "sent" ? "sent" : `${sent.status}${sent.why ? `: ${sent.why}` : ""}`;
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120);
  }
}
