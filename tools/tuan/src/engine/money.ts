// Money and amounts. Cents and thousandths, whole numbers only.
import { weighed, type OrderLine } from "./types";

/** One unit, in thousandths. */
export const MILLI = 1000;
/** The most of one thing in one order: 99 units. */
export const QTY_MAX = 99 * MILLI;

/** What `qty` of something costs, in cents (a half cent rounds up). */
export const lineAmount = (price: number, qty: number): number => Math.round((price * qty) / MILLI);

/** The goods in an order as ordered: an estimate while anything weighed is unweighed. */
export const goodsOf = (lines: readonly Pick<OrderLine, "price" | "qty">[]): number => lines.reduce((sum, line) => sum + lineAmount(line.price, line.qty), 0);

/**
 * The goods once weighed: each weighed line at its actual weight. null while any weighed line
 * still waits for the scale (an order with nothing weighed is final from the start).
 */
export function finalGoods(lines: readonly OrderLine[]): number | null {
  let sum = 0;
  for (const line of lines) {
    if (weighed(line.unit) && line.actual === null) return null;
    sum += lineAmount(line.price, line.actual ?? line.qty);
  }
  return sum;
}

/** How many things an order holds, for the public list: whole things as counted, anything weighed as one. */
export const piecesOf = (lines: readonly Pick<OrderLine, "unit" | "qty">[]): number => lines.reduce((sum, line) => sum + (weighed(line.unit) ? 1 : Math.ceil(line.qty / MILLI)), 0);

/** "$12.50" */
export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** "1.5", "2", "0.25": an amount without its unit. */
export const amountText = (qty: number): string => String(qty / MILLI);
