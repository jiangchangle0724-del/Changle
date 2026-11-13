// Talking to the server, and what this phone remembers: its key for each gathering (made here, never
// shown, sent with every request), the name last used, and the gatherings it has opened.
import { BASE } from "../base";
import type { HostAction } from "../room/event";
import { KEY_HEADER, type ApiError, type Claimed, type CreateBody, type Created, type Hosted, type SaveBody, type Saved, type Snapshot } from "../room/protocol";

const memory = new Map<string, string>();
const read = (name: string): string | null => {
  try {
    return localStorage.getItem(name) ?? memory.get(name) ?? null;
  } catch {
    return memory.get(name) ?? null;
  }
};
const write = (name: string, value: string): void => {
  memory.set(name, value);
  try {
    localStorage.setItem(name, value);
  } catch {
    // private mode: it lasts as long as the page
  }
};

/** 32 random bytes as base64url. */
export function newKey(): string {
  let text = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** This phone's key for a gathering: the one it already has, or a new one. */
export function keyFor(code: string): string {
  const name = `when.k.${code}`;
  const key = read(name) ?? newKey();
  write(name, key);
  return key;
}
export const adoptKey = (code: string, key: string): void => write(`when.k.${code}`, key);

export const savedName = (): string => read("when.name") ?? "";
export const saveName = (name: string): void => write("when.name", name);

export type Recent = { code: string; title: string; mine: boolean; at: number };
export function recents(): Recent[] {
  try {
    const list: unknown = JSON.parse(read("when.recent") ?? "[]");
    return Array.isArray(list) ? (list as Recent[]).filter((r) => r && typeof r.code === "string" && typeof r.title === "string") : [];
  } catch {
    return [];
  }
}
/** Newest first, twelve at most; forgotten after the 60 days a gathering lasts. */
export function remember(entry: Recent): void {
  const fresh = recents().filter((r) => r.code !== entry.code && entry.at - r.at < 60 * 86_400_000);
  write("when.recent", JSON.stringify([entry, ...fresh].slice(0, 12)));
}
export const forget = (code: string): void => write("when.recent", JSON.stringify(recents().filter((r) => r.code !== code)));

/** An answer that wasn't the thing asked for; `network` when the server couldn't be reached at all. */
export class ApiFail extends Error {
  constructor(
    public code: ApiError["error"] | "network",
    public status: number,
  ) {
    super(code);
  }
}

async function call<T>(path: string, key: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { [KEY_HEADER]: key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFail("network", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !data) throw new ApiFail(data?.error ?? (res.status === 404 ? "notfound" : "bad"), res.status);
  return data;
}

export const api = {
  create: (body: CreateBody, key: string) => call<Created>("/events", key, body),
  get: (code: string) => call<Snapshot>(`/e/${code}`, keyFor(code)),
  save: (code: string, body: SaveBody) => call<Saved>(`/e/${code}/me`, keyFor(code), body),
  host: (code: string, action: HostAction) => call<Hosted>(`/e/${code}/host`, keyFor(code), action),
  claim: (code: string, adminCode: string) => call<Claimed>(`/e/${code}/claim`, keyFor(code), { adminCode }),
};

/** Copy to the clipboard: the new way, then the old way (some Android WeChat versions only have that one). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the old way
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.className = "copy-scratch";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const done = document.execCommand("copy");
    field.remove();
    return done;
  } catch {
    return false;
  }
}
