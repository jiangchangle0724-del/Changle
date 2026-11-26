/*
 * Scan to join (src/online/scan.ts). Run with `npx tsx tests/scan.test.ts`
 *  1. A table's link, from changle.ca or this page's own address, joins that table; so does a code alone.
 *  2. Another changle.ca page opens as it is (a 两清 ledger keeps its key).
 *  3. Anything else is refused: another site, a look-alike host, plain http, a code that can't be one.
 */
import { readScan } from "../src/online/scan";

let failed = 0;
const ok = (cond: boolean, name: string) => {
  if (cond) console.log("ok  ", name);
  else {
    console.log("FAIL", name);
    failed++;
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const HERE = "https://changle.ca";

// 1. tables
ok(same(readScan("https://changle.ca/t/RB56", HERE), { kind: "table", code: "RB56" }), "a table's link joins it");
ok(same(readScan("https://www.changle.ca/t/rb56/", HERE), { kind: "table", code: "RB56" }), "www, lower case and a trailing slash");
ok(same(readScan("  RB56\n", HERE), { kind: "table", code: "RB56" }), "a code alone, with spaces round it");
ok(same(readScan("http://127.0.0.1:5173/t/RB56", "http://127.0.0.1:5173"), { kind: "table", code: "RB56" }), "this page's own address (a test server)");
ok(same(readScan("https://changle.ca/t/RB56", "http://127.0.0.1:5173"), { kind: "table", code: "RB56" }), "a changle.ca table read on a test server joins it there");

// 2. other pages of ours
ok(same(readScan("https://changle.ca/split/abc123def#k=key_1", HERE), { kind: "page", href: "https://changle.ca/split/abc123def#k=key_1" }), "a 两清 ledger keeps its key");
ok(same(readScan("https://changle.ca/eat", HERE), { kind: "page", href: "https://changle.ca/eat" }), "another tool opens as it is");

// 3. refused
ok(readScan("https://example.com/t/RB56", HERE) === null, "another site");
ok(readScan("https://changle.ca.evil.example/t/RB56", HERE) === null, "a look-alike host");
ok(readScan("http://changle.ca/t/RB56", HERE) === null, "plain http");
ok(readScan("https://changle.ca/t/RB10", HERE) === null, "0 and 1 are never in a code");
ok(readScan("hello world", HERE) === null, "words");
ok(readScan("javascript:alert(1)", HERE) === null, "a script address");

console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
