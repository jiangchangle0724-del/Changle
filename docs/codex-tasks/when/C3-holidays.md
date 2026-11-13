# when-C3: holidays and festivals, November 2026 to the end of 2028

**Files:** `tools/when/src/engine/holidays.ts` (new) and `tools/when/tests/holidays.test.ts` (new).
**Command:** `npx tsx --test tests/holidays.test.ts`

The grid of days marks the ones people plan around: a statutory holiday, a long weekend, 春节,
中秋. This card is the list and two small lookups. It is looked up, not remembered: every row
carries the page it came from, and the reviewing chat opens those pages.

## Output

```ts
import type { Day } from "./types";

export type Holiday = {
  day: Day; // "2027-02-06"
  zh: string; // "春节"
  en: string; // "Lunar New Year"
  /** "stat": a statutory holiday in B.C. "festival": a day people gather, not a day off. */
  kind: "stat" | "festival";
  /** the page the date was read from */
  source: string;
};

/** Every row from 2026-11-01 to 2028-12-31, in date order. */
export const HOLIDAYS: readonly Holiday[];
/** The rows on one day (usually none; two when a festival lands on a holiday). */
export function holidaysOn(day: Day): Holiday[];
/** True on every day of a weekend that a statutory holiday makes three days or longer. */
export function inLongWeekend(day: Day): boolean;
```

## What goes in

- **B.C.'s statutory holidays**, all eleven, each year: New Year's Day, Family Day, Good Friday,
  Victoria Day, Canada Day, B.C. Day, Labour Day, National Day for Truth and Reconciliation,
  Thanksgiving, Remembrance Day, Christmas Day. Source: the B.C. government's own page on
  statutory holidays. Easter Monday and Boxing Day are not statutory holidays in B.C.
- **Festivals** (`kind: "festival"`): 除夕 (Lunar New Year's Eve), 春节 (Lunar New Year), 元宵节
  (Lantern Festival), 端午节 (Dragon Boat Festival), 中秋节 (Mid-Autumn Festival), and four that
  aren't days off in B.C.: Halloween, Christmas Eve, Boxing Day, New Year's Eve. For the lunar
  ones use the Hong Kong Observatory's Gregorian-Lunar calendar tables (or another official
  calendar) and give the page for that year.
- Chinese and English names as people here say them: 家庭日 / Family Day, 国庆日 / Canada Day,
  卑诗日 / B.C. Day, 真相与和解日 / National Day for Truth and Reconciliation, 国殇日 /
  Remembrance Day, 感恩节 / Thanksgiving, 耶稣受难日 / Good Friday, 维多利亚日 / Victoria Day,
  劳动节 / Labour Day, 元旦 / New Year's Day, 圣诞节 / Christmas Day.

## Long weekends

A statutory holiday on a Friday or a Monday makes a three-day weekend; one on a Thursday or a
Tuesday does not (no bridge days). When a statutory holiday falls on a Saturday or Sunday, B.C.'s
law names no replacement Monday: don't invent one. `inLongWeekend` is true for each of the three
(or four, when a Friday and a Monday holiday meet one weekend) days, and false everywhere else.

## Done when

- The test checks these, which follow from each holiday's rule: Family Day 2027-02-15, Good Friday
  2027-03-26, Victoria Day 2027-05-24, B.C. Day 2027-08-02, Labour Day 2027-09-06, Thanksgiving
  2027-10-11, and the fixed ones (Canada Day 07-01, 09-30, Remembrance Day 11-11, Christmas 12-25,
  New Year's Day 01-01) in each year.
- The test checks every lunar festival against the dates you found, and the PR lists them with
  their pages so the reviewing chat can open each one.
- `HOLIDAYS` is in date order with no day outside 2026-11-01 to 2028-12-31, every `source` is an
  `https://` address, and no row has an empty name.
- `inLongWeekend("2027-05-22")`, `("2027-05-23")` and `("2027-05-24")` are true (Victoria Day);
  `("2027-05-21")` and `("2027-05-25")` are false; `("2027-11-11")` is false (a Thursday).
- `npm run typecheck` and `npm test` pass.
