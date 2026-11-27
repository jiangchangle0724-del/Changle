// Everything kept in D1 (the tables are in migrations/), read and written here and nowhere else.
//
// A change to an order is one transaction (db.batch): the order, its lines and the stock move
// together or not at all. Stock is the `sold` column of each item, with a rule in the table itself
// that it never passes `stock`: an order that would take more than is left fails as a whole.
// Every order carries a `rev` that goes up with each change; a change made from an older reading
// changes nothing and says so, and the caller reads again.
import type { Application, ApplicationState, HomeOffer, HomeShop, MyOffer, MyShop } from "../api";
import { DECLARATION, type Decision, type NewApplication } from "../engine/apply";
import type { Edit, Used } from "../engine/edit";
import { PHOTO_RE } from "../engine/ids";
import type { NewOffer } from "../engine/offer";
import type { Before, Taken } from "../engine/order";
import type { NewShop, ShopWords } from "../engine/shop";
import { weighed, type Arrived, type DeliveryRule, type Item, type Offer, type OfferBook, type OfferStatus, type Order, type OrderLine, type PickupPoint, type Roster, type Shop, type ShopKind, type Unit } from "../engine/types";
import type { RosterEntry } from "../engine/view";

type Row = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

// ---------- a group buy and what's in it ----------

const shopOf = (r: Row): Shop => ({ id: text(r.id), slug: text(r.slug), name: text(r.name), kind: r.kind as Shop["kind"], about: text(r.about), contact: text(r.contact), pay: text(r.pay), permit: text(r.permit), status: r.status as Shop["status"] });
/** The merchant's word that the goods are in, as a group buy's row keeps it. */
const arrivedOf = (r: Row): Arrived | null => (r.arrived_at === null || r.arrived_at === undefined ? null : { at: num(r.arrived_at), note: text(r.arrived_note) });
const itemOf = (r: Row): Item => ({
  id: text(r.id),
  section: text(r.section),
  name: text(r.name),
  detail: text(r.detail),
  photo: textOrNull(r.photo),
  price: num(r.price),
  unit: r.unit as Item["unit"],
  step: num(r.step),
  least: num(r.least),
  stock: numOrNull(r.stock),
  perBuyer: numOrNull(r.per_buyer),
  case: numOrNull(r.case_qty),
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
        "SELECT f.id AS offer_id, f.title, f.note, f.status AS offer_status, f.closes_at, f.roster, f.arrived_at, f.arrived_note, s.id, s.slug, s.name, s.kind, s.about, s.contact, s.pay, s.permit, s.status FROM offers f JOIN shops s ON s.id = f.shop_id WHERE f.id = ?",
      )
      .bind(offerId),
    db.prepare("SELECT id, section, name, detail, photo, price, unit, step, least, stock, per_buyer, case_qty, sold, allergens FROM items WHERE offer_id = ? ORDER BY pos").bind(offerId),
    db.prepare("SELECT id, name, address, hours FROM pickup_points WHERE offer_id = ? ORDER BY pos").bind(offerId),
    db.prepare("SELECT id, label, min_total, fee, free_from, hours FROM delivery_rules WHERE offer_id = ? ORDER BY pos").bind(offerId),
  ]);
  const row = offers.results[0];
  if (!row) return null;
  const shop = shopOf(row);
  const offer: Offer = { id: text(row.offer_id), shopId: shop.id, title: text(row.title), note: text(row.note), status: row.offer_status as Offer["status"], closesAt: num(row.closes_at), roster: row.roster as Offer["roster"], arrived: arrivedOf(row) };
  return {
    shop,
    offer,
    items: items.results.map(itemOf),
    points: points.results.map((r): PickupPoint => ({ id: text(r.id), name: text(r.name), address: text(r.address), hours: text(r.hours) })),
    rules: rules.results.map((r): DeliveryRule => ({ id: text(r.id), label: text(r.label), min: num(r.min_total), fee: num(r.fee), freeFrom: numOrNull(r.free_from), hours: text(r.hours) })),
  };
}

/** A group buy's name and its shop's, for its page's title; null when there's none the public may see. */
/** A group buy's title and its shop's name, for its page's title: not a draft, and its shop let in. */
export async function offerHead(db: D1Database, offerId: string): Promise<{ title: string; shop: string; goods: string[]; photo: string | null } | null> {
  const row = await db.prepare("SELECT f.title, s.name FROM offers f JOIN shops s ON s.id = f.shop_id WHERE f.id = ? AND f.status != 'draft' AND s.status != 'pending'").bind(offerId).first<Row>();
  if (!row) return null;
  // (for the card a shared link becomes: the first few goods, and the first picture)
  const { results } = await db.prepare("SELECT name, photo FROM items WHERE offer_id = ? ORDER BY pos LIMIT 7").bind(offerId).all<Row>();
  return { title: text(row.title), shop: text(row.name), goods: results.map((item) => text(item.name)), photo: results.map((item) => item.photo).find((photo): photo is string => typeof photo === "string" && PHOTO_RE.test(photo)) ?? null };
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

// ---------- telling the merchant (src/server/notify.ts) ----------

/** When a notice last went out for a group buy (0: never), or null when there's no such group buy. */
export async function mailedAt(db: D1Database, offerId: string): Promise<number | null> {
  const row = await db.prepare("SELECT mailed_at FROM offers WHERE id = ?").bind(offerId).first<{ mailed_at: number }>();
  return row ? row.mailed_at : null;
}

/**
 * The standing orders of a group buy its merchant hasn't been told of: the first `limit` of them
 * (oldest first), how many there are, the place in line of the last one, and how many orders stand.
 */
export async function unnoticed(db: D1Database, offerId: string, limit: number): Promise<{ orders: Order[]; count: number; last: number; standing: number }> {
  const fresh = "offer_id = ?1 AND noticed = 0 AND status != 'cancelled' ORDER BY seq LIMIT ?2";
  const [orders, lines, counts] = await db.batch<Row>([
    db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE ${fresh}`).bind(offerId, limit),
    db.prepare(`SELECT ${LINE_COLS} FROM order_items WHERE order_code IN (SELECT code FROM orders WHERE ${fresh}) ORDER BY order_code, pos`).bind(offerId, limit),
    db.prepare("SELECT COUNT(*) FILTER (WHERE noticed = 0) AS fresh, COALESCE(MAX(seq) FILTER (WHERE noticed = 0), 0) AS last, COUNT(*) AS standing FROM orders WHERE offer_id = ? AND status != 'cancelled'").bind(offerId),
  ]);
  const c = counts.results[0];
  return { orders: withLines(orders.results, lines.results), count: num(c?.fresh), last: num(c?.last), standing: num(c?.standing) };
}

/** The merchant has been told of a group buy's orders: those up to a place in line, or (null) all of them. */
export async function markNoticed(db: D1Database, offerId: string, upTo: number | null): Promise<void> {
  await db.prepare("UPDATE orders SET noticed = 1 WHERE offer_id = ?1 AND noticed = 0 AND (?2 IS NULL OR seq <= ?2)").bind(offerId, upTo).run();
}

/** Take the group buy's turn to send a notice: true for one caller only, when two get here together. */
export async function claimNotice(db: D1Database, offerId: string, seen: number, now: number): Promise<boolean> {
  return (await db.prepare("UPDATE offers SET mailed_at = ?3 WHERE id = ?1 AND mailed_at = ?2").bind(offerId, seen, now).run()).meta.changes === 1;
}

/** Give the turn back: nothing went out. */
export async function unclaimNotice(db: D1Database, offerId: string, now: number, seen: number): Promise<void> {
  await db.prepare("UPDATE offers SET mailed_at = ?3 WHERE id = ?1 AND mailed_at = ?2").bind(offerId, now, seen).run();
}

/** The first accounts that run a shop, by email, in the order the owner listed them. */
export async function membersOf(db: D1Database, shopId: string, limit: number): Promise<string[]> {
  return (await db.prepare("SELECT email FROM shop_members WHERE shop_id = ? ORDER BY rowid LIMIT ?").bind(shopId, limit).all<{ email: string }>()).results.map((r) => r.email);
}

/** Group buys with orders their merchant hasn't been told of, and no notice since `before`. */
export async function waitingOffers(db: D1Database, before: number, limit: number): Promise<string[]> {
  const rows = await db
    .prepare("SELECT f.id FROM offers f WHERE f.mailed_at <= ?1 AND EXISTS (SELECT 1 FROM orders o WHERE o.offer_id = f.id AND o.noticed = 0 AND o.status != 'cancelled') ORDER BY f.mailed_at LIMIT ?2")
    .bind(before, limit)
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
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

/** Change what a shop says about itself (src/engine/shop.ts, readShopWords). */
export async function saveShopWords(db: D1Database, shopId: string, words: ShopWords): Promise<void> {
  await db
    .prepare("UPDATE shops SET name = ?2, kind = ?3, about = ?4, contact = ?5, pay = ?6, permit = ?7 WHERE id = ?1")
    .bind(shopId, words.name, words.kind, words.about, words.contact, words.pay, words.permit)
    .run();
}

/** Whether a shop is shown on the tool's home: its own people choose (shown unless they say not). */
export async function shopListed(db: D1Database, shopId: string): Promise<boolean> {
  const row = await db.prepare("SELECT listed FROM shops WHERE id = ?").bind(shopId).first<Row>();
  return num(row?.listed ?? 1) === 1;
}

export async function setShopListed(db: D1Database, shopId: string, listed: boolean): Promise<void> {
  await db.prepare("UPDATE shops SET listed = ? WHERE id = ?").bind(listed ? 1 : 0, shopId).run();
}

/**
 * The tool's home: the group buys open now at live shops that are shown there, soonest to close
 * first (40 at most), each with what its card says; and those shops, newest first (60 at most).
 * Only what the group buys' and shops' own pages show already.
 */
export async function homeBook(db: D1Database, now: number): Promise<{ offers: HomeOffer[]; shops: HomeShop[] }> {
  const rows = (await db.prepare("SELECT f.id, f.title, f.closes_at, f.roster, s.slug, s.name, s.kind FROM offers f JOIN shops s ON s.id = f.shop_id WHERE f.status = 'open' AND f.closes_at > ? AND s.status = 'live' AND s.listed = 1 ORDER BY f.closes_at LIMIT 40").bind(now).all<Row>()).results;
  const shopRows = (await db.prepare("SELECT slug, name, kind, about FROM shops WHERE status = 'live' AND listed = 1 ORDER BY created_at DESC LIMIT 60").all<Row>()).results;
  const open = new Map<string, number>();
  for (const row of rows) open.set(text(row.slug), (open.get(text(row.slug)) ?? 0) + 1);
  const shops = shopRows.map((row) => ({ slug: text(row.slug), name: text(row.name), kind: row.kind as ShopKind, about: text(row.about), open: open.get(text(row.slug)) ?? 0 }));
  if (!rows.length) return { offers: [], shops };

  const ids = rows.map((row) => text(row.id));
  const marks = ids.map(() => "?").join(", ");
  const [items, points, rules, orders] = await db.batch<Row>([
    db.prepare(`SELECT offer_id, name, unit, photo FROM items WHERE offer_id IN (${marks}) ORDER BY offer_id, pos`).bind(...ids),
    db.prepare(`SELECT offer_id, COUNT(*) AS n FROM pickup_points WHERE offer_id IN (${marks}) GROUP BY offer_id`).bind(...ids),
    db.prepare(`SELECT offer_id, label, free_from FROM delivery_rules WHERE offer_id IN (${marks}) ORDER BY offer_id, pos`).bind(...ids),
    db.prepare(`SELECT offer_id, COUNT(*) AS n FROM orders WHERE offer_id IN (${marks}) AND status != 'cancelled' GROUP BY offer_id`).bind(...ids),
  ]);
  const of = <T>(list: Row[], id: string, pick: (row: Row) => T): T[] => list.filter((row) => row.offer_id === id).map(pick);
  const offers = rows.map((row): HomeOffer => {
    const id = text(row.id);
    const goods = of(items.results, id, (item) => ({ name: text(item.name), unit: item.unit as Unit, photo: typeof item.photo === "string" && PHOTO_RE.test(item.photo) ? item.photo : null }));
    const areas = of(rules.results, id, (rule) => ({ label: text(rule.label), freeFrom: rule.free_from === null ? null : num(rule.free_from) }));
    const free = areas.map((area) => area.freeFrom).filter((cents): cents is number => cents !== null);
    return {
      id,
      title: text(row.title),
      closesAt: num(row.closes_at),
      shop: { slug: text(row.slug), name: text(row.name), kind: row.kind as ShopKind },
      orders: row.roster === "off" ? null : num(of(orders.results, id, (count) => count.n)[0] ?? 0),
      photo: goods.find((item) => item.photo)?.photo ?? null,
      goods: goods.slice(0, 12).map((item) => item.name),
      items: goods.length,
      weighed: goods.some((item) => weighed(item.unit)),
      pickups: num(of(points.results, id, (count) => count.n)[0] ?? 0),
      areas: areas.map((area) => area.label),
      freeFrom: free.length ? Math.min(...free) : null,
    };
  });
  return { offers, shops };
}

/** A shop's group buys as anyone may see them (no drafts), the one that closes last first. */
export async function shopOffers(db: D1Database, shopId: string): Promise<Offer[]> {
  const rows = (await db.prepare("SELECT id, shop_id, title, note, status, closes_at, roster, arrived_at, arrived_note FROM offers WHERE shop_id = ? AND status != 'draft' ORDER BY closes_at DESC LIMIT 30").bind(shopId).all<Row>()).results;
  return rows.map((row) => ({ id: text(row.id), shopId: text(row.shop_id), title: text(row.title), note: text(row.note), status: row.status as OfferStatus, closesAt: num(row.closes_at), roster: row.roster as Roster, arrived: arrivedOf(row) }));
}

export async function isMember(db: D1Database, shopId: string, email: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS yes FROM shop_members WHERE shop_id = ? AND email = ?").bind(shopId, email).first()) !== null;
}

/** The shops an account runs (every shop, for the site's owner), each with its latest group buys. */
// (a shop with the application it came from, if it did: the one query a merchant's home and the owner's list both read)
const SHOP_APPLIED = `SELECT s.id, s.slug, s.name, s.kind, s.about, s.contact, s.pay, s.permit, s.status,
    a.email AS a_email, a.note AS a_note, a.state AS a_state, a.reply AS a_reply, a.sent_at AS a_sent_at
  FROM shops s LEFT JOIN applications a ON a.shop_id = s.id`;

const applicationOf = (r: Row): Application => ({
  shop: { slug: text(r.slug), name: text(r.name), kind: r.kind as Application["shop"]["kind"], about: text(r.about), contact: text(r.contact), pay: text(r.pay), permit: text(r.permit) },
  email: text(r.a_email),
  note: text(r.a_note),
  state: r.a_state as ApplicationState,
  reply: text(r.a_reply),
  sentAt: num(r.a_sent_at),
});

export async function shopsOf(db: D1Database, email: string, all: boolean): Promise<MyShop[]> {
  const shops = (
    await (all
      ? db.prepare(`${SHOP_APPLIED} ORDER BY s.created_at DESC LIMIT 50`)
      : db.prepare(`${SHOP_APPLIED} WHERE s.id IN (SELECT shop_id FROM shop_members WHERE email = ?) ORDER BY s.created_at DESC LIMIT 50`).bind(email)
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
    // (once let in, the asking is history: nothing more to show)
    ...(shop.a_state && shop.a_state !== "accepted" ? { application: applicationOf(shop) } : {}),
  }));
}

// ---------- applying to open a shop ----------

/** An account's application that is still open (waiting, or sent back), with its shop. */
export async function openApplicationOf(db: D1Database, email: string): Promise<{ shopId: string; state: ApplicationState } | null> {
  const row = await db.prepare("SELECT shop_id, state FROM applications WHERE email = ? AND state IN ('waiting', 'returned') ORDER BY sent_at DESC LIMIT 1").bind(email).first<Row>();
  return row ? { shopId: text(row.shop_id), state: row.state as ApplicationState } : null;
}

/** Does this account run a shop, or has it ever asked for one? */
export async function runsOrAsked(db: D1Database, email: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS yes FROM shop_members WHERE email = ?1 UNION ALL SELECT 1 FROM applications WHERE email = ?1 LIMIT 1").bind(email).first()) !== null;
}

/** A new application: its shop, still pending and run by the account that asked, and the asking. False when the shop's address is taken. */
export async function insertApplication(db: D1Database, app: NewApplication, email: string, shopId: string, now: number): Promise<boolean> {
  const { slug, words, note } = app;
  try {
    await db.batch([
      db
        .prepare("INSERT INTO shops (id, slug, name, kind, about, contact, pay, permit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
        .bind(shopId, slug, words.name, words.kind, words.about, words.contact, words.pay, words.permit, now),
      db.prepare("INSERT INTO shop_members (shop_id, email, added_at) VALUES (?, ?, ?)").bind(shopId, email, now),
      db.prepare("INSERT INTO applications (shop_id, email, note, declared, state, sent_at) VALUES (?, ?, ?, ?, 'waiting', ?)").bind(shopId, email, note, DECLARATION, now),
    ]);
    return true;
  } catch (e) {
    return refusedByTable(e);
  }
}

/**
 * An open application sent again, changed: its shop's address and words, the note, the declaration
 * ticked again now. Waiting for the owner from now on. False when the new address is another shop's.
 */
export async function resendApplication(db: D1Database, shopId: string, app: NewApplication, now: number): Promise<boolean> {
  const { slug, words, note } = app;
  try {
    await db.batch([
      db
        .prepare("UPDATE shops SET slug = ?2, name = ?3, kind = ?4, about = ?5, contact = ?6, pay = ?7, permit = ?8 WHERE id = ?1 AND status = 'pending'")
        .bind(shopId, slug, words.name, words.kind, words.about, words.contact, words.pay, words.permit),
      db.prepare("UPDATE applications SET note = ?2, declared = ?3, state = 'waiting', sent_at = ?4 WHERE shop_id = ?1 AND state IN ('waiting', 'returned')").bind(shopId, note, DECLARATION, now),
    ]);
    return true;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** The applications for the site's owner to answer: those waiting, the oldest first, then those sent back. */
export async function openApplications(db: D1Database, limit: number): Promise<Application[]> {
  const rows = await db.prepare(`${SHOP_APPLIED} WHERE a.state IN ('waiting', 'returned') ORDER BY a.state = 'returned', a.sent_at LIMIT ?`).bind(limit).all<Row>();
  return rows.results.map(applicationOf);
}

/** The application a shop came from, with who asked: null when it didn't come from one. */
export async function applicationAt(db: D1Database, slug: string): Promise<{ shopId: string; name: string; email: string; state: ApplicationState } | null> {
  const row = await db.prepare("SELECT s.id, s.name, a.email, a.state FROM shops s JOIN applications a ON a.shop_id = s.id WHERE s.slug = ?").bind(slug).first<Row>();
  return row ? { shopId: text(row.id), name: text(row.name), email: text(row.email), state: row.state as ApplicationState } : null;
}

/**
 * The owner's answer to an application that is still open. Letting it in opens the shop: it gets its
 * page, and its group buys take orders. False when it was answered already.
 */
export async function decideApplication(db: D1Database, shopId: string, decision: Decision, now: number): Promise<boolean> {
  const state = decision.do === "accept" ? "accepted" : decision.do === "return" ? "returned" : "declined";
  const reply = decision.do === "accept" ? "" : decision.reply;
  const [answered] = await db.batch([
    db.prepare("UPDATE applications SET state = ?2, reply = ?3, decided_at = ?4 WHERE shop_id = ?1 AND state IN ('waiting', 'returned')").bind(shopId, state, reply, now),
    // (only when that was this answer, just now)
    db.prepare("UPDATE shops SET status = 'live' WHERE id = ?1 AND status = 'pending' AND EXISTS (SELECT 1 FROM applications WHERE shop_id = ?1 AND state = 'accepted' AND decided_at = ?2)").bind(shopId, now),
  ]);
  return (answered.meta.changes ?? 0) > 0;
}

// ---------- pictures of the goods (src/server/photos.ts) ----------

export async function hasPhoto(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS yes FROM photos WHERE id = ?").bind(id).first()) !== null;
}

/** A picture now in KV: whose it is, and how big its two copies are. */
export async function keepPhoto(db: D1Database, id: string, shopId: string, bytes: number, now: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO photos (id, shop_id, bytes, created_at) VALUES (?, ?, ?, ?)").bind(id, shopId, bytes, now).run();
}

// ---------- the site's owner ----------

const DAY_MS = 86_400_000;

/** The owner opened their home here: keep their email for the mail about new applications (written at most once a day). */
export async function sawOwner(db: D1Database, email: string, now: number): Promise<void> {
  await db.prepare("INSERT INTO owners (email, seen_at) VALUES (?1, ?2) ON CONFLICT (email) DO UPDATE SET seen_at = excluded.seen_at WHERE owners.seen_at < ?3").bind(email, now, now - DAY_MS).run();
}

/** The owners seen here since `since`, the latest first. */
export async function ownersSince(db: D1Database, since: number, limit: number): Promise<string[]> {
  return (await db.prepare("SELECT email FROM owners WHERE seen_at >= ? ORDER BY seen_at DESC LIMIT ?").bind(since, limit).all<{ email: string }>()).results.map((r) => r.email);
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
          `INSERT INTO items (id, offer_id, pos, section, name, detail, photo, price, unit, step, least, stock, per_buyer, case_qty, allergens)
           SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.section'), json_extract(j.value, '$.name'), json_extract(j.value, '$.detail'), json_extract(j.value, '$.photo'),
             json_extract(j.value, '$.price'), json_extract(j.value, '$.unit'), json_extract(j.value, '$.step'), json_extract(j.value, '$.least'), json_extract(j.value, '$.stock'), json_extract(j.value, '$.perBuyer'), json_extract(j.value, '$.case'), json_extract(j.value, '$.allergens')
           FROM json_each(?2) AS j`,
        )
        .bind(id, withIds(offer.items)),
      db
        .prepare("INSERT INTO pickup_points (id, offer_id, pos, name, address, hours) SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.name'), json_extract(j.value, '$.address'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j")
        .bind(id, withIds(offer.points)),
      db
        .prepare(
          "INSERT INTO delivery_rules (id, offer_id, pos, label, min_total, fee, free_from, hours) SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.label'), json_extract(j.value, '$.min'), json_extract(j.value, '$.fee'), json_extract(j.value, '$.freeFrom'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j",
        )
        .bind(id, withIds(offer.rules)),
    ]);
    return true;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** The parts of a group buy that some order names, cancelled orders too. */
export async function usedOf(db: D1Database, offerId: string): Promise<Used> {
  const [items, points, rules] = await db.batch<Row>([
    db.prepare("SELECT DISTINCT l.item_id AS id FROM order_items l JOIN orders o ON o.code = l.order_code WHERE o.offer_id = ?").bind(offerId),
    db.prepare("SELECT DISTINCT pickup_id AS id FROM orders WHERE offer_id = ? AND pickup_id IS NOT NULL").bind(offerId),
    db.prepare("SELECT DISTINCT rule_id AS id FROM orders WHERE offer_id = ? AND rule_id IS NOT NULL").bind(offerId),
  ]);
  const ids = (rows: Row[]) => new Set(rows.map((row) => text(row.id)));
  return { items: ids(items.results), points: ids(points.results), rules: ids(rules.results) };
}

/**
 * Keep a merchant's change to a group buy (src/engine/edit.ts): the parts that stay are changed
 * where they are, so the orders that name them still do; new ones get an id; the ones that go, go.
 * One transaction. False, and nothing changed, when the tables turned it down: an order came in
 * meanwhile that names a part that would go, or takes more of an item than its new limit.
 */
export async function saveEdit(db: D1Database, offerId: string, edit: Edit, newId: () => string): Promise<boolean> {
  const withIds = <T extends { id: string | null }>(list: T[]) => JSON.stringify(list.map((one) => ({ ...one, id: one.id ?? newId() })));
  const gone = (table: string, ids: string[]) => db.prepare(`DELETE FROM ${table} WHERE offer_id = ?1 AND id IN (SELECT value FROM json_each(?2))`).bind(offerId, JSON.stringify(ids));
  try {
    await db.batch([
      db
        .prepare("UPDATE offers SET title = ?2, note = ?3, closes_at = ?4, roster = ?5, status = CASE WHEN ?6 = 1 AND status = 'draft' THEN 'open' ELSE status END WHERE id = ?1")
        .bind(offerId, edit.title, edit.note, edit.closesAt, edit.roster, edit.publish ? 1 : 0),
      gone("items", edit.gone.items),
      gone("pickup_points", edit.gone.points),
      gone("delivery_rules", edit.gone.rules),
      // (WHERE true: without it SQLite reads the ON of ON CONFLICT as the join's. A picture stays as it is: the document has none.)
      db
        .prepare(
          `INSERT INTO items (id, offer_id, pos, section, name, detail, photo, price, unit, step, least, stock, per_buyer, case_qty, allergens)
           SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.section'), json_extract(j.value, '$.name'), json_extract(j.value, '$.detail'),
             json_extract(j.value, '$.photo'), json_extract(j.value, '$.price'), json_extract(j.value, '$.unit'), json_extract(j.value, '$.step'), json_extract(j.value, '$.least'), json_extract(j.value, '$.stock'), json_extract(j.value, '$.perBuyer'), json_extract(j.value, '$.case'), json_extract(j.value, '$.allergens')
           FROM json_each(?2) AS j WHERE true
           ON CONFLICT (id) DO UPDATE SET pos = excluded.pos, section = excluded.section, name = excluded.name, detail = excluded.detail, photo = excluded.photo, price = excluded.price, unit = excluded.unit,
             step = excluded.step, least = excluded.least, stock = excluded.stock, per_buyer = excluded.per_buyer, case_qty = excluded.case_qty, allergens = excluded.allergens
           WHERE items.offer_id = ?1`,
        )
        .bind(offerId, withIds(edit.items)),
      db
        .prepare(
          `INSERT INTO pickup_points (id, offer_id, pos, name, address, hours)
           SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.name'), json_extract(j.value, '$.address'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j WHERE true
           ON CONFLICT (id) DO UPDATE SET pos = excluded.pos, name = excluded.name, address = excluded.address, hours = excluded.hours WHERE pickup_points.offer_id = ?1`,
        )
        .bind(offerId, withIds(edit.points)),
      db
        .prepare(
          `INSERT INTO delivery_rules (id, offer_id, pos, label, min_total, fee, free_from, hours)
           SELECT json_extract(j.value, '$.id'), ?1, j.key, json_extract(j.value, '$.label'), json_extract(j.value, '$.min'), json_extract(j.value, '$.fee'), json_extract(j.value, '$.freeFrom'), json_extract(j.value, '$.hours') FROM json_each(?2) AS j WHERE true
           ON CONFLICT (id) DO UPDATE SET pos = excluded.pos, label = excluded.label, min_total = excluded.min_total, fee = excluded.fee, free_from = excluded.free_from, hours = excluded.hours WHERE delivery_rules.offer_id = ?1`,
        )
        .bind(offerId, withIds(edit.rules)),
    ]);
    return true;
  } catch (e) {
    return refusedByTable(e);
  }
}

/** Open a group buy for orders, or close it. */
/** The merchant's word that the goods are in (a time and a line), or its taking back (null). */
export async function setArrived(db: D1Database, offerId: string, arrived: Arrived | null): Promise<void> {
  await db.prepare("UPDATE offers SET arrived_at = ?, arrived_note = ? WHERE id = ?").bind(arrived?.at ?? null, arrived?.note ?? "", offerId).run();
}

export async function setOfferStatus(db: D1Database, offerId: string, status: "open" | "closed"): Promise<void> {
  await db.prepare("UPDATE offers SET status = ? WHERE id = ?").bind(status, offerId).run();
}
