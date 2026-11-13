// Vancouver time is UTC-7 all year: B.C. stopped changing its clocks on 8 March 2026. The offset is
// written once, here; nothing asks a phone's or the server's time-zone table (some still say UTC-8
// in winter). The same rule as 约时间 (tools/when/src/engine/time.ts).

const OFFSET_MS = -7 * 3_600_000;

/** The day in Vancouver at this moment: "2026-11-13". */
export const vancouverDay = (ms: number): string => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);

/** The day and the time on Vancouver's clock at this moment: "2026-11-13 15:26". */
export const vancouverClock = (ms: number): string => new Date(ms + OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");

/** The moment a Vancouver wall-clock time happens: vancouverTime("2026-11-20", 18, 0). */
export function vancouverTime(day: string, hour: number, minute = 0): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, minute) - OFFSET_MS;
}
