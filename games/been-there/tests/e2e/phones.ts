// Helpers: a "phone" is a separate browser context (its own storage, like its own device).
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";

export interface Phone {
  name: string;
  ctx: BrowserContext;
  page: Page;
  errors: string[];
  /** Console errors and connection events, printed if something fails. */
  log: string[];
  taps: number;
}

/** What the running test opened (phones, a big screen): closed when it ends, by `closeAll`. */
const opened: BrowserContext[] = [];
export const track = (ctx: BrowserContext) => {
  opened.push(ctx);
  void quietApple(ctx);
};

const quieted = new WeakMap<BrowserContext, Promise<void>>();
/**
 * Apple's song lookup (a second visit's local hit) answered from here, with no song, for every
 * context a test opens: no test waits on Apple's servers, nor fails when they turn the page away
 * (WebKit reports that as a page error). `local.spec.ts` answers it with a song of its own.
 */
export function quietApple(ctx: BrowserContext): Promise<void> {
  const had = quieted.get(ctx);
  if (had) return had;
  const done = ctx
    .route(/^https:\/\/itunes\.apple\.com\/lookup/, (route) =>
      route.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript; charset=utf-8", body: JSON.stringify({ resultCount: 0, results: [] }) }),
    )
    .then(() => undefined);
  quieted.set(ctx, done);
  return done;
}

/**
 * Close everything the test opened. A context made with browser.newContext() otherwise outlives its
 * test and keeps running, in the same browser, through every test after it (a game still going, a
 * finished game's finale with its turning rays), taking time from them.
 */
export async function closeAll() {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
}

export async function newPhone(browser: Browser, name: string, contextOptions: Parameters<Browser["newContext"]>[0]): Promise<Phone> {
  const ctx = await browser.newContext(contextOptions);
  track(ctx);
  await quietApple(ctx);
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

export interface Gate {
  /** From now on, what the server sends this phone waits, as if its network stalled. */
  hold(): void;
  /** Deliver what waited, in order, and let the rest straight through again. */
  release(): void;
}

/** Put a gate on what the server sends this phone. Set it up before the phone opens the room. */
export async function gate(p: Phone): Promise<Gate> {
  let held = false;
  let page: WebSocketRoute | undefined;
  const waiting: (string | Buffer)[] = [];
  await p.ctx.routeWebSocket(/\/api\/rooms\/[^/]+\/ws/, (ws) => {
    page = ws;
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => (held ? waiting.push(m) : ws.send(m)));
  });
  return {
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
      for (const m of waiting.splice(0)) page?.send(m);
    },
  };
}

/** Make a room through the API; tests may speed up the room's timers. */
// (A button that taps back on an iPhone is a label round a hidden switch: `.off` when it can't be pressed.)
export async function createRoom(request: APIRequestContext, body: object): Promise<string> {
  const res = await request.post("/trip/api/rooms", { data: body });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code;
}

/** Open the room link, set a name, start a team of one. */
export async function joinWithTeam(p: Phone, code: string) {
  await p.page.goto(`/trip/r/${code}`);
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

/**
 * Turn the waiting teams' quiz off in the lobby (on the host's phone), for a test about something else:
 * a question pops up over the top of the screen, and could cover what the test taps for real (the
 * quiz's own tests, quiz.spec.ts, cover that).
 */
export async function quizOff(host: Phone) {
  const box = host.page.getByRole("checkbox", { name: /城市抢答|City trivia/ });
  await box.uncheck();
  await expect(box).not.toBeChecked();
}

/**
 * No sideways scrolling, and every button in sight at least 44 px tall and inside the screen across.
 * `main` must also be whole on the screen: the one thing this screen asks for.
 */
export async function fits(p: Phone, label: string, main?: string) {
  // (a window or sheet still sliding in is measured once it's there: on its way it's scaled down a little)
  await p.page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming();
          const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
          return a.playState !== "running" || !Number.isFinite(Number(timing?.endTime)) || !target?.matches?.(".playwin, .sheet-bg, .sheet, .quizpop");
        }),
      null,
      { timeout: 3000 },
    )
    .catch(() => {});
  const r = await p.page.evaluate((main) => {
    const shown = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return false;
      return !el.closest('[aria-hidden="true"], [hidden], .playwin[data-open="0"], .settling, .ride');
    };
    const small: string[] = [];
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, .btn, summary, .seg button, [role=button]")) {
      if (!shown(el) || el.matches("input")) continue;
      const b = el.getBoundingClientRect();
      const name = `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)} (${el.className})`;
      // (its own size, as laid out: not as a moment of an animation draws it)
      const tall = el.offsetHeight || b.height;
      if (tall < 43.5) small.push(`${name} ${el.offsetWidth || Math.round(b.width)}x${tall}`);
      if (b.left < -1 || b.right > innerWidth + 1) out.push(`${name} at ${Math.round(b.left)}..${Math.round(b.right)} of ${innerWidth}`);
    }
    let whole: string | null = null;
    if (main) {
      const m = document.querySelector(main);
      if (m) {
        const b = m.getBoundingClientRect();
        if (b.top < 0 || b.bottom > innerHeight + 1 || b.left < 0 || b.right > innerWidth + 1) whole = `${main} at ${Math.round(b.top)}..${Math.round(b.bottom)} of ${innerHeight}`;
      }
    }
    return { wider: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, out, whole };
  }, main);
  expect(r.wider, `${p.name} ${label}: the page no wider than the phone`).toBeLessThanOrEqual(1);
  expect(r.small, `${p.name} ${label}: buttons at least 44 px tall`).toEqual([]);
  expect(r.out, `${p.name} ${label}: buttons inside the screen`).toEqual([]);
  expect(r.whole, `${p.name} ${label}: what it asks for is whole on the screen`).toBeNull();
}

export interface TapOptions {
  declineBuys?: boolean;
  /** Chance of bidding when an auction is open (0 = never). */
  bid?: number;
  /** Kinds of question to leave alone (the test answers them itself). */
  skip?: string[];
  /**
   * Say yes to Rio's dance. Left out, a team says no: the lesson is 45 s of the real game (the
   * countdown and the dance), too long for a test about something else (together.spec.ts dances).
   */
  dance?: boolean;
}

/**
 * Make whatever decision this phone's screen is asking for, by clicking the button a person
 * would most likely press. Done inside the page in one step, so it never races a re-render.
 */
export async function tap(p: Phone, o: TapOptions = {}): Promise<string | null> {
  if (p.page.isClosed()) return null;
  const res = await p.page
    .evaluate((o: TapOptions): [string | null, number] => {
      // The page must never be wider than the phone (it would push the tab bar off screen).
      const wide = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const kind = ((): string | null => {
      // A question that has just come up takes no taps for a moment, from a person or from us.
      if (document.querySelector(".settling")) return null;
      // Rio: this phone's team said it will dance, and the lesson waits for its Start.
      const go = document.querySelector<HTMLElement>(".samba-full.ready .haptic-btn:not(.off)");
      if (go) {
        go.click();
        return "dance-go";
      }
      const auction = document.querySelector(".decide.auction");
      if (auction) {
        const b = auction.querySelector<HTMLButtonElement>(".btn.primary:not([disabled]):not(.off)");
        if (b && Math.random() < (o.bid ?? 0.4)) {
          b.click();
          return "bid";
        }
        return null;
      }
      const panel = document.querySelector<HTMLElement>(".decide:not(.waiting)");
      if (!panel) return null;
      const kind = panel.dataset.kind ?? panel.className;
      if (o.skip?.includes(kind)) return null;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>(".btn:not([disabled]):not(.danger):not(.off)"));
      // (In debt with nothing left to sell, the only way on is a danger button: going broke, below.)
      if (!buttons.length && kind !== "debt") return null;
      let pick: HTMLButtonElement | undefined =
        panel.querySelector<HTMLButtonElement>(".btn.primary:not([disabled]):not(.off)") ??
        panel.querySelector<HTMLButtonElement>(".btn[data-default]:not([disabled]):not(.off)") ??
        buttons[0];
      if ((kind === "buy" && o.declineBuys) || (kind === "dance" && !o.dance)) pick = buttons.find((b) => !b.classList.contains("primary")) ?? pick;
      if (kind === "debt" && !panel.querySelector(".btn.primary:not([disabled]):not(.off)")) {
        // Can't pay yet: sell or mortgage something first (the debt panel lists them), else go broke.
        const sellable = panel.querySelector<HTMLButtonElement>(".assets .btn:not([disabled]):not(.off)");
        // Going broke takes two taps: the button, then "确定破产".
        if (sellable) pick = sellable;
        else pick = panel.querySelector<HTMLButtonElement>(".btn.danger") ?? pick;
      }
      if (!pick) return null;
      pick.click();
      return kind;
      })();
      return [kind, wide];
    }, o)
    .catch((): [null, number] => [null, 0]);
  const [kind, wide] = res;
  if (wide > 1 && !p.errors.some((e) => e.startsWith("page wider"))) p.errors.push(`page wider than the screen by ${wide}px`);
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
