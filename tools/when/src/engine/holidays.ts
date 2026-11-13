import type { Day } from "./types";
import { addDays, weekday } from "./time";

export type Holiday = {
  day: Day;
  zh: string;
  en: string;
  /** "stat": a B.C. statutory holiday; "festival": a gathering day, not a day off. */
  kind: "stat" | "festival";
  /** The official page used to establish the date. */
  source: string;
};

const BC = "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/statutory-holidays";
const BC_RULES = "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-5-section-44";
const HKO_2027 = "https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt";
const HKO_2028 = "https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2028e.txt";
const HALLOWEEN = "https://www2.gov.bc.ca/assets/gov/driving-and-transportation/driving/roadsafetybc/campaign-calendar-2026_upd.pdf";
const EVES = "https://www.canada.ca/content/dam/ircc/migration/ircc/english/resources/manuals/ip/ip03-appa-eng.pdf";
const BOXING_DAY = "https://www.alberta.ca/alberta-general-holidays";

const stat = (day: Day, zh: string, en: string, source = BC): Holiday => ({ day, zh, en, kind: "stat", source });
const festival = (day: Day, zh: string, en: string, source: string): Holiday => ({ day, zh, en, kind: "festival", source });

// Checked against official pages on 2026-11-13. B.C.'s date table currently ends in 2027;
// 2028 uses its published rules above. The shared movable dates, including Good Friday
// (April 14), were cross-checked at https://www.alberta.ca/alberta-general-holidays .
// Lunar dates use the HKO calendar date, not an instant converted to Vancouver time:
// New Year's Eve is the last day of month 12; the other festivals are 1/1, 1/15, 5/5, 8/15.
// In 2028 there is a leap fifth month: Dragon Boat is in the first fifth month, May 28.
/** Every holiday and festival from 2026-11-01 through 2028-12-31, in date order. */
export const HOLIDAYS: readonly Holiday[] = [
  stat("2026-11-11", "国殇日", "Remembrance Day"),
  festival("2026-12-24", "平安夜", "Christmas Eve", EVES),
  stat("2026-12-25", "圣诞节", "Christmas Day"),
  festival("2026-12-26", "节礼日", "Boxing Day", BOXING_DAY),
  festival("2026-12-31", "跨年夜", "New Year's Eve", EVES),

  stat("2027-01-01", "元旦", "New Year's Day"),
  festival("2027-02-05", "除夕", "Lunar New Year's Eve", HKO_2027),
  festival("2027-02-06", "春节", "Lunar New Year", HKO_2027),
  stat("2027-02-15", "家庭日", "Family Day"),
  festival("2027-02-20", "元宵节", "Lantern Festival", HKO_2027),
  stat("2027-03-26", "耶稣受难日", "Good Friday"),
  stat("2027-05-24", "维多利亚日", "Victoria Day"),
  festival("2027-06-09", "端午节", "Dragon Boat Festival", HKO_2027),
  stat("2027-07-01", "国庆日", "Canada Day"),
  stat("2027-08-02", "卑诗日", "B.C. Day"),
  stat("2027-09-06", "劳动节", "Labour Day"),
  festival("2027-09-15", "中秋节", "Mid-Autumn Festival", HKO_2027),
  stat("2027-09-30", "真相与和解日", "National Day for Truth and Reconciliation"),
  stat("2027-10-11", "感恩节", "Thanksgiving"),
  festival("2027-10-31", "万圣节", "Halloween", HALLOWEEN),
  stat("2027-11-11", "国殇日", "Remembrance Day"),
  festival("2027-12-24", "平安夜", "Christmas Eve", EVES),
  stat("2027-12-25", "圣诞节", "Christmas Day"),
  festival("2027-12-26", "节礼日", "Boxing Day", BOXING_DAY),
  festival("2027-12-31", "跨年夜", "New Year's Eve", EVES),

  stat("2028-01-01", "元旦", "New Year's Day", BC_RULES),
  festival("2028-01-25", "除夕", "Lunar New Year's Eve", HKO_2028),
  festival("2028-01-26", "春节", "Lunar New Year", HKO_2028),
  festival("2028-02-09", "元宵节", "Lantern Festival", HKO_2028),
  stat("2028-02-21", "家庭日", "Family Day", BC_RULES),
  stat("2028-04-14", "耶稣受难日", "Good Friday", BC_RULES),
  stat("2028-05-22", "维多利亚日", "Victoria Day", BC_RULES),
  festival("2028-05-28", "端午节", "Dragon Boat Festival", HKO_2028),
  stat("2028-07-01", "国庆日", "Canada Day", BC_RULES),
  stat("2028-08-07", "卑诗日", "B.C. Day", BC_RULES),
  stat("2028-09-04", "劳动节", "Labour Day", BC_RULES),
  stat("2028-09-30", "真相与和解日", "National Day for Truth and Reconciliation", BC_RULES),
  festival("2028-10-03", "中秋节", "Mid-Autumn Festival", HKO_2028),
  stat("2028-10-09", "感恩节", "Thanksgiving", BC_RULES),
  festival("2028-10-31", "万圣节", "Halloween", HALLOWEEN),
  stat("2028-11-11", "国殇日", "Remembrance Day", BC_RULES),
  festival("2028-12-24", "平安夜", "Christmas Eve", EVES),
  stat("2028-12-25", "圣诞节", "Christmas Day", BC_RULES),
  festival("2028-12-26", "节礼日", "Boxing Day", BOXING_DAY),
  festival("2028-12-31", "跨年夜", "New Year's Eve", EVES),
];

/** All rows on this Vancouver calendar day, including any coinciding festivals. */
export function holidaysOn(day: Day): Holiday[] {
  return HOLIDAYS.filter((holiday) => holiday.day === day);
}

// Union the Friday-to-Sunday and Saturday-to-Monday spans. A Friday and a Monday
// on the same weekend would make four days. No bridge days or substitute Mondays.
const longWeekendDays = new Set<Day>();
for (const holiday of HOLIDAYS) {
  if (holiday.kind !== "stat") continue;
  const dow = weekday(holiday.day);
  if (dow !== 5 && dow !== 1) continue;
  for (let offset = dow === 5 ? 0 : -2; offset <= (dow === 5 ? 2 : 0); offset++) {
    longWeekendDays.add(addDays(holiday.day, offset));
  }
}

/** Whether a Friday or Monday statutory holiday extends this day's weekend. */
export function inLongWeekend(day: Day): boolean {
  return longWeekendDays.has(day);
}
