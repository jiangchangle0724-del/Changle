// Taking an order: what a buyer's phone sent, checked against the group buy as it stands, and
// priced. Pure rules; the server keeps the result (src/server/store.ts).
import { finalGoods, goodsOf, lineAmount, piecesOf, QTY_MAX } from "./money";
import { phoneDigits, phoneKey } from "./phone";
import { cleanLine, cleanLines } from "./text";
import type { How, Item, OfferBook, Order, Unit } from "./types";

export const NAME_MAX = 30;
export const WECHAT_MAX = 40;
export const ADDRESS_MAX = 200;
export const NOTE_MAX = 300;
/** The most different things in one order. */
export const LINES_MAX = 60;
/** Orders one phone number may have standing in one group buy. */
export const ORDERS_PER_PHONE = 5;
/** Orders one group buy takes, cancelled ones included. */
export const ORDERS_MAX = 500;
/** Made by the buyer's phone, one per order it sends: sending it twice makes one order (the server checks it, not takeOrder). */
export const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export interface PricedLine {
  itemId: string;
  name: string;
  unit: Unit;
  price: number;
  qty: number;
}

/** An order ready to keep. */
export interface Taken {
  ok: true;
  name: string;
  phone: string;
  phoneKey: string;
  wechat: string;
  how: How;
  pickupId: string | null;
  ruleId: string | null;
  address: string;
  note: string;
  lines: PricedLine[];
  /** cents: the goods as ordered */
  goods: number;
  /** cents: delivery */
  fee: number;
  /** cents: goods and fee, when nothing in it waits for the scale; else null */
  final: number | null;
  pieces: number;
}

export type RefusalCode =
  | "bad" // not an order at all
  | "closed" // the group buy isn't taking orders
  | "name"
  | "phone"
  | "empty" // nothing in it
  | "item" // something that isn't in this group buy
  | "qty" // an amount that can't be ordered
  | "soldout" // more than is left (items: which, and how much is left of each)
  | "perbuyer" // more than one buyer may take (items: which, and how much this buyer may still take)
  | "many" // this phone number already has as many orders here as one number may
  | "how" // a pickup point or a delivery area this group buy doesn't have
  | "address" // delivery with nowhere to deliver to
  | "min"; // goods under the delivery area's minimum (min: that minimum)

export interface Refused {
  ok: false;
  error: RefusalCode;
  /** soldout, perbuyer: the items, and how much of each can still be taken */
  items?: { id: string; left: number }[];
  /** min: the least goods for delivery there, in cents */
  min?: number;
}

/** What one phone number already has standing in a group buy. */
export interface Before {
  orders: number;
  /** how much of each item */
  items: ReadonlyMap<string, number>;
}
const NOTHING: Before = { orders: 0, items: new Map() };

const refuse = (error: RefusalCode, more: Omit<Refused, "ok" | "error"> = {}): Refused => ({ ok: false, error, ...more });

/** Is the group buy taking orders at this moment? */
export const isOpen = (book: Pick<OfferBook, "shop" | "offer">, now: number): boolean => book.shop.status === "live" && book.offer.status === "open" && now < book.offer.closesAt;

/** How much of an item is left to order, or null when it has no limit. */
export const leftOf = (item: Pick<Item, "stock" | "sold">): number | null => (item.stock === null ? null : Math.max(0, item.stock - item.sold));

/**
 * Check and price what a phone sent. `had`: what this buyer (by phone number) already has in
 * orders that stand, for the limits on one buyer (the server looks it up: src/server/store.ts).
 */
export function takeOrder(input: unknown, book: OfferBook, now: number, had: Before = NOTHING): Taken | Refused {
  if (!input || typeof input !== "object" || Array.isArray(input)) return refuse("bad");
  const raw = input as Record<string, unknown>;
  if (!isOpen(book, now)) return refuse("closed");

  const name = cleanLine(raw.name, NAME_MAX);
  if (!name) return refuse("name");
  const phone = phoneDigits(raw.phone);
  if (!phone) return refuse("phone");
  const wechat = cleanLine(raw.wechat, WECHAT_MAX) ?? "";
  const note = cleanLines(raw.note, NOTE_MAX);

  // ---- what was ordered ----
  if (!Array.isArray(raw.lines)) return refuse("bad");
  if (raw.lines.length === 0) return refuse("empty");
  if (raw.lines.length > LINES_MAX) return refuse("bad");
  const byId = new Map(book.items.map((item) => [item.id, item]));
  const wanted = new Map<string, number>();
  for (const line of raw.lines as unknown[]) {
    if (!line || typeof line !== "object") return refuse("bad");
    const { itemId, qty } = line as Record<string, unknown>;
    if (typeof itemId !== "string") return refuse("bad");
    const item = byId.get(itemId);
    if (!item) return refuse("item");
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0 || qty % item.step !== 0) return refuse("qty");
    const sum = (wanted.get(itemId) ?? 0) + qty;
    if (sum > QTY_MAX) return refuse("qty");
    wanted.set(itemId, sum);
  }
  const want = (item: Item) => wanted.get(item.id) ?? 0;
  const ordered = book.items.filter((item) => wanted.has(item.id));

  const gone = ordered.filter((item) => item.stock !== null && item.sold + want(item) > item.stock);
  if (gone.length) return refuse("soldout", { items: gone.map((item) => ({ id: item.id, left: leftOf(item)! })) });

  if (had.orders >= ORDERS_PER_PHONE) return refuse("many");
  const got = (item: Item) => had.items.get(item.id) ?? 0;
  const over = ordered.filter((item) => item.perBuyer !== null && got(item) + want(item) > item.perBuyer);
  if (over.length) return refuse("perbuyer", { items: over.map((item) => ({ id: item.id, left: Math.max(0, item.perBuyer! - got(item)) })) });

  // listed in the group buy's own order, whatever order the phone sent them in
  const lines: PricedLine[] = ordered.map((item) => ({ itemId: item.id, name: item.name, unit: item.unit, price: item.price, qty: want(item) }));
  const goods = goodsOf(lines);
  const weighedGoods = finalGoods(lines.map((line) => ({ ...line, actual: null })));

  // ---- how it gets to the buyer ----
  const taken = { ok: true as const, name, phone, phoneKey: phoneKey(phone), wechat, note, lines, goods, pieces: piecesOf(lines) };
  if (raw.how === "pickup") {
    const point = book.points.find((p) => p.id === raw.pickupId);
    if (!point) return refuse("how");
    return { ...taken, how: "pickup", pickupId: point.id, ruleId: null, address: "", fee: 0, final: weighedGoods };
  }
  if (raw.how === "delivery") {
    const rule = book.rules.find((r) => r.id === raw.ruleId);
    if (!rule) return refuse("how");
    const address = cleanLines(raw.address, ADDRESS_MAX);
    if (!address) return refuse("address");
    if (goods < rule.min) return refuse("min", { min: rule.min });
    return { ...taken, how: "delivery", pickupId: null, ruleId: rule.id, address, fee: rule.fee, final: weighedGoods === null ? null : weighedGoods + rule.fee };
  }
  return refuse("how");
}

/**
 * The group buy as it would stand without one of its orders: what that order holds is back on the
 * shelf. Changing an order is taking it again against this.
 */
export function without(book: OfferBook, order: Pick<Order, "status" | "lines">): OfferBook {
  if (order.status === "cancelled") return book;
  const held = new Map(order.lines.map((line) => [line.itemId, line.qty]));
  return { ...book, items: book.items.map((item) => (held.has(item.id) ? { ...item, sold: Math.max(0, item.sold - held.get(item.id)!) } : item)) };
}

/** May the buyer still change or cancel this order themselves? Until the group buy closes, and until it's paid for or handed over. */
export const buyerMayChange = (book: Pick<OfferBook, "shop" | "offer">, order: Pick<Order, "status" | "paidAt" | "pickedAt">, now: number): boolean =>
  isOpen(book, now) && order.status !== "cancelled" && order.paidAt === null && order.pickedAt === null;

/** The line amounts of an order, for showing: each line's cents as ordered. */
export const amountOf = (line: Pick<PricedLine, "price" | "qty">): number => lineAmount(line.price, line.qty);
