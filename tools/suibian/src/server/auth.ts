// Google sign-in (OpenID Connect, authorization-code flow) and a signed session cookie.
// No session table: the cookie carries the Google user id and name, signed with SESSION_SECRET.
// Everything lives under /eat on changle.ca: Google sends people back to /eat/auth/callback (that
// exact address is registered with Google), and the cookies are scoped to /eat.
import { BASE } from "../base";

export interface Session {
  /** Google's stable user id ("sub"). */
  sub: string;
  name: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

const COOKIE = "sb_session";
const STATE_COOKIE = "sb_state";
const SESSION_DAYS = 60;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function sign(secret: string, s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verify(secret: string, token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = await hmac(secret, body);
  // Compare without leaking where they differ.
  if (want.length !== mac.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  if (diff) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return typeof s.sub === "string" && s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function cookie(req: Request, name: string): string | undefined {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1];
}

/**
 * Scoped to /eat, so the rest of changle.ca never sees it. Secure on https (always, once deployed);
 * plain http only for local tests, where WebKit won't send Secure cookies.
 */
const setCookie = (req: Request, name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=${BASE}; HttpOnly;${new URL(req.url).protocol === "https:" ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`;

const HOME = `${BASE}/`;
const callbackUrl = (url: URL) => `${url.origin}${BASE}/auth/callback`;
/** A page of ours to go back to after sign-in; anything else (another site, another part of changle.ca) becomes the home page. */
const insideApp = (path: string) => path === BASE || path.startsWith(`${BASE}/`);

export interface AuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

export const loginEnabled = (env: AuthEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export async function currentUser(req: Request, env: AuthEnv): Promise<Session | null> {
  if (!env.SESSION_SECRET) return null;
  return verify(env.SESSION_SECRET, cookie(req, COOKIE));
}

/** GET /eat/auth/google → off to Google's consent screen. */
export function startLogin(req: Request, env: AuthEnv): Response {
  const url = new URL(req.url);
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const back = url.searchParams.get("back") ?? HOME;
  const go = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  go.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(url),
    response_type: "code",
    scope: "openid profile",
    state,
    prompt: "select_account",
  }).toString();
  const safeBack = insideApp(back) ? back : HOME;
  return new Response(null, {
    status: 302,
    headers: { location: go.toString(), "set-cookie": setCookie(req, STATE_COOKIE, `${state}|${encodeURIComponent(safeBack)}`, 600) },
  });
}

/** GET /eat/auth/callback → swap the code for Google's id token, then set our own cookie. */
export async function finishLogin(req: Request, env: AuthEnv): Promise<{ res: Response; session?: Session }> {
  const url = new URL(req.url);
  const [state, rawBack] = (cookie(req, STATE_COOKIE) ?? "").split("|");
  let back = HOME;
  try {
    back = decodeURIComponent(rawBack ?? encodeURIComponent(HOME));
  } catch {
    // keep the home page
  }
  if (!insideApp(back)) back = HOME;
  const home = (path: string) => new Response(null, { status: 302, headers: { location: path } });
  const failed = `${HOME}?login=failed`;
  if (!state || url.searchParams.get("state") !== state || !url.searchParams.get("code")) return { res: home(failed) };
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code")!,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(url),
      grant_type: "authorization_code",
    }),
  });
  if (!token.ok) return { res: home(failed) };
  const { id_token } = (await token.json()) as { id_token?: string };
  // Straight from Google's token endpoint over TLS, so the claims can be read without re-checking the signature.
  const claims = id_token ? (JSON.parse(new TextDecoder().decode(fromB64url(id_token.split(".")[1] ?? ""))) as { sub?: string; name?: string; given_name?: string; aud?: string }) : {};
  if (!claims.sub || claims.aud !== env.GOOGLE_CLIENT_ID) return { res: home(failed) };
  const session: Session = { sub: claims.sub, name: (claims.given_name ?? claims.name ?? "").slice(0, 16), exp: Date.now() + SESSION_DAYS * 24 * 3600_000 };
  const res = home(back);
  res.headers.append("set-cookie", setCookie(req, COOKIE, await sign(env.SESSION_SECRET!, session), SESSION_DAYS * 24 * 3600));
  res.headers.append("set-cookie", setCookie(req, STATE_COOKIE, "", 0));
  return { res, session };
}

export function logout(req: Request): Response {
  return new Response(null, { status: 204, headers: { "set-cookie": setCookie(req, COOKIE, "", 0) } });
}

/** Tests only: log in without Google. */
export async function testSession(req: Request, env: AuthEnv, sub: string, name: string): Promise<string> {
  return setCookie(req, COOKIE, await sign(env.SESSION_SECRET!, { sub, name, exp: Date.now() + 3600_000 }), 3600);
}
