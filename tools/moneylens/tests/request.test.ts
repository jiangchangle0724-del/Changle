/**
 * What is read off a request (src/server/request.ts): the two cookies as text, and where the
 * request came from (ARCH-3, ARCH-4, SEC-4, T-22).
 *
 *   npx tsx --test tests/request.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { NONCE_COOKIE, SESSION_COOKIE, fromOurOrigin, isAccount, isNonce, noCookie, nonceCookie, readNonce, readSession, sessionCookie } from "../src/server/request";
import { newToken } from "../src/server/sessions";

const ACCOUNT = "uinvented01";
const TOKEN = "T".repeat(43);
const NONCE = "invented-nonce_0123456789";
const ORIGIN = "https://money.changle.ca";

test("the two cookies are written host-only, for HTTPS, out of reach of scripts and of other sites (ARCH-4)", () => {
  assert.equal(sessionCookie(ACCOUNT, TOKEN), `__Host-ml=${ACCOUNT}.${TOKEN}; Max-Age=43200; Path=/; Secure; HttpOnly; SameSite=Strict`);
  assert.equal(nonceCookie(NONCE), `__Host-ml-n=${NONCE}; Max-Age=300; Path=/; Secure; HttpOnly; SameSite=Strict`);
  assert.equal(noCookie(SESSION_COOKIE), "__Host-ml=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict");
  assert.equal(noCookie(NONCE_COOKIE), "__Host-ml-n=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict");
  // `__Host-` only holds if there is no Domain attribute: none is ever written
  for (const cookie of [sessionCookie(ACCOUNT, TOKEN)!, nonceCookie(NONCE)!, noCookie(SESSION_COOKIE)]) assert.ok(!/domain/i.test(cookie));
  // what is not an account id and a token, or not a nonce, is not written at all
  for (const [account, token] of [["", TOKEN], ["admin", TOKEN], ["U" + ACCOUNT.slice(1), TOKEN], [`${ACCOUNT};x`, TOKEN], [ACCOUNT, ""], [ACCOUNT, "T".repeat(42)], [ACCOUNT, `${"T".repeat(42)};`], [ACCOUNT, `${"T".repeat(40)}\r\nX`]] as const) {
    assert.equal(sessionCookie(account, token), null, `${account} ${token}`);
  }
  for (const nonce of ["", "short", "x".repeat(65), `${"x".repeat(20)};`, `${"x".repeat(20)}\r\nSet-Cookie: a=b`]) assert.equal(nonceCookie(nonce), null, nonce);
  assert.equal(isAccount(ACCOUNT), true);
  assert.equal(isAccount(7), false);
  assert.equal(isNonce(NONCE), true);
  assert.equal(isNonce(null), false);
});

test("a session cookie is read back as whose database to ask and the token to ask about, or not at all", () => {
  const token = newToken();
  const written = sessionCookie(ACCOUNT, token)!.split(";")[0]!;
  assert.deepEqual(readSession(written), { account: ACCOUNT, token });
  // among other cookies, in any place, with the spaces browsers and proxies leave
  assert.deepEqual(readSession(`theme=night; ${written}; other=1`), { account: ACCOUNT, token });
  assert.deepEqual(readSession(`a=b;${written}`), { account: ACCOUNT, token });
  assert.deepEqual(readSession(`  ${SESSION_COOKIE} = ${ACCOUNT}.${token} ;x=y`), { account: ACCOUNT, token });
  const none: [string, unknown][] = [
    ["no header", null],
    ["no header at all", undefined],
    ["an empty header", ""],
    ["a header that is not text", 7],
    ["other cookies only", "theme=night; lang=zh"],
    ["the name in another case, which is another cookie (and one a subdomain could plant)", `__host-ml=${ACCOUNT}.${token}`],
    ["a name that only ends like ours", `x__Host-ml=${ACCOUNT}.${token}`],
    ["a name that only starts like ours", `__Host-mlx=${ACCOUNT}.${token}`],
    ["the nonce cookie's name", `${NONCE_COOKIE}=${ACCOUNT}.${token}`],
    ["no value", `${SESSION_COOKIE}=`],
    ["no token", `${SESSION_COOKIE}=${ACCOUNT}.`],
    ["no account", `${SESSION_COOKIE}=.${token}`],
    ["no dot", `${SESSION_COOKIE}=${ACCOUNT}${token}`],
    ["two dots", `${SESSION_COOKIE}=${ACCOUNT}.${token}.x`],
    ["an account that is not one", `${SESSION_COOKIE}=admin.${token}`],
    ["a token one character short", `${SESSION_COOKIE}=${ACCOUNT}.${token.slice(1)}`],
    ["a token one character long", `${SESSION_COOKIE}=${ACCOUNT}.${token}A`],
    ["a value in quotes", `${SESSION_COOKIE}="${ACCOUNT}.${token}"`],
    ["the cookie twice, the same", `${written}; ${written}`],
    ["the cookie twice, a planted one first", `${SESSION_COOKIE}=uattacker01.${"A".repeat(43)}; ${written}`],
    ["the cookie twice, a planted one last", `${written}; ${SESSION_COOKIE}=uattacker01.${"A".repeat(43)}`],
    ["more text than anyone sends", `${written}; pad=${"x".repeat(4096)}`],
  ];
  for (const [what, header] of none) assert.equal(readSession(header), null, what);
});

test("the nonce is read back only when it is one, and there is one", () => {
  assert.equal(readNonce(`${NONCE_COOKIE}=${NONCE}`), NONCE);
  assert.equal(readNonce(`${SESSION_COOKIE}=${ACCOUNT}.${TOKEN}; ${NONCE_COOKIE}=${NONCE}`), NONCE);
  for (const [what, header] of [
    ["none", `${SESSION_COOKIE}=${ACCOUNT}.${TOKEN}`],
    ["too short", `${NONCE_COOKIE}=short`],
    ["with something after it", `${NONCE_COOKIE}=${NONCE}!`],
    ["twice", `${NONCE_COOKIE}=${NONCE}; ${NONCE_COOKIE}=${NONCE}`],
    ["the session's name", `${SESSION_COOKIE}=${NONCE}`],
    ["nothing", null],
  ] as const) {
    assert.equal(readNonce(header), null, what);
  }
});

test("a request is from a page of ours only if its Origin is exactly our origin (SEC-4, T-22)", () => {
  const from = (origin: string | null, site: string | null = null) => fromOurOrigin(new Headers({ ...(origin === null ? {} : { Origin: origin }), ...(site === null ? {} : { "Sec-Fetch-Site": site }) }), ORIGIN);
  assert.equal(from(ORIGIN), true);
  assert.equal(from(ORIGIN, "same-origin"), true);
  const no: [string, string | null, string | null][] = [
    ["no Origin: a plain GET, a tool, or something that hides where it is from", null, null],
    ["no Origin, though the browser says same-origin", null, "same-origin"],
    ["the main site, which is the same site to a browser", "https://changle.ca", "same-site"],
    ["the main site", "https://changle.ca", null],
    ["another subdomain", "https://rooms.changle.ca", null],
    ["a longer name that ends like ours", "https://evil-money.changle.ca", null],
    ["a longer name that starts like ours", "https://money.changle.ca.example.com", null],
    ["our name without TLS", "http://money.changle.ca", null],
    ["our name with a port", "https://money.changle.ca:8443", null],
    ["our name with a slash", "https://money.changle.ca/", null],
    ["our name in capitals", "https://MONEY.changle.ca", null],
    ["our name with something in front", "x https://money.changle.ca", null],
    ["the opaque origin of a sandboxed frame or a file", "null", null],
    ["nothing at all", "", null],
    ["two origins", `${ORIGIN}, https://changle.ca`, null],
    ["our origin, but the browser says the page was on the same site, not the same origin", ORIGIN, "same-site"],
    ["our origin, but the browser says cross-site", ORIGIN, "cross-site"],
    ["our origin, but the browser says the user typed it", ORIGIN, "none"],
  ];
  for (const [what, origin, site] of no) assert.equal(from(origin, site), false, what);
  // The origin to expect is configuration (a staging deployment has its own, SEC-11). One that is not an https origin lets nothing in.
  const staging = "https://money-staging.changle.ca";
  assert.equal(fromOurOrigin(new Headers({ Origin: staging }), staging), true);
  assert.equal(fromOurOrigin(new Headers({ Origin: ORIGIN }), staging), false);
  for (const bad of ["", "*", "null", "http://money.changle.ca", "https://money.changle.ca/", "https://money.changle.ca/x", "https://*.changle.ca"]) {
    assert.equal(fromOurOrigin(new Headers({ Origin: bad }), bad), false, bad);
  }
});
