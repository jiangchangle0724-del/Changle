// Which of the 7 areas a place is in, by the city its address names (task C5 adds postal codes
// and the official boundaries for what this can't tell). Can't tell: Vancouver, flagged "待确认".
import type { Area, Place } from "./types";

const BY_CITY: [RegExp, Area][] = [
  [/^(north vancouver|west vancouver|n(orth)?\.? ?van|lions bay|bowen island)$/i, "north-shore"],
  [/^(vancouver|ubc|university endowment lands)$/i, "vancouver"],
  [/^richmond$/i, "richmond"],
  [/^burnaby$/i, "burnaby"],
  [/^(surrey|white rock|delta|ladner|tsawwassen)$/i, "surrey"],
  [/^(coquitlam|port coquitlam|port moody|new westminster|anmore|belcarra)$/i, "tri-cities"],
  [/^(langley|langley city|langley township|fort langley|maple ridge|pitt meadows|abbotsford|mission|chilliwack)$/i, "langley"],
];

export function areaOf(place: Place | null): { area: Area; check: boolean } {
  const city = place?.city?.trim();
  if (city) for (const [re, area] of BY_CITY) if (re.test(city)) return { area, check: false };
  return { area: "vancouver", check: true };
}
