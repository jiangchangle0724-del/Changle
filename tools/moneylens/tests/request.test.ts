/**
 * What is read off a request (src/server/request.ts): the two cookies as text, and where the
 * request came from (ARCH-3, ARCH-4, SEC-4, T-22).
 *
 *   npx tsx --test tests/request.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { NONCE_COOKIE, SESSION_COOKIE, addressKey, fromOurOrigin, isAccount, isNonce, noCookie, nonceCookie, readNonce, readSession, sessionCookie } from "../src/server/request";
import { isIP } from "node:net";
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

test("requests are counted by the machine they came from: an IPv4 address, or the first 64 bits of an IPv6 one (the review of the door, finding 1)", () => {
  // an IPv4 address is itself, however it is written
  assert.equal(addressKey("203.0.113.7"), "203.0.113.7");
  assert.equal(addressKey("203.000.113.007"), "203.0.113.7");
  assert.notEqual(addressKey("203.0.113.7"), addressKey("203.0.113.8"));
  // every address of one /64 is one key, however each is written
  const one = ["2001:db8:1:2::1", "2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:0DB8:0001:0002:0000:0000:0000:0001", "2001:db8:1:2:a:b:c:d", "2001:db8:1:2::", "2001:db8:1:2:0:0:192.0.2.9"];
  assert.deepEqual([...new Set(one.map(addressKey))], ["2001:db8:1:2::/64"]);
  // two thousand addresses of one machine: still one key
  const many = new Set<string>();
  for (let i = 0; i < 2000; i++) many.add(addressKey(`2001:db8:1:2:${((i * 7919) & 0xffff).toString(16)}:${i.toString(16)}:${(i ^ 0xbeef).toString(16)}:1`));
  assert.equal(many.size, 1);
  // the next /64 is another key, and so is one that differs in any of the first four groups
  assert.deepEqual(["2001:db8:1:3::1", "2001:db8:2:2::1", "2001:db9:1:2::1", "2002:db8:1:2::1"].map(addressKey), ["2001:db8:1:3::/64", "2001:db8:2:2::/64", "2001:db9:1:2::/64", "2002:db8:1:2::/64"]);
  // where the zeros stand does not matter
  assert.equal(addressKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(addressKey("2001:db8:0:0:0:0:0:1"), "2001:db8:0:0::/64");
  assert.equal(addressKey("::1"), "0:0:0:0::/64");
  assert.equal(addressKey("fe80::1:2:3:4"), "fe80:0:0:0::/64");
  assert.equal(addressKey("1:2:3:4:5:6:7::"), "1:2:3:4::/64");
  assert.equal(addressKey("::2:3:4:5:6:7:8"), "0:2:3:4::/64");
  // an IPv4 address written as an IPv6 one is that IPv4 address, and not one key for all of them
  assert.equal(addressKey("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(addressKey("::FFFF:CB00:7107"), "203.0.113.7");
  assert.equal(addressKey("0:0:0:0:0:ffff:cb00:7108"), "203.0.113.8");
  // (and only that form: the first eighty bits zero, the next sixteen all ones)
  assert.deepEqual(["0:0:0:0:1:ffff:cb00:7107", "1::ffff:cb00:7107", "::fffe:cb00:7107", "::cb00:7107"].map(addressKey), ["0:0:0:0::/64", "1:0:0:0::/64", "0:0:0:0::/64", "0:0:0:0::/64"]);
  // what is no address is one key for all of it, and never the text itself
  for (const odd of [null, undefined, 7, "", " ", " 203.0.113.7", "203.0.113.7 ", " ::1", "nowhere", "example.com", "203.0.113", "203.0.113.7.1", "256.1.1.1", "1.2.3.-4", "2001:db8:1:2", "2001:db8:1:2:3:4:5:6:7", "2001:db8::1::2", "2001:db8:1:2:3:4:5:6::", "g001:db8::1", "2001:db8::12345", "2001:db8:1:2::1%eth0", "[2001:db8::1]", "2001:db8:1:2:192.0.2.9::", "1.2.3.4:5", "::1.2.3.4:5", "1.2.3.4::", "::1.2.3.4.5", "::1.2.3", "::1 ::2", "::1\n", "2001:db8::\u0661", ":", ":::", "1:2:3:4:5:6:7:8:9", "::ffff:999.0.0.1", "::ffff:1.2.3", "1::2::", "1:".repeat(30), "x".repeat(60)])
    assert.equal(addressKey(odd), "nowhere", String(odd));
  assert.equal(addressKey("::"), "0:0:0:0::/64");
});

test("the key of an IPv6 address is the same however the address is written, and what Node says is no address has no key of its own", () => {
  // (numbers made by rule, so that a failure can be had again)
  let seed = 0x9e3779b9;
  const next = (below: number): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % below;
  };
  // the browser's own reading of an address, as eight groups: written by other people than `addressKey`
  const groupsOf = (text: string): number[] => {
    const plain = new URL(`http://[${text}]/`).hostname.slice(1, -1);
    const [head = "", tail] = plain.split("::");
    const read = (part: string): number[] => (part === "" ? [] : part.split(":").map((group) => parseInt(group, 16)));
    const [first, last] = [read(head), tail === undefined ? [] : read(tail)];
    return [...first, ...Array.from({ length: 8 - first.length - last.length }, () => 0), ...last];
  };
  const keyOf = (groups: number[]): string =>
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff ? [groups[6]! >> 8, groups[6]! & 255, groups[7]! >> 8, groups[7]! & 255].join(".") : `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`;
  for (let round = 0; round < 3000; round++) {
    // eight groups, with runs of zeros more often than chance would make them, and sometimes an IPv4 address written as an IPv6 one
    const groups = Array.from({ length: 8 }, () => (next(3) === 0 ? 0 : next(4) === 0 ? next(16) : next(0x10000)));
    if (next(10) === 0) groups.splice(0, 6, 0, 0, 0, 0, 0, 0xffff);
    const hex = (group: number): string => {
      const text = group.toString(16).padStart(next(2) ? 4 : 1, "0");
      return next(2) ? text.toUpperCase() : text;
    };
    const spellings = [groups.map(hex).join(":")];
    // the last two groups as an IPv4 address
    spellings.push(`${groups.slice(0, 6).map(hex).join(":")}:${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`);
    // any one run of zeros left out
    for (let from = 0; from < 8; from++) {
      for (let to = from + 1; to <= 8 && groups[to - 1] === 0; to++) {
        spellings.push(`${groups.slice(0, from).map(hex).join(":")}::${groups.slice(to).map(hex).join(":")}`);
        if (to <= 6) spellings.push(`${groups.slice(0, from).map(hex).join(":")}::${[...groups.slice(to, 6).map(hex), `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`].join(":")}`);
      }
    }
    for (const spelling of spellings) {
      assert.deepEqual(groupsOf(spelling), groups, spelling);
      assert.equal(addressKey(spelling), keyOf(groups), spelling);
    }
    // and text made of an address's letters that is no address
    const letters = "0123456789abcdef::::";
    const text = Array.from({ length: 1 + next(24) }, () => letters[next(letters.length)]).join("");
    if (isIP(text) === 6) assert.equal(addressKey(text), keyOf(groupsOf(text)), text);
    else assert.equal(addressKey(text), "nowhere", text);
  }
});
