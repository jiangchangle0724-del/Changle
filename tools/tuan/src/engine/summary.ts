// The merchant's sheets, counted from the orders themselves: what to get ready (every item, added
// up) and what goes where (the same, one pickup point or delivery area at a time). Orders that were
// cancelled count for nothing.
import { lineAmount } from "./money";
import { weighed, type How, type OfferBook, type Order, type OrderLine, type Unit } from "./types";

export interface ItemTotal {
  itemId: string;
  name: string;
  unit: Unit;
  /** how much was ordered, in thousandths of the unit */
  qty: number;
  /** weighed items: what the scale said, once every order's share is weighed; else null */
  actual: number | null;
  /** how many orders have it */
  orders: number;
  /** cents, as ordered */
  amount: number;
}

export interface PlaceTotal {
  how: How;
  /** the pickup point's or the delivery area's id */
  id: string;
  /** as the merchant wrote it */
  name: string;
  orders: number;
  /** cents: goods as ordered, and delivery */
  goods: number;
  fee: number;
  items: ItemTotal[];
}

export interface Summary {
  /** orders that stand */
  orders: number;
  cancelled: number;
  pieces: number;
  /** cents, as ordered: goods, delivery, and the two together */
  goods: number;
  fee: number;
  total: number;
  /** orders marked paid, and what those come to (the weighed amount where there is one) */
  paid: number;
  paidTotal: number;
  /** orders handed over */
  picked: number;
  /** orders with something still to weigh */
  unweighed: number;
  items: ItemTotal[];
  places: PlaceTotal[];
}

/** What an order comes to: the weighed amount once there is one, else as ordered. */
export const dueOf = (order: Pick<Order, "goods" | "fee" | "final">): number => order.final ?? order.goods + order.fee;

/** Lines added up item by item, listed in the group buy's own order (anything no longer listed comes last, as ordered). */
function totals(lines: readonly { line: OrderLine }[], book: OfferBook): ItemTotal[] {
  const byItem = new Map<string, ItemTotal & { waiting: boolean }>();
  for (const { line } of lines) {
    let sum = byItem.get(line.itemId);
    if (!sum) byItem.set(line.itemId, (sum = { itemId: line.itemId, name: line.name, unit: line.unit, qty: 0, actual: weighed(line.unit) ? 0 : null, orders: 0, amount: 0, waiting: false }));
    sum.qty += line.qty;
    sum.orders += 1;
    sum.amount += lineAmount(line.price, line.qty);
    if (weighed(line.unit)) {
      if (line.actual === null) sum.waiting = true;
      else sum.actual! += line.actual;
    }
  }
  const place = new Map(book.items.map((item, at) => [item.id, at]));
  return [...byItem.values()]
    .map(({ waiting, ...sum }) => ({ ...sum, actual: waiting ? null : sum.actual }))
    .sort((a, b) => (place.get(a.itemId) ?? Infinity) - (place.get(b.itemId) ?? Infinity));
}

export function summarize(book: OfferBook, orders: readonly Order[]): Summary {
  const standing = orders.filter((order) => order.status !== "cancelled");
  const linesOf = (some: readonly Order[]) => some.flatMap((order) => order.lines.map((line) => ({ line })));

  const places: PlaceTotal[] = [];
  const add = (how: How, id: string, name: string) => {
    const there = standing.filter((order) => order.how === how && (how === "pickup" ? order.pickupId : order.ruleId) === id);
    if (!there.length) return;
    places.push({ how, id, name, orders: there.length, goods: there.reduce((sum, o) => sum + o.goods, 0), fee: there.reduce((sum, o) => sum + o.fee, 0), items: totals(linesOf(there), book) });
  };
  for (const point of book.points) add("pickup", point.id, point.name);
  for (const rule of book.rules) add("delivery", rule.id, rule.label);

  const paid = standing.filter((order) => order.paidAt !== null);
  const goods = standing.reduce((sum, order) => sum + order.goods, 0);
  const fee = standing.reduce((sum, order) => sum + order.fee, 0);
  return {
    orders: standing.length,
    cancelled: orders.length - standing.length,
    pieces: standing.reduce((sum, order) => sum + order.pieces, 0),
    goods,
    fee,
    total: goods + fee,
    paid: paid.length,
    paidTotal: paid.reduce((sum, order) => sum + dueOf(order), 0),
    picked: standing.filter((order) => order.pickedAt !== null).length,
    unweighed: standing.filter((order) => order.final === null).length,
    items: totals(linesOf(standing), book),
    places,
  };
}
