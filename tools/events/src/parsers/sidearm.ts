// A SIDEARM Sports athletics calendar (iCal): UBC's Thunderbirds (gothunderbirds.ca) and SFU's
// Red Leafs (athletics.sfu.ca). The whole season comes in one answer, home and away, about 250
// games; each names its city, then its venue ("Vancouver\, B.C., War Memorial Gymnasium"). Facts
// only: which to keep is the source's call (src/sources.ts: the games in Greater Vancouver).
import type { NormalizedEvent, Place } from "../types";
import { parseIcal } from "./ical";

const DAY = 86_400_000;
const icalDay = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

/**
 * The calendar with only the games that start in the window (a day either side, for the time
 * zones): ical.js takes about 18 ms for the whole season, more than a step's 10 ms of CPU, and
 * about 2 ms for two weeks of it.
 */
export function inWindow(raw: string, fromMs: number, toMs: number): string {
  const first = raw.indexOf("BEGIN:VEVENT");
  if (first < 0) return raw;
  const head = raw.slice(0, first);
  const [from, to] = [icalDay(fromMs - DAY), icalDay(toMs + DAY)];
  const kept = raw
    .slice(first)
    .split(/(?=BEGIN:VEVENT)/)
    .map((block) => block.slice(0, block.indexOf("END:VEVENT") + "END:VEVENT".length))
    .filter((block) => {
      const day = /^DTSTART[^:\r\n]*:(\d{8})/m.exec(block)?.[1];
      return !!day && day >= from && day <= to;
    });
  return `${head}${kept.join("\r\n")}\r\nEND:VCALENDAR\r\n`;
}

/** "Vancouver, B.C., War Memorial Gymnasium": the venue (when there is one) in its city. */
export function sidearmPlace(location: string): Place | null {
  const [city, region, ...rest] = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (!city) return null;
  const venue = rest.join(", ") || null;
  const province = region && /^b\.?\s?c\.?$/i.test(region) ? "BC" : region;
  return { name: venue ?? city, address: [venue, city, province].filter(Boolean).join(", "), city, postalCode: null };
}

/** Each game's LOCATION as it's written, by UID (the parsed place has it split the wrong way round). */
function locations(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of raw.replace(/\r?\n[ \t]/g, "").split(/^BEGIN:VEVENT\s*$/m).slice(1)) {
    const uid = /^UID:(.+)$/m.exec(block)?.[1]?.trim();
    const location = /^LOCATION[^:\r\n]*:(.*)$/m.exec(block)?.[1];
    if (uid && location) out.set(uid, location.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").trim());
  }
  return out;
}

/** "Simon Fraser University Basketball - M vs Alaska" reads "SFU Men's Basketball vs Alaska". */
export function sidearmTitle(title: string): string {
  const sfu = /^Simon Fraser University (.+?) - ([MW]) (vs\.?|at) (.+)$/.exec(title);
  if (sfu) return `SFU ${sfu[2] === "M" ? "Men's" : "Women's"} ${sfu[1]} ${sfu[3]} ${sfu[4]}`;
  return title.replace(/^Simon Fraser University\b/, "SFU");
}

/** The games starting in the window: each at its venue, as sport ("outdoors"), by `organizer`. */
export function parseSidearm(raw: string, opts: { source: string; fromMs: number; toMs: number; organizer: string }): NormalizedEvent[] {
  const text = inWindow(raw, opts.fromMs, opts.toMs);
  const where = locations(text);
  return parseIcal(text, { source: opts.source, fromMs: opts.fromMs, toMs: opts.toMs }).map((e) => {
    const location = where.get(e.sourceEventId.replace(/@\d{4}-\d{2}-\d{2}$/, ""));
    // the description only repeats the title and where to stream it
    return { ...e, title: sidearmTitle(e.title), place: location ? sidearmPlace(location) : e.place, category: "outdoors", organizer: opts.organizer, description: null };
  });
}
