// Lookups derived from the board layout. Space indexes run 0..39 clockwise from Departure.
import { BOARD, CITIES, GROUPS, type City } from "./data";

export const BOARD_SIZE = BOARD.length;
export const IMMIGRATION = BOARD.findIndex((s) => s.k === "immigration");
export const LOUNGE = BOARD.findIndex((s) => s.k === "lounge");
export const ROUTE_SPACES = BOARD.map((s, i) => (s.k === "route" ? i : -1)).filter((i) => i >= 0);
export const SERVICE_SPACES = BOARD.map((s, i) => (s.k === "service" ? i : -1)).filter((i) => i >= 0);

/** The city on each space, or null for other spaces. */
export const CITY_AT: (City | null)[] = BOARD.map((s) => (s.k === "city" ? CITIES.find((c) => c.id === s.id)! : null));
/** Space index of each city id. */
export const CITY_SPACE: Record<string, number> = Object.fromEntries(
  BOARD.map((s, i): [string, number] => [s.k === "city" ? s.id : "", i]).filter(([id]) => id),
);
/** Space indexes of each colour group, in board order. */
export const GROUP_SPACES: Record<number, number[]> = Object.fromEntries(
  GROUPS.map((g) => [g.id, BOARD.map((s, i) => (s.k === "city" && CITY_AT[i]!.group === g.id ? i : -1)).filter((i) => i >= 0)]),
);
/** Spaces that can be owned: cities, routes and services. */
export const OWNABLE = BOARD.map((s) => s.k === "city" || s.k === "route" || s.k === "service");

export const EUROPE = 7;
export const ISTANBUL = CITY_SPACE.istanbul;
export const CAIRO = CITY_SPACE.cairo;

export const cityAt = (at: number): City | null => CITY_AT[at];
export const groupAt = (at: number): number | null => CITY_AT[at]?.group ?? null;

/** Decisions the whole table makes at once (votes or sealed bids). */
export const SIMULTANEOUS = new Set(["auction", "water", "scores", "freeze", "splash", "coe"]);
