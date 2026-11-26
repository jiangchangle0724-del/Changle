/**
 * What is read off a request before anything is done for it: where it came from (SEC-4, T-22)
 * and which cookies it carries (ARCH-3, ARCH-4). Text in, text out: nothing here reads a
 * database or the network.
 *
 * Two cookies, both host-only (`__Host-`: the browser takes them only from this origin over
 * HTTPS with `Path=/` and no `Domain`, so a page on changle.ca or another subdomain cannot plant
 * one), `Secure`, `HttpOnly` (the page's scripts never see them) and `SameSite=Strict`:
 *
 * - the session: `<account id>.<token>`. The id says whose database to ask; the token is what
 *   that database checks (sessions.ts).
 * - the nonce: set when the browser sets off for the main site to fetch a handoff code, and
 *   compared with the nonce the code comes back with, so that nobody can slip a code for their
 *   own account into someone else's browser (ARCH-3).
 *
 * `SameSite` does not keep the main site out: changle.ca and money.changle.ca are the same site
 * to a browser. The check of `Origin` does (SEC-4).
 */
import { LIFETIME } from "./sessions";

export const SESSION_COOKIE = "__Host-ml";
export const NONCE_COOKIE = "__Host-ml-n";
/** How long the nonce is good for, in seconds: the trip to the main site and back. */
export const NONCE_SECONDS = 300;

/** An account id as the accounts service makes them (site/worker/hub.ts). */
const ACCOUNT = /^u[a-z0-9]{6,24}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** A nonce as the accounts service takes them (site/worker/handoffCodes.ts). */
const NONCE = /^[A-Za-z0-9_-]{20,64}$/;
const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Strict";
/** More cookie text than this is not read. */
const MOST_TEXT = 4096;

export const isAccount = (x: unknown): x is string => typeof x === "string" && ACCOUNT.test(x);
export const isNonce = (x: unknown): x is string => typeof x === "string" && NONCE.test(x);

/** `Set-Cookie` for a new session. The browser drops it after 12 hours; the server ends the session then whatever the browser does. Null for what is not an account id and a token. */
export function sessionCookie(account: string, token: string): string | null {
  return isAccount(account) && typeof token === "string" && TOKEN.test(token) ? `${SESSION_COOKIE}=${account}.${token}; Max-Age=${LIFETIME / 1000}; ${ATTRIBUTES}` : null;
}

/** `Set-Cookie` for the nonce of one trip to the main site. Null for what is not a nonce. */
export function nonceCookie(nonce: string): string | null {
  return isNonce(nonce) ? `${NONCE_COOKIE}=${nonce}; Max-Age=${NONCE_SECONDS}; ${ATTRIBUTES}` : null;
}

/** `Set-Cookie` that takes one of the two away. */
export const noCookie = (name: typeof SESSION_COOKIE | typeof NONCE_COOKIE): string => `${name}=; Max-Age=0; ${ATTRIBUTES}`;

/**
 * The value of the one cookie of this name. Null when there is none, and null when there are two: which of two a
 * server ends up reading is not ours to choose, so neither is believed.
 */
function one(header: unknown, name: string): string | null {
  if (typeof header !== "string" || header.length > MOST_TEXT) return null;
  let found: string | null = null;
  let times = 0;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    found = part.slice(at + 1).trim();
    times += 1;
  }
  return times === 1 ? found : null;
}

/** The session a request claims: whose database to ask, and the token to ask it about. Null when the cookie is missing, doubled, or not of that form. */
export function readSession(cookieHeader: unknown): { account: string; token: string } | null {
  const value = one(cookieHeader, SESSION_COOKIE);
  if (value === null) return null;
  const dot = value.indexOf(".");
  const [account, token] = [value.slice(0, dot), value.slice(dot + 1)];
  return dot > 0 && ACCOUNT.test(account) && TOKEN.test(token) ? { account, token } : null;
}

/** The nonce a request carries. Null when the cookie is missing, doubled, or not a nonce. */
export function readNonce(cookieHeader: unknown): string | null {
  const value = one(cookieHeader, NONCE_COOKIE);
  return value !== null && NONCE.test(value) ? value : null;
}

/**
 * Did this request come from a page of ours? `Origin` has to be exactly our origin; a browser sends it with every
 * request that is not a plain GET or HEAD, and no page can set it. Where the browser also says how the two relate
 * (`Sec-Fetch-Site`), that has to be "same-origin". A request with no `Origin` did not, as far as anyone can tell.
 *
 * Everything that reads or changes a person's data is therefore a POST, and is refused unless this says yes (SEC-4,
 * T-22). The pages themselves are plain GETs, carry nobody's data, and are not asked.
 */
export function fromOurOrigin(headers: { get(name: string): string | null }, origin: string): boolean {
  if (typeof origin !== "string" || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(origin)) return false;
  if (headers.get("Origin") !== origin) return false;
  const site = headers.get("Sec-Fetch-Site");
  return site === null || site === "same-origin";
}

/**
 * A short name for the device a session was opened from, for the list its owner sees (ARCH-8): the browser and the
 * system, as far as the User-Agent names them ("Chrome on Windows"). Worked out here from a fixed set of words: no
 * text of the request's own goes into it.
 */
export function labelOf(userAgent: unknown): string {
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 400) : "";
  const browser = /\bEdg(?:e|A|iOS)?\//.test(ua) ? "Edge" : /\bOPR\//.test(ua) ? "Opera" : /\bFirefox\/|\bFxiOS\//.test(ua) ? "Firefox" : /\bChrome\/|\bCriOS\//.test(ua) ? "Chrome" : /\bSafari\//.test(ua) ? "Safari" : "";
  const system = /\biPhone\b/.test(ua) ? "iPhone" : /\biPad\b/.test(ua) ? "iPad" : /\bAndroid\b/.test(ua) ? "Android" : /\bWindows\b/.test(ua) ? "Windows" : /\bCrOS\b/.test(ua) ? "ChromeOS" : /\bMac OS X\b|\bMacintosh\b/.test(ua) ? "Mac" : /\bLinux\b/.test(ua) ? "Linux" : "";
  return browser && system ? `${browser} on ${system}` : browser || system || "Browser";
}
