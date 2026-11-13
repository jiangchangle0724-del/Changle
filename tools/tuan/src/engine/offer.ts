// Starting a group buy: the document a merchant sends, checked and tidied. Pure rules; the server
// gives the parts their ids and keeps them (src/server/store.ts).
import { MILLI, QTY_MAX } from "./money";
import { cleanLine, cleanLines } from "./text";
import { isUnit, weighed, type DeliveryRule, type Item, type PickupPoint, type Roster } from "./types";

export const TITLE_MAX = 60;
export const OFFER_NOTE_MAX = 2000;
export const ITEMS_MAX = 200;
export const PLACES_MAX = 12;
/** A group buy closes within this long of being made. */
export const OPEN_FOR_MAX_MS = 90 * 86_400_000;
/** $10,000.00: the most one unit, a minimum or a delivery fee may be. */
export const MONEY_MAX = 1_000_000;
/** The most of one thing a group buy may list: 100,000 units. */
export const STOCK_MAX = 100_000 * MILLI;
/** Steps a weighed item may be sold in: quarter, half and whole pounds. */
export const WEIGHED_STEPS: readonly number[] = [250, 500, 1000];

export type NewItem = Omit<Item, "id" | "sold">;
export type NewPoint = Omit<PickupPoint, "id">;
export type NewRule = Omit<DeliveryRule, "id">;

/** A group buy ready to keep. */
export interface NewOffer {
  title: string;
  note: string;
  closesAt: number;
  roster: Roster;
  /** taking orders at once, or kept as a draft only the merchant sees */
  open: boolean;
  items: NewItem[];
  points: NewPoint[];
  rules: NewRule[];
}

export type OfferError =
  | "bad" // not a group buy at all
  | "title"
  | "closes" // no closing time, one already past, or one too far off
  | "items" // none, or too many
  | "item" // one of them is wrong (at: which, counting from 0)
  | "places" // nowhere to pick up and no delivery, or too many
  | "place"; // one of them is wrong (at: which, pickup points first)

export type ReadOffer = { ok: true; offer: NewOffer } | { ok: false; error: OfferError; at?: number };

const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function readItem(input: unknown): NewItem | null {
  const raw = record(input);
  if (!raw) return null;
  const name = cleanLine(raw.name, 60);
  if (!name || !whole(raw.price, 0, MONEY_MAX)) return null;
  const unit = raw.unit ?? "each";
  if (!isUnit(unit)) return null;
  // whole things come one at a time; weight comes by the half pound unless the merchant says otherwise
  const step = raw.step ?? (weighed(unit) ? 500 : MILLI);
  if (!whole(step, 1, MILLI) || (weighed(unit) ? !WEIGHED_STEPS.includes(step) : step !== MILLI)) return null;
  const stock = raw.stock ?? null;
  if (stock !== null && (!whole(stock, 0, STOCK_MAX) || stock % step !== 0)) return null;
  // one step is the least anyone can order, unless the merchant sets the bar higher (no less than a pound, say)
  const least = raw.least ?? step;
  if (!whole(least, step, QTY_MAX) || least % step !== 0) return null;
  const perBuyer = raw.perBuyer ?? null;
  if (perBuyer !== null && (!whole(perBuyer, least, QTY_MAX) || perBuyer % step !== 0)) return null;
  return {
    section: cleanLine(raw.section, 30) ?? "",
    name,
    detail: cleanLines(raw.detail, 300),
    photo: null, // pictures come with the merchant's own editor
    price: raw.price,
    unit,
    step,
    least,
    stock,
    perBuyer,
    allergens: cleanLine(raw.allergens, 120) ?? "",
  };
}

function readPoint(input: unknown): NewPoint | null {
  const raw = record(input);
  const name = raw && cleanLine(raw.name, 40);
  return raw && name ? { name, address: cleanLines(raw.address, 200), hours: cleanLine(raw.hours, 120) ?? "" } : null;
}

function readRule(input: unknown): NewRule | null {
  const raw = record(input);
  const label = raw && cleanLine(raw.label, 60);
  if (!raw || !label) return null;
  const min = raw.min ?? 0;
  const fee = raw.fee ?? 0;
  if (!whole(min, 0, MONEY_MAX) || !whole(fee, 0, MONEY_MAX)) return null;
  // free delivery from so much: only means something where there is a fee
  const freeFrom = raw.freeFrom ?? null;
  if (freeFrom !== null && !whole(freeFrom, 1, MONEY_MAX)) return null;
  return { label, min, fee, freeFrom: fee > 0 ? freeFrom : null, hours: cleanLine(raw.hours, 120) ?? "" };
}

/** Check a group buy as a merchant sent it. */
export function readOffer(input: unknown, now: number): ReadOffer {
  const raw = record(input);
  if (!raw) return { ok: false, error: "bad" };
  const title = cleanLine(raw.title, TITLE_MAX);
  if (!title) return { ok: false, error: "title" };
  if (!whole(raw.closesAt, now + 1, now + OPEN_FOR_MAX_MS)) return { ok: false, error: "closes" };
  const roster = raw.roster ?? "names";
  if (roster !== "names" && roster !== "anon" && roster !== "off") return { ok: false, error: "bad" };

  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > ITEMS_MAX) return { ok: false, error: "items" };
  const items: NewItem[] = [];
  for (const [at, one] of raw.items.entries()) {
    const item = readItem(one);
    if (!item) return { ok: false, error: "item", at };
    items.push(item);
  }

  const rawPoints: unknown[] = Array.isArray(raw.points) ? raw.points : [];
  const rawRules: unknown[] = Array.isArray(raw.rules) ? raw.rules : [];
  if (rawPoints.length + rawRules.length === 0 || rawPoints.length > PLACES_MAX || rawRules.length > PLACES_MAX) return { ok: false, error: "places" };
  const points: NewPoint[] = [];
  for (const [at, one] of rawPoints.entries()) {
    const point = readPoint(one);
    if (!point) return { ok: false, error: "place", at };
    points.push(point);
  }
  const rules: NewRule[] = [];
  for (const [at, one] of rawRules.entries()) {
    const rule = readRule(one);
    if (!rule) return { ok: false, error: "place", at: rawPoints.length + at };
    rules.push(rule);
  }

  return { ok: true, offer: { title, note: cleanLines(raw.note, OFFER_NOTE_MAX), closesAt: raw.closesAt, roster, open: raw.open !== false, items, points, rules } };
}
