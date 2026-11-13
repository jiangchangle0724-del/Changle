// Everything kept in D1 (the tables are in migrations/), read and written here and nowhere else.
//
// A change to an order is one transaction (db.batch): the order, its lines and the stock move
// together or not at all. Stock is the `sold` column of each item, with a rule in the table itself
// that it never passes `stock`: an order that would take more than is left fails as a whole.
// Every order carries a `rev` that goes up with each change; a change made from an older reading
// changes nothing and says so, and the caller reads again.
import type { MyOffer, MyShop } from "../api";
import type { NewOffer } from "../engine/offer";
import type { Before, Taken } from "../engine/order";
import type { NewShop } from "../engine/shop";
import type { DeliveryRule, Item, Offer, OfferBook, Order, OrderLine, PickupPoint, Shop } from "../engine/types";
import type { RosterEntry } from "../engine/view";

type Row = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

// ---------- a group buy and what's in it ----------

const shopOf = (r: Row): Shop => ({ id: text(r.id), slug: text(r.slug), name: text(r.name), kind: r.kind as Shop["kind"], about: text(r.about), contact: text(r.contact), pay: text(r.pay), permit: text(r.permit), status: r.status as Shop["status"] });
const itemOf = (r: Row): Item => ({
  id: text(r.id),
  section: text(r.section),
  name: text(r.name),
  detail: text(r.detail),
  photo: textOrNull(r.photo),
  price: num(r.price),
  unit: r.unit as Item["unit"],
  step: num(r.step),
  stock: numOrNull(r.stock),
  perBuyer: numOrNull(r.per_buyer),
  sold: num(r.sold),
  allergens: text(r.allergens),
});

export async function shopBySlug(db: D1Database, slug: string): Promise<Shop | null> {
  const row = await db.prepare("SELECT id, slug, name, kind, about, contact, pay, permit, status FROM shops WHERE slug = ?").bind(slug).first<Row>();
  return row ? shopOf(row) : null;
}

/** A group buy with its shop, goods, pickup points and delivery areas; null when there's no such group buy. */
export async function loadBook(db: D1Database, offerId: string): Promise<OfferBook | null> {
  const [offers, items, points, rules] = await db.batch<Row>([
    db
      .prepare(
        "SELECT f.id AS offer_id, f.title, f.note, f.status AS offer_status, f.closes_at, f.roster, s.id, s.slug, s.name, s.kind, s.about, s.contact, s.pay, s.permit, s.status FROM offers f JOIN shops s ON s.id = f.shop_id WHERE f.id = ?",
      )
      .bind(offerId),
    db.prepare("SELECT id, section, name, detail, photo, price, unit, step, stock, per_buyer, sold, allergens FROM items WHERE offer_id = ? ORDER BY pos").bind(offerId),
    db.prepare("SELECT id, name, address, hours FROM pickup_points WHERE offer_id = ? ORDER BY pos").bind(offerId),
    db.prepare("SELECT id, label, min_total, fee, hours FROM delivery_rules WHERE offer_id = ? ORDER BY pos").bind(offerId),
  ]);
  const row = offers.results[0];
  if (!row) return null;
  const shop = shopOf(row);
  const offer: Offer = { id: text(row.offer_id), shopId: shop.id, title: text(row.title), note: text(row.note), status: row.offer_status as Offer["status"], closesAt: num(row.closes_at), roster: row.roster as Offer["roster"] };
  return {
    shop,
    offer,
    items: items.results.map(itemOf),
    points: points.results.map((r): PickupPoint => ({ id: text(r.id), name: text(r.name), address: text(r.address), hours: text(r.hours) })),
    rules: rules.results.map((r): DeliveryRule => ({ id: text(r.id), label: text(r.label), min: num(r.min_total), fee: num(r.fee), hours: text(r.hours) })),
  };
}

// ---------- orders ----------

const ORDER_COLS = "code, offer_id, seq, name, phone, wechat, how, pickup_id, rule_id, address, note, status, paid_at, picked_at, goods, fee, final, pieces, rev, created_at, updated_at";
const LINE_COLS = "order_code, item_id, name, unit, price, qty, actual";

const lineOf = (r: Row): OrderLine => ({ itemId: text(r.item_id), name: text(r.name), unit: r.unit as OrderLine["unit"], price: num(r.price), qty: num(r.qty), actual: numOrNull(r.actual) });
const orderOf = (r: Row, lines: OrderLine[]): Order => ({
  code: text(r.code),
  offerId: text(r.offer_id),
  seq: num(r.seq),
  name: text(r.name),
  phone: text(r.phone),
  wechat: text(r.wechat),
  how: r.how as Order["how"],
  pickupId: textOrNull(r.pickup_id),
  ruleId: textOrNull(r.rule_id),
  address: text(r.address),
  note: text(r.note),
  status: r.status as Order["status"],
  paidAt: numOrNull(r.paid_at),
  pickedAt: numOrNull(r.picked_at),
  goods: num(r.goods),
  fee: num(r.fee),
  final: numOrNull(r.final),
  pieces: num(r.pieces),
  rev: num(r.rev),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
  lines,
});

function withLines(orders: Row[], lines: Row[]): Order[] {
  const byOrder = new Map<string, OrderLine[]>();
  for (const row of lines) {
    const code = text(row.order_code);
    let list = byOrder.get(code);
    if (!list) byOrder.set(code, (list = []));
    list.push(lineOf(row));
  }
  return orders.map((row) => orderOf(row, byOrder.get(text(row.code)) ?? []));
}

/** Every order of a group buy, cancelled ones too, in the order they came. */
export async function ordersOf(db: D1Database, offerId: string): Promise<Order[]> {
  const [orders, lines] = await db.batch<Row>([
    db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE offer_id = ? ORDER BY seq`).bind(offerId),
    db.prepare(`SELECT ${LINE_COLS} FROM order_items WHERE order_code IN (SELECT code FROM orders WHERE offer_id = ?) ORDER BY order_code, pos`).bind(offerId),
  ]);
  return withLines(orders.results, lines.results);
}

async function oneOrder(db: D1Database, where: string, ...binds: unknown[]): Promise<Order | null> {
  const [orders, lines] = await db.batch<Row>([
    db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT ${LINE_COLS} FROM order_items WHERE order_code IN (SELECT code FROM orders WHERE ${where}) ORDER BY pos`).bind(...binds),
  ]);
  return withLines(orders.results, lines.results)[0] ?? null;
}

export const orderByCode = (db: D1Database, code: string): Promise<Order | null> => oneOrder(db, "code = ?", code);
/** The order a phone already made with this key, if it did (the same order sent twice). */
export const orderByKey = (db: D1Database, offerId: string, key: string): Promise<Order | null> => oneOrder(db, "offer_id = ? AND client_key = ?", offerId, key);

/** The public list: the orders that stand, in the order they came. */
export async function rosterOf(db: D1Database, offerId: string): Promise<RosterEntry[]> {
  const rows = await db.prepare("SELECT seq, name, pieces FROM orders WHERE offer_id = ? AND status != 'cancelled' ORDER BY seq").bind(offerId).all<Row>();
  return rows.results.map((r) => ({ seq: num(r.seq), name: text(r.name), pieces: num(r.pieces) }));
}

/**
 * What one phone number already has standing in a group buy, leaving out one order (the one being
 * changed); and how many orders the group buy has ever taken. (No phone number: nothing standing.)
 */
export async function before(db: D1Database, offerId: string, phoneKey: string | null, except: string | null): Promise<{ had: Before; ever: number }> {
  const [count, items, last] = await db.batch<Row>([
    db.prepare("SELECT COUNT(*) AS n FROM orders WHERE offer_id = ?1 AND phone_key = ?2 AND status != 'cancelled' AND code != ?3").bind(offerId, phoneKey ?? "", except ?? ""),
    db
      .prepare(
        "SELECT oi.item_id, SUM(oi.qty) AS qty FROM order_items oi JOIN orders o ON o.code = oi.order_code WHERE o.offer_id = ?1 AND o.phone_key = ?2 AND o.status != 'cancelled' AND o.code != ?3 GROUP BY oi.item_id",
      )
      .bind(offerId, phoneKey ?? "", except ?? ""),
    db.prepare("SELECT COALESCE(MAX(seq), 0) AS ever FROM orders WHERE offer_id = ?").bind(offerId),
  ]);
  return { had: { orders: num(count.results[0]?.n), items: new Map(items.results.map((r) => [text(r.item_id), num(r.qty)])) }, ever: num(last.results[0]?.ever) };
}

/** The lines of an order as one JSON value, for the statements below. */
const linesJson = (taken: Taken): string => JSON.stringify(taken.lines);
const INSERT_LINES =
  "INSERT INTO order_items (order_code, item_id, pos, name, unit, price, qty) SELECT ?1, json_extract(j.value, '$.itemId'), j.key, json_extract(j.value, '$.name'), json_extract(j.value, '$.unit'), json_extract(j.value, '$.price'), json_extract(j.value, '$.qty') FROM json_each(?2) AS j";
/** Stock follows the order's lines: `+` takes what they hold off the shelf, `-` puts it back. */
const moveStock = (sign: "+" | "-") =>
  `UPDATE items SET sold = sold ${sign} (SELECT oi.qty FROM order_items oi WHERE oi.order_code = ?1 AND oi.item_id = items.id) WHERE id IN (SELECT item_id FROM order_items WHERE order_code = ?1)`;
/** The order is still as it was read: not changed since, and not cancelled. (`rev`: where the statement binds the reading's rev.) */
const asRead = (rev = "?2") => `EXISTS (SELECT 1 FROM orders WHERE code = ?1 AND rev = ${rev} AND status != 'cancelled')`;
const AS_READ = asRead();

/**
 * A transaction the tables themselves turned down (more than is left, the same order twice, a code
 * already taken): false, and nothing of it is kept. Anything else that goes wrong is an error.
 */
function refusedByTable(e: unknown): false {
  if (e instanceof Error && /constraint/i.test(e.message)) return false;
  throw e;
}

/**
 * Keep a new order. False when it didn't go in: something in it ran out a moment ago, the group
 * buy filled up, the same order arrived twice at once, or (once in a great while) its code was
 * taken. Nothing is kept then, and the caller reads again to say which.
 */
export async function insertOrder(db: D1Database, offerId: string, key: string, taken: Taken, code: string, most: number, now: number): Promise<boolean> {
  try {
    const done = await db.batch([
      db
        .prepare(
          `INSERT INTO orders (code, offer_id, seq, client_key, name, phone, phone_key, wechat, how, pickup_id, rule_id, address, note, status, goods, fee, final, pieces, rev, created_at, updated_at)
           SELECT ?1, ?2, COALESCE(MAX(seq), 0) + 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'new', ?13, ?14, ?15, ?16, 0, ?17, ?17 FROM orders WHERE offer_id = ?2 HAVING COALESCE(MAX(seq), 0) < ?18`,
        )
        .bind(code, offerId, key, taken.name, taken.phone, taken.phoneKey, taken.wechat, taken.how, taken.pickupId, taken.ruleId, taken.address, taken.note, taken.goods, taken.fee, taken.final, taken.pieces, now, most),
      db.prepare(`${INSERT_LINES} WHERE EXISTS (SELECT 1 FROM orders WHERE code = ?1)`).bind(code, linesJson(taken)),
      db.prepare(moveStock("+")).bind(code),
    ]);
    return done[0].meta.changes === 1;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** Put a buyer's changes in place of what the order held. False when the order changed in the meantime, or something ran out. */
export async function replaceOrder(db: D1Database, order: Order, taken: Taken, now: number): Promise<boolean> {
  try {
    const done = await db.batch([
      db.prepare(`${moveStock("-")} AND ${AS_READ}`).bind(order.code, order.rev),
      db.prepare(`DELETE FROM order_items WHERE order_code = ?1 AND ${AS_READ}`).bind(order.code, order.rev),
      db.prepare(`${INSERT_LINES} WHERE ${asRead("?3")}`).bind(order.code, linesJson(taken), order.rev),
      db.prepare(`${moveStock("+")} AND ${AS_READ}`).bind(order.code, order.rev),
      // (a changed order waits for the merchant to confirm it again)
      db
        .prepare(
          "UPDATE orders SET name = ?3, wechat = ?4, how = ?5, pickup_id = ?6, rule_id = ?7, address = ?8, note = ?9, status = 'new', goods = ?10, fee = ?11, final = ?12, pieces = ?13, rev = rev + 1, updated_at = ?14 WHERE code = ?1 AND rev = ?2 AND status != 'cancelled'",
        )
        .bind(order.code, order.rev, taken.name, taken.wechat, taken.how, taken.pickupId, taken.ruleId, taken.address, taken.note, taken.goods, taken.fee, taken.final, taken.pieces, now),
    ]);
    return done[4].meta.changes === 1;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** Cancel an order and put what it held back on the shelf. False when the order changed in the meantime. */
export async function cancelOrder(db: D1Database, order: Order, now: number): Promise<boolean> {
  const done = await db.batch([
    db.prepare(`${moveStock("-")} AND ${AS_READ}`).bind(order.code, order.rev),
    db.prepare("UPDATE orders SET status = 'cancelled', rev = rev + 1, updated_at = ?3 WHERE code = ?1 AND rev = ?2 AND status != 'cancelled'").bind(order.code, order.rev, now),
  ]);
  return done[1].meta.changes === 1;
}

/** A merchant's mark on an order that stands. False when the order changed in the meantime. */
export async function markOrder(db: D1Database, order: Order, mark: { status?: "confirmed"; paidAt?: number | null; pickedAt?: number | null }, now: number): Promise<boolean> {
  const done = await db
    .prepare("UPDATE orders SET status = ?3, paid_at = ?4, picked_at = ?5, rev = rev + 1, updated_at = ?6 WHERE code = ?1 AND rev = ?2 AND status != 'cancelled'")
    .bind(order.code, order.rev, mark.status ?? order.status, mark.paidAt === undefined ? order.paidAt : mark.paidAt, mark.pickedAt === undefined ? order.pickedAt : mark.pickedAt, now)
    .run();
  return done.meta.changes === 1;
}

/** What the scale said for some of an order's lines, and what the order comes to now (null while something still waits). False when the order changed in the meantime. */
export async function weighOrder(db: D1Database, order: Order, weights: { itemId: string; actual: number | null }[], final: number | null, now: number): Promise<boolean> {
  const done = await db.batch([
    db
      .prepare(
        `UPDATE order_items SET actual = (SELECT json_extract(j.value, '$.actual') FROM json_each(?3) AS j WHERE json_extract(j.value, '$.itemId') = order_items.item_id)
         WHERE order_code = ?1 AND item_id IN (SELECT json_extract(j.value, '$.itemId') FROM json_each(?3) AS j) AND ${AS_READ}`,
      )
      .bind(order.code, order.rev, JSON.stringify(weights)),
    db.prepare("UPDATE orders SET final = ?3, rev = rev + 1, updated_at = ?4 WHERE code = ?1 AND rev = ?2 AND status != 'cancelled'").bind(order.code, order.rev, final, now),
  ]);
  return done[1].meta.changes === 1;
}

// ---------- shops, and who runs them ----------

/** Make a shop, or change the one at this address; the accounts that run it are replaced by the ones given. */
export async function saveShop(db: D1Database, shop: NewShop, newId: string, now: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO shops (id, slug, name, kind, about, contact, pay, permit, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT (slug) DO UPDATE SET name = excluded.name, kind = excluded.kind, about = excluded.about, contact = excluded.contact, pay = excluded.pay, permit = excluded.permit, status = excluded.status`,
      )
      .bind(newId, shop.slug, shop.name, shop.kind, shop.about, shop.contact, shop.pay, shop.permit, shop.status, now),
    db.prepare("DELETE FROM shop_members WHERE shop_id = (SELECT id FROM shops WHERE slug = ?)").bind(shop.slug),
    db.prepare("INSERT INTO shop_members (shop_id, email, added_at) SELECT (SELECT id FROM shops WHERE slug = ?1), j.value, ?3 FROM json_each(?2) AS j").bind(shop.slug, JSON.stringify(shop.members), now),
  ]);
}

export async function isMember(db: D1Database, shopId: string, email: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS yes FROM shop_members WHERE shop_id = ? AND email = ?").bind(shopId, email).first()) !== null;
}

/** The shops an account runs (every shop, for the site's owner), each with its latest group buys. */
export async function shopsOf(db: D1Database, email: string, all: boolean): Promise<MyShop[]> {
  const shops = (
    await (all
      ? db.prepare("SELECT id, slug, name, kind, status FROM shops ORDER BY created_at DESC LIMIT 50")
      : db.prepare("SELECT id, slug, name, kind, status FROM shops WHERE id IN (SELECT shop_id FROM shop_members WHERE email = ?) ORDER BY created_at DESC LIMIT 50").bind(email)
    ).all<Row>()
  ).results;
  if (!shops.length) return [];
  const offers = await db.batch<Row>(
    shops.map((shop) =>
      db
        .prepare(
          `SELECT f.id, f.title, f.status, f.closes_at,
             (SELECT COUNT(*) FROM orders o WHERE o.offer_id = f.id AND o.status != 'cancelled') AS orders,
             (SELECT COUNT(*) FROM orders o WHERE o.offer_id = f.id AND o.status = 'new') AS fresh,
             (SELECT COALESCE(SUM(o.goods + o.fee), 0) FROM orders o WHERE o.offer_id = f.id AND o.status != 'cancelled') AS total
           FROM offers f WHERE f.shop_id = ? ORDER BY f.created_at DESC LIMIT 30`,
        )
        .bind(text(shop.id)),
    ),
  );
  return shops.map((shop, at) => ({
    slug: text(shop.slug),
    name: text(shop.name),
    kind: shop.kind as MyShop["kind"],
    status: shop.status as MyShop["status"],
    offers: offers[at].results.map((r): MyOffer => ({ id: text(r.id), title: text(r.title), status: r.status as MyOffer["status"], closesAt: num(r.closes_at), orders: num(r.orders), fresh: num(r.fresh), total: num(r.total) })),
  }));
}

// ---------- starting a group buy ----------

/** Keep a new group buy. `ids`: an id for the group buy, then one for each item, pickup point and delivery area. False when the group buy's id was taken. */
export async function insertOffer(db: D1Database, shopId: string, offer: NewOffer, id: string, newId: () => string, now: number): Promise<boolean> {
  const withIds = <T>(list: T[]) => JSON.stringify(list.map((one) => ({ ...one, id: newId() })));
  try {
    await db.batch([
      db.prepare("INSERT INTO offers (id, shop_id, title, note, status, closes_at, roster, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, shopId, offer.title, offer.note, offer.open ? "open" : "draft", offer.closesAt, offer.roster, now),
      db
        .prepare(
          `INSERT INTO items (id, offer_id, pos, section, name, detail, photo, price, unit, step, stock, per_buyer, allergens)
           SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.section'), json_extract(j.value, '$.name'), json_extract(j.value, '$.detail'), json_extract(j.value, '$.photo'),
             json_extract(j.value, '$.price'), json_extract(j.value, '$.unit'), json_extract(j.value, '$.step'), json_extract(j.value, '$.stock'), json_extract(j.value, '$.perBuyer'), json_extract(j.value, '$.allergens')
           FROM json_each(?2) AS j`,
        )
        .bind(id, withIds(offer.items)),
      db
        .prepare("INSERT INTO pickup_points (id, offer_id, pos, name, address, hours) SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.name'), json_extract(j.value, '$.address'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j")
        .bind(id, withIds(offer.points)),
      db
        .prepare(
          "INSERT INTO delivery_rules (id, offer_id, pos, label, min_total, fee, hours) SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.label'), json_extract(j.value, '$.min'), json_extract(j.value, '$.fee'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j",
        )
        .bind(id, withIds(offer.rules)),
    ]);
    return true;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** Open a group buy for orders, or close it. */
export async function setOfferStatus(db: D1Database, offerId: string, status: "open" | "closed"): Promise<void> {
  await db.prepare("UPDATE offers SET status = ? WHERE id = ?").bind(status, offerId).run();
}
