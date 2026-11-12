// Error reports (src/server/reports.ts, src/client/report.ts): what a page may send, what the server
// keeps of it (nothing personal), how reports of one problem add up, and that the box stays small.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ownStack } from "../src/client/report";
import {
  MAX_ENTRIES,
  browserOf,
  keepReport,
  keyOf,
  makeLimiter,
  readReport,
  reportSummary,
  scrub,
  signature,
  type ReportEntry,
  type ReportStore,
} from "../src/server/reports";

/** A Durable Object's storage, in memory. */
function memory(): ReportStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => void map.set(key, structuredClone(value)),
    delete: async (key: string) => map.delete(key),
    list: async <T>({ prefix }: { prefix: string }) =>
      new Map([...map].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1))) as Map<string, T>,
  };
}

test("a report is only what it may be: the known fields, cut short, no address or room in it", () => {
  assert.equal(readReport(null), null);
  assert.equal(readReport({ kind: "boom", msg: "x", screen: "phone" }), null, "an unknown kind");
  assert.equal(readReport({ kind: "error", msg: "x", screen: "fridge" }), null, "an unknown screen");
  assert.equal(readReport({ kind: "error", msg: "   ", screen: "phone" }), null, "no message");
  const r = readReport({
    kind: "error",
    msg: "failed wss://changle.ca/trip/api/rooms/1234/ws?cid=abc&key=secret&name=Mia " + "x".repeat(400),
    stack: "at f (https://changle.ca/trip/app.js?v=1:1:2345)\nat g (https://changle.ca/trip/r/5678:3:4)",
    ms: -5,
    screen: "phone",
    phase: "playing",
    build: "abc1234",
    lang: "en",
    name: "Mia",
    cid: "abc",
    room: "1234",
  });
  assert.ok(r);
  assert.deepEqual(Object.keys(r).sort(), ["build", "kind", "lang", "msg", "phase", "screen", "stack"]);
  assert.ok(r.msg.length <= 300);
  for (const gone of ["secret", "cid=", "Mia", "changle.ca", "1234"]) assert.ok(!r.msg.includes(gone), `the message keeps ${gone}: ${r.msg}`);
  assert.ok(r.msg.startsWith("failed /trip/api/rooms/____/ws x"), r.msg);
  assert.equal(r.stack, "at f (/trip/app.js:1:2345)\nat g (/trip/r/____:3:4)");
  assert.equal(readReport({ kind: "freeze", msg: "frozen 7 s", ms: 7200.4, screen: "tv", build: "../../etc" })?.build, undefined, "a build that isn't a name");
  assert.equal(readReport({ kind: "freeze", msg: "frozen 7 s", ms: 7200.4, screen: "tv" })?.ms, 7200);
  assert.equal(scrub("a\u0000b\u001fc\nd", 10), "abc\nd");
});

test("the browser is kept as its family and major version only", () => {
  const cases: [string, string][] = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "iOS 18 Safari 18"],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800323c) NetType/WIFI Language/zh_CN",
      "iOS 17 WeChat 8",
    ],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1", "iOS 18 Chrome 130"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Android 14 Chrome 130"],
    ["Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36", "Android 13 Samsung 25"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Mac Safari 18"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Windows Edge 130"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", "Windows Firefox 132"],
    ["curl/8.0", "? ?"],
  ];
  for (const [ua, want] of cases) assert.equal(browserOf(ua), want, ua);
});

test("one problem is one entry: the same message from the same file, whatever the build's columns and numbers", () => {
  const a = readReport({ kind: "error", msg: "x is undefined at 12", stack: "f@/trip/app.js:1:2345", screen: "phone" })!;
  const b = readReport({ kind: "error", msg: "x is undefined at 13", stack: "f@/trip/app.js:1:9999", screen: "tv" })!;
  const c = readReport({ kind: "error", msg: "x is undefined at 12", stack: "f@/trip/globe.js:1:2345", screen: "tv" })!;
  assert.equal(signature(a), signature(b));
  assert.notEqual(signature(a), signature(c));
  assert.equal(signature(readReport({ kind: "freeze", msg: "frozen 7 s", screen: "phone", phase: "playing" })!), "freeze|phone|playing");
  assert.equal(signature(readReport({ kind: "offline", msg: "offline 40 s", screen: "tv" })!), "offline|tv");
  assert.match(keyOf(signature(a)), /^sig:[0-9a-f]{8}$/);
});

test("reports add up: how often, since when, where, in which browsers and builds; the longest freeze", async () => {
  const box = memory();
  const at = Date.UTC(2026, 10, 6, 12);
  const freeze = (ms: number, screen: "phone" | "tv") => readReport({ kind: "freeze", msg: `frozen ${ms / 1000} s`, ms, screen, phase: "playing", build: "abc1234" })!;
  await keepReport(box, freeze(7000, "phone"), "iOS 18 Safari 18", at);
  await keepReport(box, freeze(12000, "phone"), "Android 14 Chrome 130", at + 60_000);
  await keepReport(box, readReport({ kind: "error", msg: "boom", stack: "f@/trip/app.js:1:2", screen: "tv", phase: "lobby" })!, "Mac Safari 18", at + 120_000);
  const s = await reportSummary(box, at + 180_000);
  assert.equal(s.total, 3);
  assert.deepEqual(s.days, [{ day: "2026-11-06", n: 3 }]);
  assert.equal(s.problems.length, 2);
  assert.equal(s.problems[0].kind, "error", "the latest first");
  const f = s.problems[1] as ReportEntry;
  assert.equal(f.count, 2);
  assert.equal(f.longest, 12000);
  assert.equal(f.first, at);
  assert.equal(f.last, at + 60_000);
  assert.deepEqual(f.browsers, { "iOS 18 Safari 18": 1, "Android 14 Chrome 130": 1 });
  assert.deepEqual(f.builds, { abc1234: 2 });
  assert.deepEqual(f.screens, { phone: 2 });
  assert.equal(s.problems[0].where, "app.js:1:2");
});

test("the box stays small: 200 problems at most (the oldest go), a tally names 12, 60 days kept", async () => {
  const box = memory();
  const at = Date.UTC(2026, 0, 1);
  for (let i = 0; i < MAX_ENTRIES + 15; i++)
    await keepReport(box, readReport({ kind: "error", msg: `problem ${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${Math.floor(i / 26)}x`, stack: `f@/trip/f${i}.js:1:1`, screen: "phone" })!, `B${i % 20}`, at + i * 86_400_000);
  const s = await reportSummary(box, at);
  const kept = [...box.map.keys()].filter((k) => k.startsWith("sig:")).length;
  assert.equal(kept, MAX_ENTRIES);
  assert.ok(!s.problems.some((p) => p.where === "f0.js:1:1"), "the one seen longest ago went");
  assert.equal(s.problems.length, 60);
  assert.ok([...box.map.keys()].filter((k) => k.startsWith("day:")).length <= 60);
  const one = memory();
  for (let i = 0; i < 20; i++) await keepReport(one, readReport({ kind: "freeze", msg: "frozen", screen: "phone" })!, `Browser ${i}`, at);
  const browsers = (await reportSummary(one, at)).problems[0].browsers;
  assert.equal(Object.keys(browsers).length, 13);
  assert.equal(browsers.other, 8);
});

test("one address sends at most 30 reports in 10 minutes", () => {
  const ok = makeLimiter();
  const t0 = 1_000_000;
  const answers = Array.from({ length: 35 }, (_, i) => ok("1.2.3.4", t0 + i));
  assert.equal(answers.filter(Boolean).length, 30);
  assert.equal(ok("5.6.7.8", t0), true, "another address isn't held up");
  assert.equal(ok("1.2.3.4", t0 + 10 * 60_000 + 1), true, "ten minutes later it may again");
});

test("a page sends only the game's own lines of a stack, without the host or a query", () => {
  const chrome = "Error: boom at /trip/r/1234\n    at f (https://changle.ca/trip/app.js:1:2345)\n    at chrome-extension://abc/x.js:1:1\n    at g (https://changle.ca/trip/app.js?v=2:1:99)";
  assert.equal(ownStack(chrome), "at f (/trip/app.js:1:2345)\nat g (/trip/app.js:1:99)");
  const safari = "f@https://changle.ca/trip/demo:1:2\nglobal code@\nh@https://changle.ca/trip/demo:3:4";
  assert.equal(ownStack(safari), "f@/trip/demo:1:2\nh@/trip/demo:3:4");
  assert.equal(ownStack(undefined), "");
});
