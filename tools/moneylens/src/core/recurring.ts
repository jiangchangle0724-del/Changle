/**
 * Recurring charges: subscriptions and regular bills, found in the user's own past transactions.
 * A subscription shows as the same merchant charging about the same amount at a steady interval;
 * a bill (power, a phone plan with usage) as the same merchant charging a varying amount every
 * month or quarter.
 *
 * This describes what has happened. `next` is the date the pattern points to, not a promise that
 * the merchant will charge, and nothing here advises what to cancel.
 *
 * How it decides, for one merchant in one currency:
 *
 * 1. Charges are sorted into price groups: amounts within 5% of the group's lowest. One merchant
 *    often bills two things (cloud storage and music from the same store), and their dates only
 *    make sense apart.
 * 2. A price group is a subscription when its dates keep a rhythm: at least three charges (two for
 *    a yearly one), and at least three quarters of the gaps between them inside one rhythm's range.
 * 3. What is left over is looked at once more as a whole, for a monthly or quarterly bill whose
 *    amount varies, as long as no charge is under a third or over three times the usual one (a
 *    power bill swings with the seasons; a monthly shopping trip swings far more). Weekly and
 *    fortnightly rhythms are only taken at a steady price: buying groceries every Saturday is a
 *    habit, not a subscription.
 */
import { addDays, addMonths, daysBetween, type Day } from "./dates";
import { fold } from "./text";

/** One charge to look at: money that left an account. `merchant` is the name the caller groups by: the user's alias or the dictionary's name for it, or the first guess (`guessMerchant`). */
export type Charge = { id: string; posted: Day; amount: number; currency: string; merchant: string };

export type Rhythm = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export type Recurring = {
  merchant: string;
  currency: string;
  rhythm: Rhythm;
  /** The usual charge, as a positive amount in smallest units: the middle one of those found. */
  typical: number;
  /** The amounts differ from the usual one by more than 5%: a bill, not a fixed price. */
  varies: boolean;
  count: number;
  first: Day;
  last: Day;
  /** The day the rhythm points to next. */
  next: Day;
  /** Still going as of the day asked about: the last charge is no older than a period and a half. */
  active: boolean;
  /** A year of it at the usual charge. */
  yearly: number;
  /** The charges it was found in, oldest first. */
  ids: string[];
};

type Shape = { rhythm: Rhythm; from: number; to: number; days: number; perYear: number; least: number; steadyOnly: boolean };
const SHAPES: readonly Shape[] = [
  { rhythm: "weekly", from: 6, to: 8, days: 7, perYear: 52, least: 3, steadyOnly: true },
  { rhythm: "fortnightly", from: 13, to: 15, days: 14, perYear: 26, least: 3, steadyOnly: true },
  { rhythm: "monthly", from: 26, to: 34, days: 31, perYear: 12, least: 3, steadyOnly: false },
  { rhythm: "quarterly", from: 85, to: 97, days: 92, perYear: 4, least: 3, steadyOnly: false },
  { rhythm: "yearly", from: 355, to: 375, days: 366, perYear: 1, least: 2, steadyOnly: false },
];

const sized = (c: Charge): number => -c.amount;

/** The rhythm these charges (oldest first) keep, if any. */
function rhythmOf(charges: readonly Charge[], steady: boolean): Shape | undefined {
  const gaps: number[] = [];
  for (let i = 1; i < charges.length; i++) gaps.push(daysBetween(charges[i - 1]!.posted, charges[i]!.posted));
  return SHAPES.find((shape) => {
    if (charges.length < shape.least || (shape.steadyOnly && !steady)) return false;
    const fitting = gaps.filter((g) => g >= shape.from && g <= shape.to).length;
    // most gaps have to fit; the rest may be a missed or doubled period, but never the latest evidence alone
    return fitting >= Math.max(shape.least - 1, Math.ceil(gaps.length * 0.75));
  });
}

function describe(merchant: string, currency: string, charges: readonly Charge[], shape: Shape, asOf: Day): Recurring {
  const sizes = charges.map(sized).sort((a, b) => a - b);
  const typical = sizes[Math.floor((sizes.length - 1) / 2)]!;
  const last = charges[charges.length - 1]!.posted;
  const next = shape.rhythm === "weekly" ? addDays(last, 7) : shape.rhythm === "fortnightly" ? addDays(last, 14) : addMonths(last, shape.rhythm === "monthly" ? 1 : shape.rhythm === "quarterly" ? 3 : 12);
  return {
    merchant,
    currency,
    rhythm: shape.rhythm,
    typical,
    // (whole-number arithmetic: |size - typical| > 5% of typical)
    varies: sizes.some((s) => Math.abs(s - typical) * 20 > typical),
    count: charges.length,
    first: charges[0]!.posted,
    last,
    next,
    active: daysBetween(last, asOf) <= Math.floor(shape.days * 1.5),
    yearly: typical * shape.perYear,
    ids: charges.map((c) => c.id),
  };
}

/**
 * The recurring charges among `charges`, as of the day `asOf` (the user's today; it only decides
 * `active`). Money in, and anything the caller left out (moves between the user's own accounts),
 * is not looked at. Still-going ones come first, then the most expensive over a year.
 */
export function findRecurring(charges: readonly Charge[], asOf: Day): Recurring[] {
  const groups = new Map<string, Charge[]>();
  for (const c of charges) {
    if (!(c.amount < 0) || fold(c.merchant) === "") continue;
    const key = `${c.currency}|${fold(c.merchant)}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  const byDay = (a: Charge, b: Charge): number => (a.posted < b.posted ? -1 : a.posted > b.posted ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const found: Recurring[] = [];
  for (const group of groups.values()) {
    const { merchant, currency } = group[0]!;
    // 1. price groups: amounts within 5% of the group's lowest
    const bySize = [...group].sort((a, b) => sized(a) - sized(b) || byDay(a, b));
    const left: Charge[] = [];
    for (let i = 0; i < bySize.length; ) {
      const lowest = sized(bySize[i]!);
      let j = i;
      while (j < bySize.length && sized(bySize[j]!) * 20 <= lowest * 21) j++;
      const priced = bySize.slice(i, j).sort(byDay);
      const shape = rhythmOf(priced, true);
      if (shape) found.push(describe(merchant, currency, priced, shape, asOf));
      else left.push(...priced);
      i = j;
    }
    // 2. what is left, as one bill whose amount varies
    left.sort(byDay);
    const shape = rhythmOf(left, false);
    if (shape) {
      const bill = describe(merchant, currency, left, shape, asOf);
      if (left.every((c) => sized(c) * 3 >= bill.typical && sized(c) <= bill.typical * 3)) found.push(bill);
    }
  }
  return found.sort((a, b) => Number(b.active) - Number(a.active) || b.yearly - a.yearly || (a.merchant < b.merchant ? -1 : a.merchant > b.merchant ? 1 : 0) || (a.first < b.first ? -1 : 1));
}
