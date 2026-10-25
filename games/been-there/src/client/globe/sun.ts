// Where the sun is overhead right now, for the big screen's globe: its night side is the real one.

/**
 * The point on Earth with the sun straight overhead at `at` (ms since 1970, UTC). Latitude follows the
 * seasons, longitude the time of day, corrected by the equation of time. Good to about a degree,
 * plenty for a day/night line.
 */
export function subsolar(at: number): { lat: number; lon: number } {
  const year = new Date(at).getUTCFullYear();
  // Day of the year, with the hours as a fraction (1.5 is noon on 1 January).
  const day = (at - Date.UTC(year, 0, 0)) / 86_400_000;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  // Equation of time, in minutes: how far the real sun runs ahead of (or behind) the clock.
  const b = ((2 * Math.PI) / 364) * (day - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = (((at % 86_400_000) + 86_400_000) % 86_400_000) / 3_600_000;
  const lon = -15 * (hours - 12 + eot / 60);
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}
