// Helpers: a "phone" is a separate browser context (its own storage, like its own device).
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export interface Phone {
  name: string;
  ctx: BrowserContext;
  page: Page;
  errors: string[];
  /** Console errors and connection events, printed if something fails. */
  log: string[];
  taps: number;
}

export async function newPhone(browser: Browser, name: string, contextOptions: Parameters<Browser["newContext"]>[0]): Promise<Phone> {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const phone: Phone = { name, ctx, page, errors: [], log: [], taps: 0 };
  watch(phone, page);
  return phone;
}

export function watch(phone: Phone, page: Page) {
  page.on("pageerror", (e) => phone.errors.push(`${phone.name}: ${e.message}`));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && phone.log.push(`console.${m.type()}: ${m.text()}`));
  page.on("requestfailed", (r) => phone.log.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("websocket", (ws) => {
    phone.log.push(`websocket open ${ws.url().replace(/key=[^&]+/, "key=…")}`);
    ws.on("socketerror", (e) => phone.log.push(`websocket error: ${e}`));
    ws.on("close", () => phone.log.push("websocket closed"));
  });
}

/** Print what this phone saw, to make a failure on CI readable from the log alone. */
export async function explain(p: Phone, what: string) {
  const body = await p.page.locator("body").innerText().catch(() => "(no page)");
  console.log(`--- ${p.name}: ${what}\nscreen: ${body.slice(0, 400)}\nerrors: ${JSON.stringify(p.errors)}\nlog: ${JSON.stringify(p.log.slice(-20))}`);
}

/** Make a room through the API; tests may speed up the room's timers. */
export async function createRoom(request: APIRequestContext, body: object): Promise<string> {
  const res = await request.post("/api/rooms", { data: body });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code;
}

/** Open the room link, set a name, start a team of one. */
export async function joinWithTeam(p: Phone, code: string) {
  await p.page.goto(`/r/${code}`);
  try {
    await expect(p.page.locator(".lobby")).toBeVisible({ timeout: 20_000 });
  } catch (e) {
    await explain(p, "no lobby");
    throw e;
  }
  const name = p.page.locator(".lobby .field input");
  await name.fill(p.name);
  await name.blur();
  await p.page.getByRole("button", { name: "新建一队" }).click();
  await expect(p.page.locator(".teams li.mine")).toBeVisible();
}

export interface TapOptions {
  declineBuys?: boolean;
  /** Chance of bidding when an auction is open (0 = never). */
  bid?: number;
}

/**
 * Make whatever decision this phone's screen is asking for, by clicking the button a person
 * would most likely press. Done inside the page in one step, so it never races a re-render.
 */
export async function tap(p: Phone, o: TapOptions = {}): Promise<string | null> {
  if (p.page.isClosed()) return null;
  const kind = await p.page
    .evaluate((o: TapOptions) => {
      const auction = document.querySelector(".decide.auction");
      if (auction) {
        const b = auction.querySelector<HTMLButtonElement>(".btn.primary:not([disabled])");
        if (b && Math.random() < (o.bid ?? 0.4)) {
          b.click();
          return "bid";
        }
        return null;
      }
      const panel = document.querySelector<HTMLElement>(".decide:not(.waiting)");
      if (!panel) return null;
      const kind = panel.dataset.kind ?? panel.className;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>(".btn:not([disabled]):not(.danger)"));
      if (!buttons.length) return null;
      let pick =
        panel.querySelector<HTMLButtonElement>(".btn.primary:not([disabled])") ??
        panel.querySelector<HTMLButtonElement>(".btn[data-default]:not([disabled])") ??
        buttons[0];
      if (kind === "buy" && o.declineBuys) pick = buttons.find((b) => !b.classList.contains("primary")) ?? pick;
      if (kind === "debt" && !panel.querySelector(".btn.primary:not([disabled])")) {
        // Can't pay yet: sell or mortgage something first (the debt panel lists them), else go broke.
        const sellable = panel.querySelector<HTMLButtonElement>(".assets .btn:not([disabled])");
        // Going broke takes two taps: the button, then "确定破产".
        if (sellable) pick = sellable;
        else pick = panel.querySelector<HTMLButtonElement>(".btn.danger") ?? pick;
      }
      pick.click();
      return kind;
    }, o)
    .catch(() => null);
  if (kind) p.taps += 1;
  return kind;
}

/** Everyone taps whatever their screen asks for until `done()` is true. */
export async function playUntil(phones: Phone[], done: () => Promise<boolean>, timeoutMs: number, o: TapOptions = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await done()) return;
    let acted = false;
    for (const p of phones) if (await tap(p, o)) acted = true;
    if (!acted) await phones.find((p) => !p.page.isClosed())!.page.waitForTimeout(120);
  }
  throw new Error(`timed out after ${timeoutMs} ms`);
}
