// The first-person move: after our throw the board leans back and the camera follows our token round
// the ring, the cities it passes come up one by one, the place it lands on comes up by name, and the
// camera goes back up with the play window. The page never gets wider while it plays. With the
// menu's setting off, the board just moves as before.
import { expect, test } from "@playwright/test";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, tap, type Phone } from "./phones";

test.afterEach(closeAll);

async function untilOurRoll(p: Phone) {
  const roll = p.page.locator('.decide[data-kind="roll"]:not(.waiting) .btn.primary:not([disabled])');
  for (const end = Date.now() + 40_000; Date.now() < end; ) {
    if ((await roll.count()) && !(await p.page.locator(".ride").count())) return roll;
    if (!(await tap(p, { skip: ["roll"] }))) await p.page.waitForTimeout(150);
  }
  await explain(p, "no roll");
  throw new Error("our roll never came up");
}

test("第一视角走棋：掷完骰子，镜头跟着棋子走，途经的城市一个个出来，落地后镜头回来", async ({ browser, request, contextOptions }) => {
  test.setTimeout(120_000);
  const code = await createRoom(request, {});
  const p = await newPhone(browser, "走", contextOptions);
  await joinWithTeam(p, code);
  await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
  const board = p.page.locator(".stage .roundboard");
  const ride = p.page.locator(".stage .ride");
  // Every frame of the ride, note how far the board leans and whether the page got wider.
  await p.page.evaluate(() => {
    const w = window as unknown as { lean: number; wider: number };
    w.lean = 0;
    w.wider = 0;
    const look = () => {
      const svg = document.querySelector<SVGSVGElement>(".stage .roundboard");
      const m = svg?.style.transform.match(/rotateX\(([\d.]+)deg\)/);
      if (m) w.lean = Math.max(w.lean, Number(m[1]));
      w.wider = Math.max(w.wider, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const roll = await untilOurRoll(p);
  await roll.click();
  await expect(ride, "the ride starts after the dice").toBeVisible({ timeout: 4_000 });
  // The play window steps aside while it plays, and the landing comes up by name.
  await expect(p.page.locator(".playwin")).toHaveAttribute("data-open", "0");
  await expect(ride.locator(".ride-land")).toHaveClass(/\bon\b/, { timeout: 8_000 });
  expect(await ride.locator(".ride-chip").count()).toBe(await ride.locator(".ride-chip.on").count());
  // Then it's over: the board stands straight again, its token is back, the window comes back.
  await expect(ride).toHaveCount(0, { timeout: 6_000 });
  await expect.poll(() => board.evaluate((el: SVGSVGElement) => el.style.transform)).toBe("");
  await expect(p.page.locator(".stage .token.ridden")).toHaveCount(0);
  const seen = await p.page.evaluate(() => {
    const w = window as unknown as { lean: number; wider: number };
    return { lean: w.lean, wider: w.wider };
  });
  expect(seen.lean, "the board leaned back").toBeGreaterThan(40);
  expect(seen.wider, "the page never got wider").toBeLessThanOrEqual(1);
  expect(p.errors).toEqual([]);

  // With the menu's setting off, the next throw just moves the token on the board.
  await p.page.locator(".menu-btn").click();
  await p.page.getByRole("checkbox", { name: /第一视角走棋/ }).uncheck();
  await p.page.keyboard.press("Escape");
  const again = await untilOurRoll(p);
  await again.click();
  await p.page.waitForTimeout(2_500);
  await expect(ride).toHaveCount(0);
  expect(p.errors).toEqual([]);
});
