import { amountText, lineAmount } from "./money";
import { dueOf } from "./summary";
import { vancouverClock } from "./time";
import type { How, OfferBook, Order, OrderStatus, Unit } from "./types";

/** The words the file is written in (the page gives them in the reader's language). */
export interface CsvWords {
  /** The 21 column names, in the order of the exported fields. */
  headers: readonly string[];
  status: Record<OrderStatus, string>;
  how: Record<How, string>;
  unit: Record<Unit, string>;
  /** What a ticked box says: "是", "yes". */
  yes: string;
}

const money = (cents: number): string => (cents / 100).toFixed(2);

/** Treat buyer and merchant text as data when a spreadsheet opens it. */
const text = (value: string): string => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

function field(value: string): string {
  return /[,"\n\r]|^ | $/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function phone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return digits;
}

/** The orders of a group buy as the text of a CSV file. */
export function ordersCsv(book: OfferBook, orders: readonly Order[], words: CsvWords): string {
  const rows: string[][] = [[...words.headers]];
  const standing = orders.filter((order) => order.status !== "cancelled").sort((a, b) => a.seq - b.seq);
  for (const order of standing) {
    const place = order.how === "pickup"
      ? book.points.find((point) => point.id === order.pickupId)?.name ?? ""
      : book.rules.find((rule) => rule.id === order.ruleId)?.label ?? "";
    order.lines.forEach((line, at) => {
      rows.push([
        String(order.seq), order.code, words.status[order.status], text(order.name),
        ...(at === 0 ? [phone(order.phone), text(order.wechat), words.how[order.how], text(place), text(order.how === "delivery" ? order.address : ""), text(order.note)] : Array<string>(6).fill("")),
        text(line.name), words.unit[line.unit], money(line.price), amountText(line.qty),
        line.actual === null ? "" : amountText(line.actual), money(lineAmount(line.price, line.actual ?? line.qty)),
        ...(at === 0 ? [money(order.fee), money(dueOf(order)), order.paidAt !== null ? words.yes : "", order.pickedAt !== null ? words.yes : "", vancouverClock(order.createdAt)] : Array<string>(5).fill("")),
      ]);
    });
  }
  return "\uFEFF" + rows.map((row) => row.map(field).join(",") + "\r\n").join("");
}
