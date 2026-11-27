import { caseFill } from "./cases";
import { amountText, dollars } from "./money";
import { leftOf } from "./order";
import { weighed, type OfferBook, type Order, type Unit } from "./types";

/** The words the text is written in (the page gives them in the merchant's language, filled in). */
export interface ChainWords {
  /** "截单：11月21日 周五 20:00" */
  closes: string;
  /** "下单：https://…" */
  link: (link: string) => string;
  /** "接龙（3 单）" */
  joined: (n: number) => string;
  /** "还没有人下单，点上面的链接就能跟团。" */
  none: string;
  /** "1 磅起" */
  least: (amount: string) => string;
  /** "每人限 2" */
  perBuyer: (amount: string) => string;
  /** an item that comes only by the case, nothing ordered yet: "整箱 30 磅" */
  caseSize: (amount: string) => string;
  /** …and some ordered: "这一箱还差 6 磅" */
  caseShort: (amount: string) => string;
  /** Between the goods of one order: "、", ", ". */
  and: string;
  unit: Record<Unit, string>;
}

/** One line of text: what a merchant or a buyer typed never breaks the layout of the message. */
const flat = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * A group buy as the text a merchant pastes into a WeChat group: what it is, when it closes, the
 * link, what can still be had (by section), and the 接龙 so far. The list shows buyers' names only
 * when the group buy's own page does (`roster: "names"`); "anon" lists the orders without names,
 * and "off" leaves the list out.
 */
export function chainText(book: Pick<OfferBook, "offer" | "items">, shop: string, orders: readonly Order[], link: string, words: ChainWords): string {
  const { offer } = book;
  const out = [`【${flat(shop)}】${flat(offer.title)}`, words.closes, words.link(link), ""];

  const qty = (unit: Unit, amount: number): string => (weighed(unit) ? `${amountText(amount)} ${words.unit[unit]}` : amountText(amount));
  const sections: string[] = [];
  for (const item of book.items) if (!sections.includes(item.section)) sections.push(item.section);
  for (const section of sections) {
    // what can still be had: an item with less left than one order's least is left out
    const here = book.items.filter((item) => item.section === section && (leftOf(item) ?? Infinity) >= item.least);
    if (!here.length) continue;
    if (sections.length > 1 && section) out.push(flat(section));
    for (const item of here) {
      // (a case: how much it holds while nobody has ordered, then what it still wants; nothing once it's just full)
      const fill = item.case === null ? null : caseFill(item.case, item.sold);
      const withUnit = (amount: number) => `${amountText(amount)} ${words.unit[item.unit]}`;
      const casing = !fill ? "" : fill.full === 0 && fill.part === 0 ? words.caseSize(withUnit(fill.size)) : fill.short > 0 ? words.caseShort(withUnit(fill.short)) : "";
      const terms = [item.least > item.step ? words.least(qty(item.unit, item.least)) : "", item.perBuyer !== null ? words.perBuyer(qty(item.unit, item.perBuyer)) : "", casing].filter(Boolean);
      out.push(`· ${flat(item.name)} ${dollars(item.price)}/${words.unit[item.unit]}${terms.length ? `（${terms.join(words.and)}）` : ""}`);
    }
  }

  if (offer.roster !== "off") {
    const standing = orders.filter((order) => order.status !== "cancelled").sort((a, b) => a.seq - b.seq);
    out.push("", words.joined(standing.length));
    if (!standing.length) out.push(words.none);
    for (const order of standing) {
      const goods = order.lines.map((line) => (weighed(line.unit) ? `${flat(line.name)} ${qty(line.unit, line.qty)}` : `${flat(line.name)}×${amountText(line.qty)}`)).join(words.and);
      out.push(`${order.seq}. ${offer.roster === "names" ? `${flat(order.name)} ` : ""}${goods}`);
    }
  }
  return out.join("\n");
}
