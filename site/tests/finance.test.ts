/*
 * 心里有数 · MoneyLens's page on the main site (src/tools/financeDoor.ts, src/tools/Finance.tsx): the
 * way in to money.changle.ca. Run with `npx tsx tests/finance.test.ts`
 *  1. A code is taken to MoneyLens's own address and nowhere else, in the fragment, and only when
 *     it looks like a code.
 *  2. Why no code came, as what the page says.
 *  3. The page itself never reads where to go from the address, and leaves for nowhere else.
 */
import { readFileSync } from "node:fs";
import { AUDIENCE, isNonce, MONEY, troubleOf, wayIn } from "../src/tools/financeDoor";
import { AUDIENCES } from "../worker/handoffCodes";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const eq = (got: unknown, want: unknown, msg: string) => ok(got === want, `${msg} → ${JSON.stringify(got)}${got === want ? "" : `, wanted ${JSON.stringify(want)}`}`);

// 1. where a code goes
eq(MONEY, "https://money.changle.ca", "MoneyLens's address is written out");
ok((AUDIENCES as readonly string[]).includes(AUDIENCE), "the accounts service makes codes for the audience this page asks for");
const code = "kq3B7xT0aVY2uW9nL5dR8sH1cJ6mP4zE-_AbCdEfGhI";
eq(wayIn(code), `https://money.changle.ca/#h=${code}`, "a code rides in the fragment of MoneyLens's own address");
eq(new URL(wayIn(code)!).origin, "https://money.changle.ca", "and the address is MoneyLens's whatever the code is");
for (const bad of [undefined, null, 7, {}, "", "short", "n".repeat(129), `${code}&to=https://elsewhere.example`, `${code}#x`, `${code}/..`, "@elsewhere.example/aaaaaaaaaaaaaaaaaaaa", "has space in it and is long enough", "代码代码代码代码代码代码代码代码代码代码代码代码"])
  eq(wayIn(bad), null, `what is not a code is taken nowhere (${String(bad).slice(0, 14) || "empty"})`);
// (whatever a code could hold, the browser lands on MoneyLens: only its letters are let through)
for (const odd of ["a".repeat(20), "-".repeat(20), "_".repeat(128), "0".repeat(64)]) eq(new URL(wayIn(odd)!).href, `https://money.changle.ca/#h=${odd}`, "every shape a code can have lands there");

ok(isNonce("n".repeat(20)) && isNonce("n".repeat(64)) && isNonce("aB3_-".repeat(8)), "a nonce is 20 to 64 of the letters a nonce has");
ok(![undefined, null, 5, "", "n".repeat(19), "n".repeat(65), "nonce with a space in it....", "nonce/with/slashes/in/it....", "<script>alert(1)</script>...."].some(isNonce), "and nothing else is one");

// 2. why no code came
eq(troubleOf(null), "offline", "no answer at all");
eq(troubleOf(401, "signin"), "sign-in", "nobody signed in");
eq(troubleOf(429, "slow-down"), "slow-down", "too many codes asked for");
eq(troubleOf(400, "nonce"), "bad-link", "the nonce was not taken");
eq(troubleOf(400, "aud"), "bad-link", "the audience was not taken");
eq(troubleOf(400, "something-else"), "failed", "another 400 is not the link's doing");
for (const [status, word] of [[403, "banned"], [503, "paused"], [500, "500"], [404, "404"], [200, ""]] as const) eq(troubleOf(status, word), "failed", `${status} ${word}`);

// 3. the page: the one address it leaves for is the one above
const page = readFileSync(new URL("../src/tools/Finance.tsx", import.meta.url), "utf8");
const leaves = [...page.matchAll(/window\.location\.(\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`);
ok(JSON.stringify([...new Set(leaves)].sort()) === JSON.stringify(["assign(`${MONEY}/`)", "replace(to)"]), `the page leaves by wayIn's address, or for MoneyLens's front page, and no other way (${leaves.join(", ")})`);
ok(/const to = wayIn\(code\);/.test(page), "the address it leaves for with a code is wayIn's");
ok(!/location\.(href|search|hash|pathname)|URLSearchParams|document\.referrer|window\.open|\.href\s*=/.test(page), "it reads nothing of the address, and opens nothing");
ok(/body: \{ aud: AUDIENCE, nonce \}/.test(page), "it asks for a code for MoneyLens, bound to the nonce it was opened with");
ok(!/localStorage|sessionStorage|document\.cookie|console\./.test(page), "the code and the nonce are kept nowhere and written to no log");

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall good");
