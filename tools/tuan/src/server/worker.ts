// 跟一单 · Count Me In: the server. One Worker at changle.ca/tuan, with its own D1 database.
// The pages come next; for now it answers the API (the shapes are in src/api.ts).
//
// Anyone, no sign-in:
//   GET  /tuan/api/offers/<id>                a group buy: the goods, what's left, who's in
//   POST /tuan/api/offers/<id>/orders         place an order
//   GET  /tuan/api/orders/<code>              the buyer's own order (the phone number's last four digits in the x-tail header)
//   POST /tuan/api/orders/<code>              the buyer changes it (x-tail), while the group buy is open
//   POST /tuan/api/orders/<code>/cancel       the buyer cancels it (x-tail), while the group buy is open
// A merchant, signed in with their changle.ca account (src/server/who.ts):
//   GET  /tuan/api/my                         their shops and group buys
//   POST /tuan/api/my/shops/<slug>/offers     start a group buy
//   GET  /tuan/api/my/offers/<id>             every order in it, and the sheets (src/engine/summary.ts)
//   POST /tuan/api/my/offers/<id>             open it, close it
//   POST /tuan/api/my/orders/<code>           confirm, mark paid or handed over, cancel, weigh
// The site's owner:
//   POST /tuan/api/admin/shops                set a shop up, or change one
import { TAIL_HEADER, type ApiError, type ApiErrorCode, type Made, type Me, type Moved, type MyHome, type MyOfferPage, type OfferPage, type OrderPage } from "../api";
import { BASE } from "../base";
import { makeCode, OFFER_LENGTH, OFFER_RE, ORDER_LENGTH, ORDER_RE, SLUG_RE, tidyOrderCode } from "../engine/ids";
import { finalGoods, MILLI } from "../engine/money";
import { readOffer } from "../engine/offer";
import { isOpen, KEY_RE, LINES_MAX, ORDERS_MAX, takeOrder, without, type Refused } from "../engine/order";
import { phoneDigits, phoneKey, TAIL_RE, tailOf } from "../engine/phone";
import { readShop } from "../engine/shop";
import { summarize } from "../engine/summary";
import { weighed, type OfferBook, type Order } from "../engine/types";
import { offerPage, orderPage } from "../engine/view";
import { bump, networkOf, used } from "./gate";
import { ensureSchema } from "./schema";
import { before, cancelOrder, insertOffer, insertOrder, isMember, loadBook, markOrder, orderByCode, orderByKey, ordersOf, replaceOrder, rosterOf, saveShop, setOfferStatus, shopBySlug, shopsOf, weighOrder } from "./store";
import { tokenOf, whoIs, type Who } from "./who";

/** The most an order's body may be, and a whole group buy's. */
const ORDER_BODY_MAX = 16_000;
const OFFER_BODY_MAX = 200_000;
/** What one network may do in a day: orders sent, wrong tries at orders, sessions that are nobody's. */
const ORDERS_PER_NETWORK = 300;
const WRONG_PER_NETWORK = 30;
const SIGNINS_PER_NETWORK = 60;
/** Wrong tries at one order in a day, from anywhere, before it stops answering until tomorrow. */
const WRONG_PER_ORDER = 30;
/** The most a weighed line may turn out to be: 999 lb. */
const WEIGHT_MAX = 999 * MILLI;

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });

const STATUS: Record<ApiErrorCode, number> = {
  // not something this API takes
  bad: 400, name: 400, phone: 400, empty: 400, item: 400, qty: 400, how: 400, address: 400, min: 400,
  title: 400, closes: 400, items: 400, places: 400, place: 400, slug: 400, members: 400,
  signin: 401,
  forbidden: 403,
  notfound: 404,
  // fine as a request, but not as things stand
  closed: 409, soldout: 409, perbuyer: 409, many: 409, full: 409, paid: 409, cancelled: 409, busy: 409,
  limit: 429, locked: 429,
  failed: 500,
  down: 503,
};
const refuse = (error: ApiErrorCode, more: Omit<ApiError, "error"> = {}) => json({ error, ...more } satisfies ApiError, STATUS[error]);
const refused = ({ error, items, min }: Refused) => refuse(error, { ...(items ? { items } : {}), ...(min === undefined ? {} : { min }) });

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** A JSON object sent as JSON (which another site's page can't send here), or null. */
async function body(req: Request, max: number): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  const sent = await req.text();
  if (sent.length > max) return null;
  try {
    const value: unknown = JSON.parse(sent);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A part of an address as it was typed ("K7M 2PQ" arrives as "K7M%202PQ"). */
function unescaped(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Sent by one of this site's own pages (or by no page at all: a browser always says which page is sending). */
function sameSite(req: Request, url: URL): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

/** A group buy the public may see: drafts are their merchant's alone. */
async function publicBook(db: D1Database, offerId: string): Promise<OfferBook | null> {
  const book = await loadBook(db, offerId);
  return book && book.offer.status !== "draft" ? book : null;
}

// ---------- buyers ----------

async function seeOffer(db: D1Database, offerId: string, now: number): Promise<Response> {
  const book = await publicBook(db, offerId);
  if (!book) return refuse("notfound");
  return json(offerPage(book, await rosterOf(db, offerId), now) satisfies OfferPage);
}

async function placeOrder(req: Request, db: D1Database, offerId: string, now: number): Promise<Response> {
  const input = await body(req, ORDER_BODY_MAX);
  if (!input || typeof input.key !== "string" || !KEY_RE.test(input.key)) return refuse("bad");
  if ((await bump(db, `order:${await networkOf(req)}`, now)) > ORDERS_PER_NETWORK) return refuse("limit");
  const phone = phoneDigits(input.phone);

  for (let tries = 0; tries < 3; tries++) {
    const book = await publicBook(db, offerId);
    if (!book) return refuse("notfound");
    // the same order, sent again (a weak signal, a second tap): it's already in
    const again = await orderByKey(db, offerId, input.key);
    if (again) return json(orderPage(book, again, now) satisfies OrderPage);

    const { had, ever } = await before(db, offerId, phone && phoneKey(phone), null);
    const taken = takeOrder(input, book, now, had);
    if (!taken.ok) return refused(taken);
    if (ever >= ORDERS_MAX) return refuse("full");

    const code = makeCode(rand, ORDER_LENGTH);
    if (await insertOrder(db, offerId, input.key, taken, code, ORDERS_MAX, now)) {
      const order = await orderByCode(db, code);
      if (order) return json(orderPage(book, order, now) satisfies OrderPage, 201);
    }
    // it didn't go in (something ran out a moment ago, or it arrived twice at once): read again and say which
  }
  return refuse("busy");
}

/**
 * A buyer's own order: its code and the last four digits of the phone number it was placed with.
 * A wrong code and a wrong number are answered alike. Wrong tries are counted, for the network
 * they come from and for the order they're aimed at.
 */
async function findMine(req: Request, db: D1Database, codeText: string, now: number): Promise<{ book: OfferBook; order: Order } | Response> {
  const network = `find:${await networkOf(req)}`;
  if ((await used(db, network, now)) >= WRONG_PER_NETWORK) return refuse("limit");
  const code = tidyOrderCode(codeText);
  const order = ORDER_RE.test(code) ? await orderByCode(db, code) : null;
  if (order && (await used(db, `tail:${order.code}`, now)) >= WRONG_PER_ORDER) return refuse("locked");
  const tail = req.headers.get(TAIL_HEADER) ?? "";
  if (!order || !TAIL_RE.test(tail) || tail !== tailOf(order.phone)) {
    await bump(db, network, now);
    if (order) await bump(db, `tail:${order.code}`, now);
    return refuse("notfound");
  }
  const book = await loadBook(db, order.offerId);
  return book ? { book, order } : refuse("notfound");
}

/** Why a buyer may not change or cancel their order themselves, or null when they may. */
function shut(book: OfferBook, order: Order, now: number): ApiErrorCode | null {
  if (order.status === "cancelled") return "cancelled";
  if (order.paidAt !== null || order.pickedAt !== null) return "paid";
  return isOpen(book, now) ? null : "closed";
}

async function reread(db: D1Database, order: Order): Promise<{ book: OfferBook; order: Order } | null> {
  const [book, fresh] = await Promise.all([loadBook(db, order.offerId), orderByCode(db, order.code)]);
  return book && fresh ? { book, order: fresh } : null;
}

async function seeOrder(req: Request, db: D1Database, code: string, now: number): Promise<Response> {
  const found = await findMine(req, db, code, now);
  return found instanceof Response ? found : json(orderPage(found.book, found.order, now) satisfies OrderPage);
}

async function changeOrder(req: Request, db: D1Database, code: string, now: number): Promise<Response> {
  const input = await body(req, ORDER_BODY_MAX);
  if (!input) return refuse("bad");
  const found = await findMine(req, db, code, now);
  if (found instanceof Response) return found;
  let at: { book: OfferBook; order: Order } | null = found;
  for (let tries = 0; at && tries < 2; tries++) {
    const { book, order } = at;
    const why = shut(book, order, now);
    if (why) return refuse(why);
    const { had } = await before(db, order.offerId, phoneKey(order.phone), order.code);
    // taken again, against the group buy as it would stand without this order; the phone number stays
    const taken = takeOrder({ ...input, phone: order.phone }, without(book, order), now, had);
    if (!taken.ok) return refused(taken);
    if (await replaceOrder(db, order, taken, now)) {
      const fresh = await orderByCode(db, order.code);
      if (fresh) return json(orderPage(book, fresh, now) satisfies OrderPage);
    }
    at = await reread(db, order);
  }
  return at ? refuse("busy") : refuse("notfound");
}

async function cancelMine(req: Request, db: D1Database, code: string, now: number): Promise<Response> {
  const found = await findMine(req, db, code, now);
  if (found instanceof Response) return found;
  let at: { book: OfferBook; order: Order } | null = found;
  for (let tries = 0; at && tries < 2; tries++) {
    const { book, order } = at;
    if (order.status === "cancelled") return json(orderPage(book, order, now) satisfies OrderPage);
    const why = shut(book, order, now);
    if (why) return refuse(why);
    const done = await cancelOrder(db, order, now);
    at = await reread(db, order);
    if (done && at) return json(orderPage(at.book, at.order, now) satisfies OrderPage);
  }
  return at ? refuse("busy") : refuse("notfound");
}

// ---------- merchants ----------

async function signedIn(req: Request, env: Env, ctx: ExecutionContext | undefined, now: number): Promise<Who | Response> {
  const token = tokenOf(req);
  if (!token) return refuse("signin");
  const network = `signin:${await networkOf(req)}`;
  const asked = await whoIs(token, env, ctx, async () => (await used(env.DB, network, now)) < SIGNINS_PER_NETWORK);
  if (asked.ok) return asked.who;
  if (asked.error === "signin") await bump(env.DB, network, now);
  return refuse(asked.error);
}

/** May this account look after this shop? Those who run it, and the site's owner. */
const runs = async (db: D1Database, who: Who, shopId: string): Promise<boolean> => who.owner || (await isMember(db, shopId, who.email));

async function myOffer(db: D1Database, who: Who, offerId: string, now: number): Promise<Response> {
  const book = await loadBook(db, offerId);
  if (!book) return refuse("notfound");
  if (!(await runs(db, who, book.shop.id))) return refuse("forbidden");
  const orders = await ordersOf(db, offerId);
  return json({ ...book, orders, summary: summarize(book, orders), now } satisfies MyOfferPage);
}

async function startOffer(req: Request, db: D1Database, who: Who, slug: string, now: number): Promise<Response> {
  const shop = await shopBySlug(db, slug);
  if (!shop) return refuse("notfound");
  if (!(await runs(db, who, shop.id))) return refuse("forbidden");
  const read = readOffer(await body(req, OFFER_BODY_MAX), now);
  if (!read.ok) return refuse(read.error, read.at === undefined ? {} : { at: read.at });
  for (let tries = 0; tries < 3; tries++) {
    const id = makeCode(rand, OFFER_LENGTH, true);
    if (await insertOffer(db, shop.id, read.offer, id, () => makeCode(rand, 10, true), now)) return json({ id } satisfies Made, 201);
  }
  return refuse("failed");
}

async function moveOffer(req: Request, db: D1Database, who: Who, offerId: string, now: number): Promise<Response> {
  const input = await body(req, ORDER_BODY_MAX);
  if (!input || (input.do !== "open" && input.do !== "close")) return refuse("bad");
  const book = await loadBook(db, offerId);
  if (!book) return refuse("notfound");
  if (!(await runs(db, who, book.shop.id))) return refuse("forbidden");
  await setOfferStatus(db, offerId, input.do === "open" ? "open" : "closed");
  return myOffer(db, who, offerId, now);
}

/** What the scale said, checked against the order: only its weighed lines, each once. Null when it isn't that. */
function readWeights(input: unknown, order: Order): { itemId: string; actual: number | null }[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > LINES_MAX) return null;
  const mine = new Map(order.lines.filter((line) => weighed(line.unit)).map((line) => [line.itemId, line]));
  const seen = new Set<string>();
  const weights: { itemId: string; actual: number | null }[] = [];
  for (const one of input as unknown[]) {
    if (!one || typeof one !== "object") return null;
    const { itemId, actual } = one as Record<string, unknown>;
    if (typeof itemId !== "string" || !mine.has(itemId) || seen.has(itemId)) return null;
    if (actual !== null && (typeof actual !== "number" || !Number.isInteger(actual) || actual < 0 || actual > WEIGHT_MAX)) return null;
    seen.add(itemId);
    weights.push({ itemId, actual });
  }
  return weights;
}

async function moveOrder(req: Request, db: D1Database, who: Who, codeText: string, now: number): Promise<Response> {
  const input = await body(req, ORDER_BODY_MAX);
  if (!input) return refuse("bad");
  const code = tidyOrderCode(codeText);
  if (!ORDER_RE.test(code)) return refuse("notfound");

  for (let tries = 0; tries < 2; tries++) {
    const order = await orderByCode(db, code);
    const book = order && (await loadBook(db, order.offerId));
    // (someone else's order and no order at all are answered alike: a code isn't confirmed to anyone but its shop)
    if (!order || !book || !(await runs(db, who, book.shop.id))) return refuse("notfound");
    const done = () => json({ order } satisfies Moved);

    let ok: boolean;
    if (input.do === "cancel") {
      if (order.status === "cancelled") return done();
      ok = await cancelOrder(db, order, now);
    } else if (order.status === "cancelled") {
      return refuse("cancelled");
    } else if (input.do === "confirm") {
      if (order.status === "confirmed") return done();
      ok = await markOrder(db, order, { status: "confirmed" }, now);
    } else if (input.do === "paid" && typeof input.on === "boolean") {
      if ((order.paidAt !== null) === input.on) return done();
      ok = await markOrder(db, order, { paidAt: input.on ? now : null }, now);
    } else if (input.do === "picked" && typeof input.on === "boolean") {
      if ((order.pickedAt !== null) === input.on) return done();
      ok = await markOrder(db, order, { pickedAt: input.on ? now : null }, now);
    } else if (input.do === "weigh") {
      const weights = readWeights(input.lines, order);
      if (!weights) return refuse("bad");
      const said = new Map(weights.map((w) => [w.itemId, w.actual]));
      const goods = finalGoods(order.lines.map((line) => (said.has(line.itemId) ? { ...line, actual: said.get(line.itemId) ?? null } : line)));
      ok = await weighOrder(db, order, weights, goods === null ? null : goods + order.fee, now);
    } else {
      return refuse("bad");
    }
    if (ok) {
      const fresh = await orderByCode(db, code);
      if (fresh) return json({ order: fresh } satisfies Moved);
    }
    // it changed while this was on its way: once more, from what it is now
  }
  return refuse("busy");
}

// ---------- the site's owner ----------

async function makeShop(req: Request, db: D1Database, now: number): Promise<Response> {
  const read = readShop(await body(req, ORDER_BODY_MAX));
  if (!read.ok) return refuse(read.error);
  await saveShop(db, read.shop, `s${makeCode(rand, 10, true)}`, now);
  return json({ id: read.shop.slug } satisfies Made);
}

// ---------- the way in ----------

async function api(req: Request, env: Env, ctx: ExecutionContext | undefined, url: URL, parts: string[]): Promise<Response> {
  const get = req.method === "GET";
  const post = req.method === "POST";
  if (!get && !post) return refuse("notfound");
  // a page on another site doesn't get to send anything here
  if (post && !sameSite(req, url)) return refuse("forbidden");

  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now();
  const [a, b, c, d] = parts;
  const n = parts.length;

  if (a === "offers" && OFFER_RE.test(b ?? "")) {
    if (n === 2 && get) return seeOffer(db, b, now);
    if (n === 3 && c === "orders" && post) return placeOrder(req, db, b, now);
  }
  if (a === "orders" && b) {
    if (n === 2 && get) return seeOrder(req, db, b, now);
    if (n === 2 && post) return changeOrder(req, db, b, now);
    if (n === 3 && c === "cancel" && post) return cancelMine(req, db, b, now);
  }
  if (a === "my" || a === "admin") {
    const who = await signedIn(req, env, ctx, now);
    if (who instanceof Response) return who;
    if (a === "admin") {
      if (!who.owner) return refuse("forbidden");
      if (n === 2 && b === "shops" && post) return makeShop(req, db, now);
      return refuse("notfound");
    }
    if (n === 1 && get) return json({ me: { name: who.name, email: who.email, owner: who.owner } satisfies Me, shops: await shopsOf(db, who.email, who.owner), now } satisfies MyHome);
    if (n === 4 && b === "shops" && SLUG_RE.test(c ?? "") && d === "offers" && post) return startOffer(req, db, who, c, now);
    if (n === 3 && b === "offers" && OFFER_RE.test(c ?? "")) {
      if (get) return myOffer(db, who, c, now);
      if (post) return moveOffer(req, db, who, c, now);
    }
    if (n === 3 && b === "orders" && post) return moveOrder(req, db, who, c, now);
  }
  return refuse("notfound");
}

export default {
  // (ctx is optional for the tests, which call fetch without one)
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname === BASE || url.pathname.startsWith(`${BASE}/`) ? url.pathname.slice(BASE.length).split("/").filter(Boolean).map(unescaped) : [];
    // the pages aren't built yet: nothing but the API answers
    if (parts[0] !== "api") return new Response("not found", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    try {
      return await api(req, env, ctx, url, parts.slice(1));
    } catch (e) {
      console.error("tuan", req.method, url.pathname, e);
      return refuse("failed");
    }
  },
} satisfies ExportedHandler<Env>;
