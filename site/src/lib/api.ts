import { API } from "../config";
import { phoneId } from "../online/config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const TOKEN = "changle.session";
export function sessionToken(): string {
  try {
    return localStorage.getItem(TOKEN) ?? "";
  } catch {
    return "";
  }
}
export function setSessionToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* fine */
  }
}

/** JSON request to the changle API. Sends this phone's id, and the session if signed in. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; raw?: BodyInit; type?: string; keepalive?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Device": phoneId() };
  const tok = sessionToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    if (opts.type) headers["Content-Type"] = opts.type;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  // (signing in and out also sets the sign-in cookie, which only /api/auth ever sees)
  const credentials: RequestCredentials = path.startsWith("/auth/") ? "include" : "same-origin";
  // (keepalive: a small request sent as the page goes away, which the browser finishes without it)
  const res = await fetch(`${API}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal, cache: "no-store", credentials, keepalive: opts.keepalive });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const code = ((data as { error?: string } | null)?.error as string) ?? String(res.status);
    // the whole site paused by its owner, or this phone banned: the app shows it, wherever it was asked
    if (code === "paused" || code === "banned") siteNotice(code);
    throw new ApiError(res.status, code);
  }
  return data as T;
}

export type SiteNotice = "paused" | "banned" | "open";
/** Tell the app the site is paused (or open again), or that this phone was banned. */
export function siteNotice(n: SiteNotice) {
  window.dispatchEvent(new CustomEvent<SiteNotice>("changle:site", { detail: n }));
}
