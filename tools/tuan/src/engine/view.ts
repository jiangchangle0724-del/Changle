// Who is shown what. A group buy's page is public: the goods, how much is left, and a list of who's
// in (as the merchant chose to show it). A buyer's phone number and address go to the buyer and to
// the merchant, nobody else.
import type { BuyerOrder, OfferPage, OfferState, OrderPage, RosterRow } from "../api";
import { lineAmount } from "./money";
import { buyerMayChange, isOpen, leftOf } from "./order";
import { tailOf } from "./phone";
import type { OfferBook, Order } from "./types";

export const stateOf = (book: Pick<OfferBook, "shop" | "offer">, now: number): OfferState => (book.shop.status !== "live" ? "paused" : isOpen(book, now) ? "open" : "closed");

/** One order's line in the public list. */
export type RosterEntry = Pick<Order, "seq" | "name" | "pieces">;

/** The group buy's own page. `standing`: its orders that stand, in the order they came. */
export function offerPage(book: OfferBook, standing: readonly RosterEntry[], now: number): OfferPage {
  const { shop, offer } = book;
  const roster: RosterRow[] = offer.roster === "off" ? [] : standing.map((order) => ({ seq: order.seq, name: offer.roster === "names" ? order.name : null, pieces: order.pieces }));
  return {
    shop: { slug: shop.slug, name: shop.name, kind: shop.kind, about: shop.about, contact: shop.contact, pay: shop.pay, permit: shop.permit },
    offer: { id: offer.id, title: offer.title, note: offer.note, closesAt: offer.closesAt, state: stateOf(book, now), roster: offer.roster },
    items: book.items.map((item) => ({
      id: item.id,
      section: item.section,
      name: item.name,
      detail: item.detail,
      photo: item.photo,
      price: item.price,
      unit: item.unit,
      step: item.step,
      least: item.least,
      left: leftOf(item),
      perBuyer: item.perBuyer,
      allergens: item.allergens,
    })),
    points: book.points,
    rules: book.rules,
    roster,
    orders: standing.length,
    now,
  };
}

export function buyerOrder(order: Order): BuyerOrder {
  return {
    code: order.code,
    seq: order.seq,
    name: order.name,
    tail: tailOf(order.phone),
    wechat: order.wechat,
    how: order.how,
    address: order.address,
    note: order.note,
    status: order.status,
    paid: order.paidAt !== null,
    picked: order.pickedAt !== null,
    goods: order.goods,
    fee: order.fee,
    final: order.final,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    lines: order.lines.map((line) => ({ ...line, amount: lineAmount(line.price, line.qty) })),
  };
}

/** An order's own page, for whoever holds its code and the phone number's last four digits. */
export function orderPage(book: OfferBook, order: Order, now: number): OrderPage {
  const { shop, offer } = book;
  return {
    order: buyerOrder(order),
    offer: { id: offer.id, title: offer.title, closesAt: offer.closesAt, state: stateOf(book, now) },
    shop: { slug: shop.slug, name: shop.name, contact: shop.contact, pay: shop.pay },
    point: book.points.find((p) => p.id === order.pickupId) ?? null,
    rule: book.rules.find((r) => r.id === order.ruleId) ?? null,
    mayChange: buyerMayChange(book, order, now),
    now,
  };
}
