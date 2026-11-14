// What the phone-in-a-browser tests share: a shop and a group buy made through the API (as the
// owner's panel and a merchant's own pages do), the merchant's own view of it, a phone of its own
// (a browser context: its own storage), and catching what a page copies.
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { Made, MyOfferPage, OfferPage, OrderPage } from "../../src/api";
import { SESSION } from "../accounts.ts";
import { offerDoc } from "../sample.ts";

export const DAY = 86_400_000;
export const ORDER_URL = /\/tuan\/o\/[2-9A-HJKMNP-Z]{6}$/;
export const as = (session: string) => ({ authorization: `Bearer ${session}` });
export const word = () => Math.random().toString(36).slice(2, 10).replace(/[^a-z]/g, "x");

/** A shop of its own and a group buy in it, open for a day: tests/sample.ts, with `more` on top. The leader's account runs the shop. */
export async function start(request: APIRequestContext, more: Record<string, unknown> = {}): Promise<{ id: string; url: string; slug: string }> {
  const slug = `rice-${word()}`;
  const shop = await request.post("/tuan/api/admin/shops", { headers: as(SESSION.owner), data: { slug, name: "大米团（测试）", about: "每周一团，周五到货。", contact: "微信 rice-test", pay: "e-Transfer: pay@example.com\n备注里写订单号", members: ["leader@example.com"] } });
  expect(shop.status(), await shop.text()).toBe(200);
  const made = await request.post(`/tuan/api/my/shops/${slug}/offers`, { headers: as(SESSION.leader), data: { ...offerDoc(Date.now() + DAY), ...more } });
  expect(made.status(), await made.text()).toBe(201);
  const { id } = (await made.json()) as Made;
  return { id, url: `/tuan/t/${id}`, slug };
}

/** A shop with no group buy in it yet, run by the leader's account. Both engines use one database: each run's shop has a name of its own. */
export async function shopOnly(request: APIRequestContext): Promise<{ slug: string; name: string }> {
  const slug = `new-${word()}`;
  const name = `新开的小店 ${slug.slice(4)}`;
  const shop = await request.post("/tuan/api/admin/shops", { headers: as(SESSION.owner), data: { slug, name, contact: "微信 new-shop", pay: "e-Transfer: pay@example.com", members: ["leader@example.com"] } });
  expect(shop.status(), await shop.text()).toBe(200);
  return { slug, name };
}

/** Everything the merchant sees of a group buy. */
export const sheets = async (request: APIRequestContext, id: string) => (await (await request.get(`/tuan/api/my/offers/${id}`, { headers: as(SESSION.leader) })).json()) as MyOfferPage;

/** The group buy as anyone sees it. */
export const offerOf = async (request: APIRequestContext, id: string) => (await (await request.get(`/tuan/api/offers/${id}`)).json()) as OfferPage;

/** An order sent straight to the API, as a phone would: `lines` are [the start of an item's name, amount]. Picked up at the first point unless `more` says otherwise. */
export async function order(request: APIRequestContext, id: string, who: { name: string; phone: string }, lines: [string, number][], more: Record<string, unknown> = {}): Promise<OrderPage> {
  const offer = await offerOf(request, id);
  const item = (name: string) => offer.items.find((one) => one.name.startsWith(name))!.id;
  const sent = await request.post(`/tuan/api/offers/${id}/orders`, { data: { key: `${word()}${word()}${word()}`, ...who, how: "pickup", pickupId: offer.points[0].id, lines: lines.map(([name, qty]) => ({ itemId: item(name), qty })), ...more } });
  expect(sent.status(), await sent.text()).toBe(201);
  return (await sent.json()) as OrderPage;
}

const phones: BrowserContext[] = [];
/** Put away the phones a test used (each spec does, after every test): one browser serves the whole run, and it shouldn't end it holding dozens. */
export async function putAway(): Promise<void> {
  for (const context of phones.splice(0)) await context.close();
}

/** A phone of its own. `session`: signed in at changle.ca with that account (the site keeps the sign-in in the phone's storage). */
export async function phone(browser: Browser, options: Parameters<Browser["newContext"]>[0] & { session?: string } = {}): Promise<Page> {
  const { session, ...rest } = options;
  const context = await browser.newContext(rest);
  phones.push(context);
  if (session) await context.addInitScript((token) => localStorage.setItem("changle.session", token), session);
  return context.newPage();
}

/** Keep what this page copies where the test can read it. (Reading the real clipboard needs a permission only Chromium can grant.) */
export const catchCopies = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void ((window as unknown as { copied: string }).copied = text) } });
  });
export const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);

/**
 * Every button, link and field in sight is at least 44 by 44 (a choice's whole row counts for its
 * radio), and nothing reaches past the screen's edges (but the section chips, which scroll
 * sideways inside their own strip).
 */
export async function fits(page: Page, where: string): Promise<void> {
  const found = await page.evaluate(() => {
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 20)}"`;
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a, button, input, textarea, select")) {
      const target = el.matches('input[type="radio"]') ? (el.closest("label") ?? el) : el;
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 43.5 || box.height < 43.5) small.push(`${name(el)} ${Math.round(box.width)}×${Math.round(box.height)}`);
    }
    const wide: string[] = [];
    for (const el of document.querySelectorAll("#app *")) {
      if (el.closest(".tabs") && !el.matches(".tabs")) continue;
      const box = el.getBoundingClientRect();
      if (box.left < -0.5 || box.right > window.innerWidth + 0.5) wide.push(`${name(el)} ${Math.round(box.left)}…${Math.round(box.right)}`);
    }
    return { small, wide, page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth };
  });
  expect(found.small, `${where}: too small to tap`).toEqual([]);
  expect(found.wide, `${where}: past the screen's edge`).toEqual([]);
  expect(found.page, `${where}: the page is wider than the screen`).toBeLessThanOrEqual(0);
}
