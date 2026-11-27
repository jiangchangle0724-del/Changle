/**
 * The Worker handing out the app's page and files (src/server/worker.ts, `page`), with a stand-in
 * for where the files are kept. The platform test (tests/platform/server.test.ts) shows the real
 * files going out with the right headers; what is shown here is what the real file store never
 * does in a test: answer with something other than the file, or be asked for something it should
 * never be asked for.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { workerModule } from "./workermod";

type Worker = { default: { fetch(request: Request, env: object): Promise<Response> } };
const worker = workerModule() as Promise<Worker>;

const ORIGIN = "https://money.changle.test";
const PAGE_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const NOTHING_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The Worker, with a file store that notes what it is asked and answers as the test says. */
async function served(answer: (path: string) => Response | Promise<Response>, vars: Record<string, string> = { GATE: "owner" }) {
  const asked: { url: string; method: string; headers: [string, string][]; body: boolean }[] = [];
  const env = {
    ORIGIN,
    ...vars,
    ASSETS: {
      fetch: async (request: Request): Promise<Response> => {
        asked.push({ url: request.url, method: request.method, headers: [...request.headers], body: request.body !== null });
        return answer(new URL(request.url).pathname);
      },
    },
  };
  const { default: entry } = await worker;
  return { asked, urls: (): string[] => asked.map((one) => one.url), get: (path: string, init: RequestInit = {}) => entry.fetch(new Request(`${ORIGIN}${path}`, init), env) };
}
const file = (body: string, type: string, more: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "Content-Type": type, ...more } });
const said = async (answer: Response): Promise<unknown[]> => [answer.status, await answer.text(), answer.headers.get("Cache-Control"), answer.headers.get("Content-Security-Policy")];
const REFUSED = [404, '{"ok":false,"why":"no-such-thing"}', "no-store", NOTHING_POLICY];

test("the files are asked for by their path alone: nothing of the request goes with it", async () => {
  const { asked, get } = await served((path) => file(`<${path}>`, path === "/" ? "text/html; charset=utf-8" : "text/javascript"));
  const sent = { Cookie: `__Host-ml=uaaaaaa1.${"x".repeat(43)}; __Host-ml-n=${"n".repeat(43)}`, Authorization: "Bearer made-up", Range: "bytes=0-3", "If-None-Match": '"abc"', "If-Modified-Since": "Fri, 01 Jan 2100 00:00:00 GMT", "X-Forwarded-For": "203.0.113.9", Origin: "https://elsewhere.example" };
  assert.deepEqual(await said(await get("/?next=https://elsewhere.example#h=x", { headers: sent })), [200, "</>", "no-store", PAGE_POLICY]);
  assert.deepEqual(await said(await get("/assets/app-AB12CD34.js", { headers: sent })), [200, "</assets/app-AB12CD34.js>", "public, max-age=31536000, immutable", NOTHING_POLICY]);
  assert.deepEqual(await said(await get("/licences.txt", { headers: sent })), [200, "</licences.txt>", "no-store", NOTHING_POLICY]);
  const head = await get("/", { method: "HEAD", headers: sent });
  assert.equal(head.status, 200);
  assert.deepEqual(asked, [
    { url: "https://assets.invalid/", method: "GET", headers: [], body: false },
    { url: "https://assets.invalid/assets/app-AB12CD34.js", method: "GET", headers: [], body: false },
    { url: "https://assets.invalid/licences.txt", method: "GET", headers: [], body: false },
    { url: "https://assets.invalid/", method: "HEAD", headers: [], body: false },
  ]);
});

test("the file, whole, or nothing: a redirect, a part, \"not changed\" or an error from the file store is not passed on", async () => {
  for (const status of [201, 204, 206, 301, 302, 304, 307, 308, 400, 403, 404, 410, 500, 503]) {
    const empty = [204, 304].includes(status);
    const { get } = await served(() => new Response(empty ? null : "from the store", { status, headers: { Location: "https://elsewhere.example/", "Content-Type": "text/html", "Content-Range": "bytes 0-3/10", "Set-Cookie": "a=b" } }));
    for (const path of ["/", "/assets/app-AB12CD34.js", "/licences.txt"]) {
      const answer = await get(path);
      assert.deepEqual([answer.headers.get("Location"), answer.headers.get("Content-Range"), answer.headers.getSetCookie()], [null, null, []], `${status} ${path}`);
      assert.deepEqual(await said(answer), REFUSED, `${status} ${path}`);
    }
  }
  // a store that cannot be asked at all is this server's failure, said as any other
  const { get } = await served(() => Promise.reject(new Error("the store is down")));
  assert.deepEqual(await said(await get("/")), [500, '{"ok":false,"why":"unavailable"}', "no-store", NOTHING_POLICY]);
});

test("of what the file store says, only the file and its kind go out", async () => {
  const more = { ETag: '"abc"', "Last-Modified": "Fri, 20 Nov 2026 00:00:00 GMT", "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*", "Set-Cookie": "a=b", "Content-Security-Policy": "default-src *", "X-Frame-Options": "ALLOWALL", "X-Something": "else" };
  const { get } = await served((path) => file("the file", path.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8", more));
  for (const [path, kept, policy, type] of [
    ["/", "no-store", PAGE_POLICY, "text/html; charset=utf-8"],
    ["/assets/app-AB12CD34.css", "public, max-age=31536000, immutable", NOTHING_POLICY, "text/css; charset=utf-8"],
  ] as const) {
    const answer = await get(path);
    assert.deepEqual(
      [...answer.headers].sort(),
      [
        ["cache-control", kept],
        ["content-security-policy", policy],
        ["content-type", type],
        ["cross-origin-resource-policy", "same-origin"],
        ["referrer-policy", "no-referrer"],
        ["strict-transport-security", "max-age=31536000; includeSubDomains"],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "DENY"],
      ],
      path,
    );
    assert.equal(await answer.text(), "the file");
  }
});

test("only the page, the licences and plainly named files under /assets are ever asked for", async () => {
  const { asked, urls, get } = await served(() => file("x", "text/plain"));
  const never = [
    "/index.html", "/index", "/nothing", "/assets", "/assets/", "/assets//icon.svg", "/assets/icon.svg/", "/assets/.env", "/assets/a.b.js", "/assets/x/y/z.js", "/assets/..%2findex.html", "/assets/%2e%2e%2findex.html",
    "/assets/icon.svg%00", "/assets/icon", "/assets/fonts/", "/assets/Fonts/figtree.woff2", "/assets/fonts/fig tree.woff2", "/licences", "/licences.txt/", "/Licences.txt", "//", "/.well-known/security.txt", "/assets/icon.svg;x",
  ];
  for (const path of never) assert.deepEqual(await said(await get(path)), REFUSED, path);
  assert.deepEqual(urls(), [], "the file store was asked for something that is no file of the app");
  // (dots that go up are resolved before the path is looked at, as every browser and server does: what is asked for is where they lead)
  for (const [path, leads] of [["/assets/fonts/../icon.svg", "/assets/icon.svg"], ["/assets/%2e%2e/index.html", null], ["/assets/../licences.txt", "/licences.txt"], ["/x/../", "/"]] as const) {
    asked.length = 0;
    const answer = await get(path);
    assert.deepEqual([answer.status, urls()], leads ? [200, [`https://assets.invalid${leads}`]] : [404, []], path);
  }
  // the names the build gives its files are all let through
  asked.length = 0;
  for (const path of ["/assets/app-YH6XPUAN.js", "/assets/app-21241BDD.css", "/assets/icon.svg", "/assets/fonts/figtree.woff2", "/assets/fonts/unbounded.woff2"]) assert.equal((await get(path)).status, 200, path);
  assert.equal(urls().length, 5);
});

test("only to be read; and with the gate shut, or nothing set up, the file store is not asked at all", async () => {
  const open = await served(() => file("x", "text/plain"));
  for (const path of ["/", "/assets/icon.svg", "/licences.txt"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const answer = await open.get(path, { method });
      assert.deepEqual([answer.status, answer.headers.get("Allow"), await answer.text()], [405, "GET, HEAD", '{"ok":false,"why":"get-only"}'], `${method} ${path}`);
    }
  }
  assert.deepEqual(open.asked, []);
  // what is no page stays no page, whatever is asked of it
  assert.deepEqual(await said(await open.get("/nothing", { method: "POST" })), REFUSED);

  for (const vars of [{ GATE: "closed" }, {}, { GATE: "nonsense" }] as Record<string, string>[]) {
    const shut = await served(() => file("x", "text/plain"), vars);
    const front = await shut.get("/");
    assert.equal(front.status, 403, JSON.stringify(vars));
    assert.deepEqual([front.headers.get("Content-Type"), front.headers.get("Cache-Control"), front.headers.get("Content-Security-Policy")], ["text/html; charset=utf-8", "no-store", NOTHING_POLICY]);
    const words = await front.text();
    assert.ok(words.includes("心里有数还没有开放。") && words.includes("MoneyLens is not open yet.") && !/<script|<link|href=|src=/.test(words));
    for (const path of ["/assets/icon.svg", "/assets/app-AB12CD34.js", "/licences.txt"]) assert.deepEqual(await said(await shut.get(path)), REFUSED, path);
    assert.deepEqual(shut.asked, [], JSON.stringify(vars));
  }
  // every way the gate can be open hands out the same page: the page holds nobody's data, and who gets in is decided at sign-in
  for (const vars of [{ GATE: "owner" }, { GATE: "list", ALLOWED_ACCOUNTS: "uaaaaaa1" }, { GATE: "list", ALLOWED_ACCOUNTS: "" }] as Record<string, string>[]) {
    const let_in = await served(() => file("the page", "text/html; charset=utf-8"), vars);
    assert.deepEqual(await said(await let_in.get("/")), [200, "the page", "no-store", PAGE_POLICY], JSON.stringify(vars));
  }
  // with no origin set, nothing is answered
  const { default: entry } = await worker;
  const unset = await entry.fetch(new Request(`${ORIGIN}/`), { GATE: "owner", ASSETS: { fetch: () => assert.fail("asked") } });
  assert.deepEqual([unset.status, await unset.text()], [503, '{"ok":false,"why":"not-set-up"}']);
});
