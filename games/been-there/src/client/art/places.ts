// What it's like to be in each city right now: its time zone (IANA names, as browsers know them),
// so the touchdown can show the real local time and a day, dusk or night sky.
export const TIME_ZONE: Record<string, string> = {
  cairo: "Africa/Cairo",
  capetown: "Africa/Johannesburg",
  buenosaires: "America/Argentina/Buenos_Aires",
  mexicocity: "America/Mexico_City",
  rio: "America/Sao_Paulo",
  istanbul: "Europe/Istanbul",
  mumbai: "Asia/Kolkata",
  dubai: "Asia/Dubai",
  lasvegas: "America/Los_Angeles",
  vancouver: "America/Vancouver",
  newyork: "America/New_York",
  tokyo: "Asia/Tokyo",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  bangkok: "Asia/Bangkok",
  sydney: "Australia/Sydney",
  singapore: "Asia/Singapore",
  venice: "Europe/Rome",
  paris: "Europe/Paris",
  london: "Europe/London",
  seoul: "Asia/Seoul",
  hongkong: "Asia/Hong_Kong",
};

export type Sky = "dawn" | "day" | "dusk" | "night";

/** Local time in a city ("21:04") and what its sky looks like, or null if the browser can't tell. */
export function localClock(id: string, at: number): { time: string; sky: Sky } | null {
  const timeZone = TIME_ZONE[id];
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).formatToParts(new Date(at));
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN) % 24;
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    if (Number.isNaN(hour)) return null;
    const sky: Sky = hour >= 5 && hour < 7 ? "dawn" : hour >= 7 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "dusk" : "night";
    return { time: `${String(hour).padStart(2, "0")}:${minute}`, sky };
  } catch {
    return null;
  }
}
