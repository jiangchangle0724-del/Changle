// The merchant's two sheets as plain text, for the copy buttons: paste into WeChat, a note, a
// spreadsheet cell. The numbers are the server's own sums (src/engine/summary.ts); this only lays
// them out, in the reader's language.
//   What to get ready: every item, added up.
//   What goes where: one pickup point or delivery area at a time: what to bring there, then who
//   gets what. A pickup line carries the last four digits of the buyer's phone number (such a
//   list is often posted in the group); a delivery line carries the whole number and the address,
//   which the driver needs.
import type { MyOfferPage } from "../../api";
import { amountText, dollars } from "../../engine/money";
import { tailOf } from "../../engine/phone";
import { dueOf, type ItemTotal } from "../../engine/summary";
import { weighed, type Order, type OrderLine, type Unit } from "../../engine/types";
import { t, unitName } from "../i18n";

/** "2 袋", "1.5 lb" */
export const amountOf = (unit: Unit, qty: number): string => (weighed(unit) ? `${amountText(qty)} lb` : `${amountText(qty)} ${unitName(unit)}`);

/** A phone number as people write one here: 604-555-0188, +1 604-555-0188; anything else as its digits. */
export function phoneText(digits: string): string {
  const local = (ten: string) => `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
  if (digits.length === 10) return local(digits);
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${local(digits.slice(1))}`;
  return `+${digits}`;
}
/** The number as a phone dials it. */
export const phoneLink = (digits: string): string => `tel:+${digits.length === 10 ? `1${digits}` : digits}`;

const totalLine = (item: ItemTotal): string => `${item.name} × ${amountOf(item.unit, item.qty)}${item.actual !== null && weighed(item.unit) ? `（${t("weighed", { w: amountOf(item.unit, item.actual) })}）` : ""}`;
const orderLine = (line: OrderLine): string => `${line.name} × ${amountOf(line.unit, line.qty)}${line.actual !== null ? `（${t("weighed", { w: amountOf(line.unit, line.actual) })}）` : ""}`;

/** What a set of orders comes to: each at its weighed amount once it has one, else as ordered. */
export const dueAll = (orders: readonly Order[]): number => orders.reduce((sum, order) => sum + dueOf(order), 0);

/** The orders that stand at one pickup point or in one delivery area, in the order they came. */
export const ordersAt = (page: MyOfferPage, how: Order["how"], id: string): Order[] => page.orders.filter((order) => order.status !== "cancelled" && order.how === how && (how === "pickup" ? order.pickupId : order.ruleId) === id);

export function goodsText(page: MyOfferPage): string {
  const { summary } = page;
  return [
    page.offer.title,
    `${t("tabGoods")} · ${t("placeOrders", { n: summary.orders })}`,
    "",
    ...summary.items.map(totalLine),
    "",
    `${t("goodsAsOrdered")} ${dollars(summary.goods)}`,
    ...(summary.fee ? [`${t("sheetFees")} ${dollars(summary.fee)}`] : []),
    `${t(summary.unweighed ? "dueEstimate" : "due")} ${dollars(dueAll(page.orders.filter((order) => order.status !== "cancelled")))}`,
  ].join("\n");
}

export function placesText(page: MyOfferPage): string {
  const out: string[] = [page.offer.title, `${t("tabPlaces")} · ${t("placeOrders", { n: page.summary.orders })}`];
  for (const place of page.summary.places) {
    out.push("", `【${t(place.how)} · ${place.name}】${t("placeOrders", { n: place.orders })}`, ...place.items.map(totalLine), "");
    for (const order of ordersAt(page, place.how, place.id)) {
      out.push(`${order.seq}. ${order.name} ${place.how === "pickup" ? tailOf(order.phone) : phoneText(order.phone)}：${order.lines.map(orderLine).join("、")}`);
      if (place.how === "delivery") out.push(`   ${t("sheetAddress")}：${order.address.replace(/\s*\n\s*/g, " ")}`);
      if (order.note) out.push(`   ${t("orderNote", { note: order.note.replace(/\s*\n\s*/g, " ") })}`);
    }
  }
  return out.join("\n");
}
