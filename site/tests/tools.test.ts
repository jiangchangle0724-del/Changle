/*
 * The Tools tab's arithmetic (src/tools/money.ts, src/tools/tz.ts). Run with `npx tsx tests/tools.test.ts`
 *  1. Typed amounts: commas, Chinese punctuation, a second decimal point, letters; the digit cap.
 *  2. Conversion through per-USD rates, and the size step for long figures.
 *  3. The world clock: wall clocks and offsets in summer and winter, a time set in a city turned
 *     back into an instant (on ordinary days and across daylight-saving changes), the day label.
 *  4. Permanent time: British Columbia and Alberta stopped falling back on 2026-11-01. A phone
 *     whose time zone tables are older would show Vancouver at UTC−8 and Calgary at UTC−7 all
 *     winter; the clock corrects that, and believes the browser everywhere else.
 */
import { capDigits, cleanAmount, convert, CURRENCIES, CURRENCY_BY_CODE, DEFAULT_CODES, isCode, sizeClass } from "../src/tools/money";
import { dayDiff, offsetMin, partsIn, PERMANENT_TIME, permanentOffset, zonedToUtc } from "../src/tools/tz";
import { comparePacks, PACK_MASS, PACK_VOLUME, perBase } from "../src/tools/units";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const eq = (got: unknown, want: unknown, msg: string) => ok(got === want, `${msg} → ${JSON.stringify(got)}${got === want ? "" : `, wanted ${JSON.stringify(want)}`}`);

// 1. what's typed
eq(cleanAmount("1,234.5"), "1234.5", "a comma goes");
eq(cleanAmount("12。5"), "12.5", "a Chinese full stop is a point");
eq(cleanAmount("1.2.3"), "1.23", "only the first point counts");
eq(cleanAmount("abc"), "", "letters go");
eq(cleanAmount("-5"), "5", "no minus");
eq(cleanAmount(" 1 000 "), "1000", "spaces go");
eq(capDigits("1234567890123", 12), "123456789012", "13 digits cap at 12");
eq(capDigits("1234567890.12", 12), "1234567890.12", "12 digits with a point stay");
eq(capDigits("12345678901.234", 12), "12345678901.2", "the cap eats decimals first");
eq(capDigits("123456789012.34", 12), "123456789012", "a whole part at the cap drops the point");
eq(capDigits("12.", 9), "12.", "a trailing point stays while typing");
eq(capDigits("", 9), "", "empty stays empty");

// 2. conversion
const rates = { USD: 1, CAD: 1.4, CNY: 7.2, HKD: 7.8 };
ok(Math.abs(convert(rates, 100, "CAD", "CNY") - 514.2857) < 0.001, "100 CAD → 514.29 CNY at 1.4 and 7.2");
ok(Math.abs(convert(rates, 1, "USD", "HKD") - 7.8) < 1e-9, "1 USD → 7.8 HKD");
ok(Math.abs(convert(rates, 50, "HKD", "HKD") - 50) < 1e-9, "a currency to itself");
ok(Number.isNaN(convert(rates, 1, "CAD", "EUR")), "an unknown code is NaN, not 0");
eq(sizeClass("825,194.44"), "is-long", "10 characters step down once");
eq(sizeClass("1,500,000"), "", "9 characters stay full size");
eq(sizeClass("7,015,816,750.00"), "is-longer", "16 characters step down twice");
eq(sizeClass("1299.99", [6, 8]), "is-long", "the narrower price field steps down at 7 characters");
eq(sizeClass("129999.99", [6, 8]), "is-longer", "and twice at 9");

// 2a. the currency list
eq(new Set(CURRENCIES.map((c) => c.code)).size, CURRENCIES.length, "every code once");
ok(DEFAULT_CODES.every((c) => isCode(c)) && DEFAULT_CODES.length === 4, "the four default rows are real currencies");
ok(CURRENCIES.every((c) => c.zh && c.en && c.symbol && (c.decimals === 0 || c.decimals === 2)), "every currency has both names, a symbol and 0 or 2 decimals");
eq(CURRENCY_BY_CODE.JPY.decimals, 0, "yen without cents");
eq(CURRENCY_BY_CODE.KRW.decimals, 0, "won without cents");
ok(!isCode("EUR ") && !isCode("eur") && !isCode(42) && isCode("EUR"), "isCode is exact");
ok(Math.abs(convert({ USD: 1, CAD: 1.4, JPY: 155 }, 100, "CAD", "JPY") - 11071.43) < 0.01, "100 CAD → 11,071 JPY at 1.4 and 155");

// 2b. two packs, which is the better buy
const near = (got: number | null, want: number, msg: string) => ok(got !== null && Math.abs(got - want) < 0.005, `${msg} → ${got}`);
near(perBase({ price: "5.99", qty: "454", unit: "g" }, PACK_MASS), 13.19, "454 g for $5.99 is $13.19 per kg");
near(perBase({ price: "11.99", qty: "1", unit: "kg" }, PACK_MASS), 11.99, "1 kg for $11.99 is $11.99 per kg");
near(perBase({ price: "4.5", qty: "1", unit: "lb" }, PACK_MASS), 9.92, "a pound for $4.50 is $9.92 per kg");
near(perBase({ price: "3", qty: "2", unit: "jin" }, PACK_MASS), 3, "two 斤 for $3 is $3 per kg");
near(perBase({ price: "2.49", qty: "946", unit: "ml" }, PACK_VOLUME), 2.63, "946 mL for $2.49 is $2.63 per litre");
near(perBase({ price: "4", qty: "1", unit: "gal" }, PACK_VOLUME), 1.06, "a US gallon for $4 is $1.06 per litre");
eq(perBase({ price: "", qty: "454", unit: "g" }, PACK_MASS), null, "no price, no answer");
eq(perBase({ price: "5.99", qty: "0", unit: "g" }, PACK_MASS), null, "a zero size, no answer");
eq(perBase({ price: "5.99", qty: "454", unit: "nonsense" }, PACK_MASS), perBase({ price: "5.99", qty: "454", unit: "g" }, PACK_MASS), "an unknown unit counts as the first one");
const v1 = comparePacks({ price: "5.99", qty: "454", unit: "g" }, { price: "11.99", qty: "1", unit: "kg" }, PACK_MASS);
ok(v1?.better === "b" && v1.pct === 9, `454 g at $5.99 vs 1 kg at $11.99: B wins by 9% → ${JSON.stringify(v1)}`);
const v2 = comparePacks({ price: "10", qty: "1", unit: "kg" }, { price: "10.02", qty: "1", unit: "kg" }, PACK_MASS);
ok(v2?.better === "same" && v2.pct === 0, `$10 vs $10.02 per kg counts as the same → ${JSON.stringify(v2)}`);
const v3 = comparePacks({ price: "2", qty: "500", unit: "ml" }, { price: "5", qty: "1", unit: "l" }, PACK_VOLUME);
ok(v3?.better === "a" && v3.pct === 20, `500 mL at $2 vs 1 L at $5: A wins by 20% → ${JSON.stringify(v3)}`);
eq(comparePacks({ price: "2", qty: "", unit: "ml" }, { price: "5", qty: "1", unit: "l" }, PACK_VOLUME), null, "half filled in, no verdict yet");

// 3. the world clock
const T = Date.UTC(2026, 6, 15, 12, 0); // 2026-07-15 12:00Z, summer
const W = Date.UTC(2026, 0, 15, 12, 0); // 2026-01-15 12:00Z, winter
eq(offsetMin("Asia/Shanghai", T), 480, "China is UTC+8 in July");
eq(offsetMin("Asia/Shanghai", W), 480, "China is UTC+8 in January");
eq(offsetMin("Europe/London", T), 60, "London is UTC+1 in July");
eq(offsetMin("Europe/London", W), 0, "London is UTC in January");
eq(offsetMin("Australia/Sydney", T), 600, "Sydney is UTC+10 in July");
eq(offsetMin("Australia/Sydney", W), 660, "Sydney is UTC+11 in January");
eq(offsetMin("America/Los_Angeles", W), -480, "Los Angeles is UTC−8 in January");
eq(offsetMin("Asia/Kolkata", T), 330, "New Delhi is UTC+5:30");
const tokyo = partsIn("Asia/Tokyo", T);
ok(tokyo.year === 2026 && tokyo.month === 7 && tokyo.day === 15 && tokyo.hour === 21 && tokyo.minute === 0 && tokyo.weekday === 3, `Tokyo reads Wed 2026-07-15 21:00 → ${JSON.stringify(tokyo)}`);
const midnight = partsIn("Asia/Tokyo", Date.UTC(2026, 6, 15, 15, 0));
eq(midnight.hour, 0, "midnight is hour 0, never 24");
eq(midnight.day, 16, "and the next day");

// a wall clock back to an instant
eq(zonedToUtc("Asia/Tokyo", 2026, 7, 15, 21, 0), T, "Tokyo 21:00 on July 15 is 12:00Z");
eq(zonedToUtc("America/Los_Angeles", 2026, 1, 15, 4, 0), W, "Los Angeles 04:00 on January 15 is 12:00Z");
eq(zonedToUtc("Australia/Sydney", 2026, 1, 15, 23, 0), W, "Sydney 23:00 on January 15 is 12:00Z");
// London springs forward 2026-03-29 at 01:00 UTC and falls back 2026-10-25 at 01:00 UTC
eq(zonedToUtc("Europe/London", 2026, 3, 29, 0, 30), Date.UTC(2026, 2, 29, 0, 30), "London 00:30 just before springing forward");
eq(zonedToUtc("Europe/London", 2026, 3, 29, 3, 0), Date.UTC(2026, 2, 29, 2, 0), "London 03:00 just after springing forward");
eq(zonedToUtc("Europe/London", 2026, 10, 25, 3, 0), Date.UTC(2026, 9, 25, 3, 0), "London 03:00 after falling back");
const gap = zonedToUtc("Europe/London", 2026, 3, 29, 1, 30); // a time that never happened
ok(gap >= Date.UTC(2026, 2, 29, 0, 30) && gap <= Date.UTC(2026, 2, 29, 1, 30), "a time inside the spring-forward gap lands within the hour around it");
for (const tz of ["Asia/Tokyo", "Europe/Paris", "America/New_York", "Australia/Sydney", "Asia/Kolkata"]) {
  let bad = 0;
  for (let day = 0; day < 400; day += 7) {
    const ms = Date.UTC(2026, 0, 1, 9, 0) + day * 86400000;
    const p = partsIn(tz, ms);
    if (zonedToUtc(tz, p.year, p.month, p.day, p.hour, p.minute) !== ms) bad++;
  }
  eq(bad, 0, `${tz}: a shown time turned back into its instant, 58 weeks (mismatches)`);
}
const a = partsIn("Asia/Tokyo", Date.UTC(2026, 11, 31, 20, 0));
const b = partsIn("America/Vancouver", Date.UTC(2026, 11, 31, 20, 0));
eq(dayDiff(a, b), 1, "Tokyo is a day ahead of Vancouver across New Year");

// 4. permanent time in BC and Alberta
const van = PERMANENT_TIME["America/Vancouver"];
const edm = PERMANENT_TIME["America/Edmonton"];
eq(van.from, Date.UTC(2026, 10, 1, 9), "old tables fall back in Vancouver at 02:00 PDT on 2026-11-01");
eq(edm.from, Date.UTC(2026, 10, 1, 8), "old tables fall back in Calgary at 02:00 MDT on 2026-11-01");
eq(permanentOffset("America/Vancouver", Date.UTC(2026, 11, 1), -480), -420, "an old table's −8 for Vancouver in December becomes −7");
eq(permanentOffset("America/Edmonton", Date.UTC(2027, 0, 20), -420), -360, "an old table's −7 for Calgary in January becomes −6");
eq(permanentOffset("America/Vancouver", Date.UTC(2026, 11, 1), -420), null, "a table that already knows is left alone");
eq(permanentOffset("America/Vancouver", Date.UTC(2026, 6, 1), -420), null, "nothing changes before 2026-11-01");
eq(permanentOffset("America/Vancouver", van.from - 1, -480), null, "nor a millisecond before the old fall-back");
eq(permanentOffset("America/Vancouver", van.from, -480), -420, "but from that instant on");
eq(permanentOffset("America/Vancouver", Date.UTC(2031, 0, 1), -480), null, "after 2030 the browser is believed again");
eq(permanentOffset("America/Los_Angeles", Date.UTC(2026, 11, 1), -480), null, "Los Angeles still falls back");
eq(permanentOffset("America/Toronto", Date.UTC(2026, 11, 1), -300), null, "so does Toronto");
// whatever tables this machine has, the clocks come out right
eq(offsetMin("America/Vancouver", Date.UTC(2026, 11, 1, 20)), -420, "Vancouver on 2026-12-01 is UTC−7");
eq(offsetMin("America/Edmonton", Date.UTC(2026, 11, 1, 20)), -360, "Calgary on 2026-12-01 is UTC−6");
eq(offsetMin("America/Vancouver", Date.UTC(2027, 0, 15, 20)), -420, "Vancouver in January 2027 is UTC−7");
eq(offsetMin("America/Vancouver", Date.UTC(2027, 6, 15, 20)), -420, "and in July 2027");
eq(offsetMin("America/Los_Angeles", Date.UTC(2026, 11, 1, 20)), -480, "Seattle's side of the border is UTC−8 in December");
const dec = partsIn("America/Vancouver", Date.UTC(2026, 11, 1, 20, 30)); // 20:30Z
ok(dec.hour === 13 && dec.minute === 30 && dec.day === 1 && dec.weekday === 2, `Vancouver reads Tue 2026-12-01 13:30 at 20:30Z → ${JSON.stringify(dec)}`);
const cal = partsIn("America/Edmonton", Date.UTC(2027, 0, 1, 5, 0)); // 05:00Z
ok(cal.hour === 23 && cal.day === 31 && cal.month === 12 && cal.year === 2026 && cal.weekday === 4, `Calgary reads Thu 2026-12-31 23:00 at 05:00Z on New Year's Day → ${JSON.stringify(cal)}`);
eq(zonedToUtc("America/Vancouver", 2026, 12, 1, 13, 30), Date.UTC(2026, 11, 1, 20, 30), "Vancouver 13:30 on 2026-12-01 is 20:30Z");
eq(zonedToUtc("America/Edmonton", 2026, 12, 31, 23, 0), Date.UTC(2027, 0, 1, 5, 0), "Calgary 23:00 on New Year's Eve is 05:00Z");
eq(offsetMin("America/Vancouver", Date.UTC(2026, 10, 1, 9)) - offsetMin("America/Los_Angeles", Date.UTC(2026, 10, 1, 9)), 60, "from 2026-11-01 Vancouver is an hour ahead of Los Angeles");

// This machine's tables may already know; to see the correction itself at work, pretend Los Angeles
// (which really does fall back to −8) went permanent too, then take the pretence away.
PERMANENT_TIME["America/Los_Angeles"] = { from: Date.UTC(2026, 10, 1, 9), until: Date.UTC(2030, 0, 1), stale: -480, fixed: -420 };
eq(offsetMin("America/Los_Angeles", Date.UTC(2026, 11, 1, 20)), -420, "pretend-permanent Los Angeles: the −8 the tables give becomes −7");
const la = partsIn("America/Los_Angeles", Date.UTC(2026, 11, 1, 20, 30));
ok(la.hour === 13 && la.minute === 30 && la.day === 1 && la.month === 12 && la.weekday === 2, `pretend-permanent Los Angeles reads Tue 2026-12-01 13:30 at 20:30Z → ${JSON.stringify(la)}`);
const laMidnight = partsIn("America/Los_Angeles", Date.UTC(2026, 11, 2, 7, 0)); // 07:00Z = 00:00 at −7
ok(laMidnight.hour === 0 && laMidnight.day === 2 && laMidnight.weekday === 3, `pretend-permanent Los Angeles reads Wed 2026-12-02 00:00 at 07:00Z → ${JSON.stringify(laMidnight)}`);
eq(zonedToUtc("America/Los_Angeles", 2026, 12, 1, 13, 30), Date.UTC(2026, 11, 1, 20, 30), "pretend-permanent Los Angeles 13:30 is 20:30Z");
eq(offsetMin("America/Los_Angeles", Date.UTC(2026, 6, 1, 20)), -420, "pretend-permanent Los Angeles in July is −7 as before");
eq(offsetMin("America/Los_Angeles", Date.UTC(2026, 10, 1, 8, 59)), -420, "a minute before the old fall-back, still −7");
delete PERMANENT_TIME["America/Los_Angeles"];
eq(offsetMin("America/Los_Angeles", Date.UTC(2026, 11, 1, 20)), -480, "pretence over: Los Angeles is −8 again");

console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
