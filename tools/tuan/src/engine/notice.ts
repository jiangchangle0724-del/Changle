// The mail that tells a merchant orders have come in: what it says. One mail covers every order the
// merchant hasn't been told of, in both languages, and carries no phone number and no address: those
// stay on the order page, behind the merchant's sign-in. The rooms server sends it (src/server/notify.ts).
import { amountText, dollars, MILLI } from "./money";
import { weighed, type OfferBook, type Order } from "./types";

/** At most one mail for a group buy in this long. */
export const NOTICE_GAP_MS = 30 * 60_000;
/** Orders written out one by one; any more are only counted. */
export const NOTICE_ORDERS_MAX = 8;
/** What the rooms server's door takes (site/worker/notice.ts). */
export const SUBJECT_MAX = 120;
export const TEXT_MAX = 2000;

const clip = (text: string, max: number): string => (Array.from(text).length <= max ? text : `${Array.from(text).slice(0, max - 1).join("")}…`);

/** "五常大米 10kg ×2", "手切羊肉片 1.5 lb" (a long name is cut short) */
const lineText = (line: Order["lines"][number]): string => (weighed(line.unit) ? `${clip(line.name, 20)} ${amountText(line.qty)} lb` : `${clip(line.name, 20)} ×${line.qty / MILLI}`);

/** One order on one line: who, the first three things, what it comes to, where it goes. The amount and the place are never cut. */
function orderText(book: OfferBook, order: Order, zh: boolean): string {
  const shown = order.lines.slice(0, 3).map(lineText).join(zh ? "、" : ", ");
  const more = order.lines.length - 3;
  const items = more > 0 ? (zh ? `${shown} 等 ${order.lines.length} 样` : `${shown} and ${more} more`) : shown;
  const amount = dollars(order.final ?? order.goods + order.fee);
  const place = order.how === "pickup" ? (book.points.find((p) => p.id === order.pickupId)?.name ?? "") : (book.rules.find((r) => r.id === order.ruleId)?.label ?? "");
  const head = zh ? `第 ${order.seq} 位 ${order.name}：` : `No. ${order.seq} ${order.name}: `;
  const tail = zh
    ? `，${order.final === null ? "预估 " : ""}${amount}，${order.how === "pickup" ? "自提" : "送货"} ${place}`
    : `, ${order.final === null ? "about " : ""}${amount}, ${order.how === "pickup" ? "pickup at" : "delivery to"} ${place}`;
  return `${head}${clip(items, Math.max(20, 200 - Array.from(head).length - Array.from(tail).length))}${tail}`;
}

/**
 * The notice for a group buy. `fresh`: the first of the orders the merchant hasn't been told of,
 * oldest first; `n`: how many of those there are in all; `standing`: how many orders stand.
 */
export function ordersNotice(book: OfferBook, fresh: readonly Order[], n: number, standing: number): { subject: string; text: string } {
  const title = book.offer.title;
  const subject = clip(`跟一单 新订单 ${n} 张 · ${n} new order${n === 1 ? "" : "s"} · ${title}`, SUBJECT_MAX);
  // as many written out as fit the door's limit, the rest counted
  for (let listed = Math.min(fresh.length, NOTICE_ORDERS_MAX); ; listed--) {
    const rest = n - listed;
    const zh = [
      `「${title}」新来了 ${n} 张订单，现在一共 ${standing} 张。`,
      "",
      ...fresh.slice(0, listed).map((order) => orderText(book, order, true)),
      ...(rest > 0 ? [listed > 0 ? `还有 ${rest} 张没列出来。` : "订单都在订单页里。"] : []),
      "",
      "买家的电话和地址在订单页里，这封信里不写。",
    ];
    const en = [
      `${n} new order${n === 1 ? "" : "s"} for "${title}", ${standing} in all.`,
      "",
      ...fresh.slice(0, listed).map((order) => orderText(book, order, false)),
      ...(rest > 0 ? [listed > 0 ? `${rest} more not listed here.` : "They are all on the order page."] : []),
      "",
      "Buyers' phone numbers and addresses are on the order page, not in this mail.",
    ];
    const text = [...zh, "", ...en].join("\n");
    if (text.length <= TEXT_MAX || listed === 0) return { subject, text: text.slice(0, TEXT_MAX) };
  }
}
