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
export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; raw?: BodyInit; type?: string } = {}): Promise<T> {
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
  const res = await fetch(`${API}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal, cache: "no-store" });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new ApiError(res.status, ((data as { error?: string } | null)?.error as string) ?? String(res.status));
  return data as T;
}
