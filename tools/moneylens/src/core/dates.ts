/**
 * Days (ACC-5). A statement's date is a calendar day with no clock and no time zone, kept as
 * "YYYY-MM-DD" exactly as the bank wrote it. Nothing here builds a Date from a statement's text, so
 * a phone in another time zone reads the same day. Arithmetic is on day numbers (days since
 * 1970-01-01), worked out from the calendar's own rules.
 */

/** A calendar day, "YYYY-MM-DD". */
export type Day = string;

const leap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number): number => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;

/** The day for a year, month (1 to 12) and day of the month; null when there is no such day. Years 1900 to 2199 only: anything else on a statement is a misread. */
export function makeDay(y: number, m: number, d: number): Day | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Is this a real day, written "YYYY-MM-DD"? */
export function isDay(s: unknown): s is Day {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && makeDay(Number(m[1]), Number(m[2]), Number(m[3])) === s;
}

/** Days from 1970-01-01 to this day (the civil calendar, no time zone). */
export function dayNumber(day: Day): number {
  const y0 = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  // (Howard Hinnant's days_from_civil: years start in March, so the leap day comes last)
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The day that is `n` days after 1970-01-01. */
export function fromDayNumber(n: number): Day {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** How many days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: Day, b: Day): number => dayNumber(b) - dayNumber(a);

/** The day `n` days after `day`. */
export const addDays = (day: Day, n: number): Day => fromDayNumber(dayNumber(day) + n);

/** A day's month, "YYYY-MM". */
export const monthOf = (day: Day): string => day.slice(0, 7);

/** The order a file writes a date's numbers in: year first, month first (10/31/2026) or day first (31/10/2026). */
export type DateStyle = "YMD" | "MDY" | "DMY";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, janv: 1, janvier: 1,
  feb: 2, february: 2, fev: 2, fevr: 2, fevrier: 2,
  mar: 3, march: 3, mars: 3,
  apr: 4, april: 4, avr: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juil: 7, juillet: 7,
  aug: 8, august: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

/** A two-digit year as statements mean it: 00 to 79 is 20xx, 80 to 99 is 19xx. */
const fullYear = (text: string): number => (text.length <= 2 ? (Number(text) < 80 ? 2000 : 1900) + Number(text) : Number(text));

/**
 * A date as a statement writes it; null for anything that isn't one real day. With numbers only,
 * `style` says which comes first: "2026-10-31", "2026/10/31", "20261031" (YMD), "10/31/2026",
 * "10-31-26" (MDY), "31/10/2026", "31.10.2026" (DMY). A date with the month's name reads the same
 * whatever the style: "Oct 31, 2026", "31 Oct 2026", "31-OCT-26", "2026-Oct-31", "31 déc. 2026".
 */
export function parseDay(text: string, style: DateStyle): Day | null {
  if (typeof text !== "string" || text.length > 40) return null;
  const s = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const named = /^(?:(\d{1,4})[\s\-/.,]*)?([a-z]{3,9})\.?[\s\-/.,]*(\d{1,4})(?:[\s\-/.,]+(\d{1,4}))?$/.exec(s);
  if (named) {
    const month = MONTHS[named[2]!];
    if (!month) return null;
    const [before, first, second] = [named[1], named[3], named[4]];
    // month first: "oct 31, 2026". month in the middle: "31 oct 2026" or "2026 oct 31".
    if (before === undefined) return second === undefined ? null : makeDay(fullYear(second), month, Number(first));
    if (second !== undefined) return null;
    return before.length === 4 ? makeDay(Number(before), month, Number(first)) : makeDay(fullYear(first!), month, Number(before));
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compact) return style === "YMD" ? makeDay(Number(compact[1]), Number(compact[2]), Number(compact[3])) : null;
  const parts = /^(\d{1,4})[\-/. ](\d{1,2})[\-/. ](\d{1,4})$/.exec(s);
  if (!parts) return null;
  const [a, b, c] = [parts[1]!, parts[2]!, parts[3]!];
  if (style === "YMD") return a.length === 4 && c.length <= 2 ? makeDay(Number(a), Number(b), Number(c)) : null;
  if (a.length > 2 || c.length === 3 || c.length === 1) return null;
  return style === "MDY" ? makeDay(fullYear(c), Number(a), Number(b)) : makeDay(fullYear(c), Number(b), Number(a));
}

/**
 * The day in an OFX date ("20261031", "20261031120000", "20261031120000.000[-8:PST]"): its first
 * eight digits, as written. The clock and zone that may follow are left out on purpose: banks stamp
 * a posting date and then pad it with a time of their own choosing (midnight or noon, in GMT or
 * local), so shifting it into another zone would move some banks' lines to the day before.
 */
export function ofxDay(text: string): Day | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})/.exec(text ?? "");
  return m ? makeDay(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
