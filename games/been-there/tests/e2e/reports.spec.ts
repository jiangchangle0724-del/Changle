// Error reports (src/client/report.ts, src/server/reports.ts): a page that hits an error in the game's
// own files, leaves a promise uncaught or freezes tells the server by itself, and /trip/api/reports
// sums it up, with nothing personal in it.
import { devices, expect, test, type APIRequestContext } from "@playwright/test";
import { closeAll, newPhone } from "./phones";

test.afterEach(closeAll);

interface Problem {
  kind: string;
  msg: string;
  where: string;
  count: number;
  longest?: number;
  screens: Record<string, number>;
  browsers: Record<string, number>;
  builds: Record<string, number>;
}

const problems = async (request: APIRequestContext): Promise<Problem[]> => (await (await request.get("/trip/api/reports")).json()).problems;

test("出错自动报告：游戏自己的文件出错、没人接住的 promise、卡住 7 秒，都自己报给服务器，汇总里没有房间号和钥匙", async ({ browser, request }) => {
  test.setTimeout(60_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const p = await newPhone(browser, "报告", { ...iphone, locale: "zh-CN" });
  const tag = `e2e${Date.now()}`;
  // A file of the game's that throws, and one that leaves a promise nobody catches.
  await p.page.route(/\/trip\/boom-\w+\.js$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `function boom() { throw new Error("boom ${tag} at /trip/r/1234?cid=abc&key=secret"); }\nPromise.reject(new Error("rejected ${tag}"));\nboom();\n`,
    }),
  );
  await p.page.goto("/trip/demo");
  await expect(p.page.getByRole("button", { name: "开始", exact: true })).toBeVisible({ timeout: 15_000 });
  const before = (await problems(request)).find((x) => x.kind === "freeze" && x.screens.demo)?.count ?? 0;

  await p.page.addScriptTag({ url: `/trip/boom-${tag}.js` }).catch(() => {});
  await expect
    .poll(async () => (await problems(request)).filter((x) => x.msg.includes(tag)).map((x) => x.kind).sort().join(","), { timeout: 15_000 })
    .toBe("error,rejection");
  const mine = (await problems(request)).filter((x) => x.msg.includes(tag));
  const error = mine.find((x) => x.kind === "error")!;
  expect(error.msg).toContain(`boom ${tag} at /trip/r/____`);
  for (const gone of ["secret", "cid=", "1234", "127.0.0.1"]) expect(JSON.stringify(mine)).not.toContain(gone);
  expect(error.where).toMatch(/^boom-\w+\.js:1:\d+$/);
  expect(error.screens).toEqual({ demo: 1 });
  // The browser as its family and version, never the whole user agent.
  expect(Object.keys(error.browsers)).toHaveLength(1);
  expect(Object.keys(error.browsers)[0]).toMatch(/^iOS \d+ Safari \d+$/);
  expect(Object.keys(error.builds)[0]).toMatch(/^[0-9a-f]{7}$|^dev$/);

  // The page busy for 7.5 s with nobody able to tap: the next beat says it froze.
  await p.page.evaluate(() => {
    const end = performance.now() + 7_500;
    while (performance.now() < end) {
      // frozen
    }
  });
  await expect
    .poll(async () => (await problems(request)).find((x) => x.kind === "freeze" && x.screens.demo)?.count ?? 0, { timeout: 10_000 })
    .toBe(before + 1);
  const freeze = (await problems(request)).find((x) => x.kind === "freeze" && x.screens.demo)!;
  expect(freeze.longest).toBeGreaterThanOrEqual(6_000);
});
