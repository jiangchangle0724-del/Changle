// Vancouver time. Everything a person reads is in Vancouver's wall-clock time, with the offset in
// force on that day (-07:00 in summer, -08:00 in winter; the clocks went back on 2026-11-01).

export const TZ = "America/Vancouver";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface LocalParts {
  /** "2026-11-01" */
  date: string;
  hour: number;
  minute: number;
  second: number;
  /** Minutes east of UTC: -420 in summer, -480 in winter. */
  offset: number;
}

// The offset only changes on the hour, so it's looked up once an hour of time (Intl is slow: a step
// converts hundreds of times and has 10 ms of CPU in all).
const offsets = new Map<number, number>();

/** Vancouver's offset from UTC at an instant, in minutes (-420 in summer time). */
export function offsetAt(ms: number): number {
  const hour = Math.floor(ms / 3600_000);
  let off = offsets.get(hour);
  if (off === undefined) {
    const at = hour * 3600_000;
    const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    off = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at) / 60_000);
    if (offsets.size > 5000) offsets.clear();
    offsets.set(hour, off);
  }
  return off;
}

/** The Vancouver date and time of an instant (epoch ms). */
export function vanParts(ms: number): LocalParts {
  const offset = offsetAt(ms);
  const d = new Date(Math.floor(ms / 1000) * 1000 + offset * 60_000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), offset };
}

const two = (n: number) => String(Math.abs(n)).padStart(2, "0");

/** "2026-11-01T19:30:00-08:00": an instant as Vancouver wall-clock time with that day's offset. */
export function vanIso(ms: number): string {
  const p = vanParts(ms);
  const sign = p.offset < 0 ? "-" : "+";
  return `${p.date}T${two(p.hour)}:${two(p.minute)}:${two(p.second)}${sign}${two(Math.trunc(p.offset / 60))}:${two(p.offset % 60)}`;
}

/**
 * The instant of a Vancouver wall-clock time, "2026-11-01T10:15" (seconds optional). In the hour
 * the clocks go back (01:00 to 02:00 happens twice) it's the first one; in the hour they skip
 * forward it lands an hour later, as a clock would.
 */
export function fromVan(local: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  // Guess with the offset an hour either side, keep the one that reads back as this wall time.
  for (const probe of [wall - 12 * 3600_000, wall + 12 * 3600_000]) {
    const t = wall - vanParts(probe).offset * 60_000;
    const back = vanParts(t);
    if (Date.UTC(+back.date.slice(0, 4), +back.date.slice(5, 7) - 1, +back.date.slice(8, 10), back.hour, back.minute, back.second) === wall) return t;
  }
  return wall - vanParts(wall).offset * 60_000;
}

/** "2026-11-01" plus n days. */
export function addDays(date: string, n: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The window a run looks at: from the start of its Vancouver day to the end of the 14th day. */
export function windowOf(runId: string, days = 14): { from: string; to: string; fromMs: number; toMs: number } {
  const to = addDays(runId, days - 1);
  return { from: runId, to, fromMs: fromVan(runId), toMs: fromVan(addDays(to, 1)) };
}
