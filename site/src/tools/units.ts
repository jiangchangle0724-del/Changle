/** Units of weight and volume for the unit-price tool, the linked fields' arithmetic, and which pack is the better buy. */

export type Unit = { id: string; zh: string; en: string; size: number };

/** sizes in kilograms */
export const MASS: Unit[] = [
  { id: "kg", zh: "公斤", en: "kg", size: 1 },
  { id: "lb", zh: "磅", en: "lb", size: 0.45359237 },
  { id: "jin", zh: "斤", en: "jīn 斤", size: 0.5 },
  { id: "oz", zh: "盎司", en: "oz", size: 0.028349523125 },
  { id: "100g", zh: "100 克", en: "100 g", size: 0.1 },
];
/** sizes in litres */
export const VOLUME: Unit[] = [
  { id: "l", zh: "升", en: "L", size: 1 },
  { id: "gal", zh: "美制加仑", en: "US gal", size: 3.785411784 },
  { id: "impgal", zh: "英制加仑", en: "UK gal", size: 4.54609 },
  { id: "floz", zh: "液量盎司", en: "fl oz", size: 0.0295735295625 },
  { id: "100ml", zh: "100 毫升", en: "100 mL", size: 0.1 },
];

/** sizes in items: eggs, rolls, cans, pods */
export const COUNT: Unit[] = [
  { id: "each", zh: "个", en: "item", size: 1 },
  { id: "dozen", zh: "打", en: "dozen", size: 12 },
  { id: "10", zh: "10 个", en: "10 items", size: 10 },
  { id: "100", zh: "100 个", en: "100 items", size: 100 },
];

/** What a pack's size is printed in: grams and millilitres first, then the units above. */
export const PACK_MASS: Unit[] = [{ id: "g", zh: "克", en: "g", size: 0.001 }, ...MASS.filter((u) => u.id !== "100g")];
export const PACK_VOLUME: Unit[] = [{ id: "ml", zh: "毫升", en: "mL", size: 0.001 }, ...VOLUME.filter((u) => u.id !== "100ml")];
export const PACK_COUNT: Unit[] = [
  { id: "each", zh: "个", en: "items", size: 1 },
  { id: "dozen", zh: "打", en: "dozen", size: 12 },
];

/** Weight, volume, or how many: things sold by the item (eggs, toilet rolls) since 2026-11-26. */
export type Kind = "mass" | "volume" | "count";
export const isKind = (s: unknown): s is Kind => s === "mass" || s === "volume" || s === "count";
export const UNITS: Record<Kind, Unit[]> = { mass: MASS, volume: VOLUME, count: COUNT };
export const PACK_UNITS: Record<Kind, Unit[]> = { mass: PACK_MASS, volume: PACK_VOLUME, count: PACK_COUNT };
/** What packs are compared per: a kilogram, a litre, an item. */
export const BASE: Record<Kind, { zh: string; en: string }> = { mass: { zh: "公斤", en: "kg" }, volume: { zh: "升", en: "L" }, count: { zh: "个", en: "item" } };

/** Price per kilogram or litre, from a price typed for one unit (0 while nothing is typed). */
export function perBaseOf(text: string, unit: Unit) {
  const n = Number(text || "0");
  return Number.isFinite(n) && n > 0 ? n / unit.size : 0;
}

/**
 * How many decimals a unit price is written with: the currency's own (2, or 0 for yen and won),
 * and more below a tenth of a dollar (ten yen), so 1.75 a gallon reads $0.0137 per fl oz rather
 * than $0.01: three significant digits, at most 6 decimals.
 */
export function figureDigits(v: number, decimals: number) {
  if (!(v > 0) || !Number.isFinite(v) || v >= 10 ** (1 - decimals)) return decimals;
  return Math.min(6, Math.max(decimals, Math.ceil(-Math.log10(v)) + 2));
}

/** A unit price as a field holds it once tapped: no thousands separators, trailing zeros trimmed down to the currency's own decimals. */
export function plainFigure(v: number, decimals: number) {
  if (!Number.isFinite(v)) return "";
  const s = Math.max(0, v).toFixed(figureDigits(v, decimals));
  const i = s.indexOf(".");
  if (i < 0) return s;
  let end = s.length;
  while (end > i + 1 + decimals && s[end - 1] === "0") end--;
  return s.slice(0, end === i + 1 ? i : end);
}

/** A pack on the shelf: its price, its size in one of the units, and how many come in it (a multipack: 355 mL × 12; empty is 1). */
export type Pack = { price: string; qty: string; unit: string; count?: string };

/** The most packs the comparison takes: the shelf's sizes, plus a deal or two. */
export const MAX_PACKS = 6;

/** Price per kilogram or litre of a pack, or null while its price or size is missing. */
export function perBase(p: Pack, units: Unit[]) {
  const unit = units.find((u) => u.id === p.unit) ?? units[0];
  const price = Number(p.price);
  const qty = Number(p.qty);
  const count = p.count ? Number(p.count) : 1;
  if (!p.price || !p.qty || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(count) || count <= 0) return null;
  return price / (qty * count * unit.size);
}

export type Ranking = {
  /** each pack's price per kilogram or litre, null while it isn't filled in */
  per: (number | null)[];
  /** null until two packs are filled in */
  verdict: {
    /** the cheapest, more than one when they're within half a percent of each other; every filled pack when all are */
    best: number[];
    /** the cheapest of the rest, what the saving is named against (as PriceGrab does); null when all cost the same */
    next: number | null;
    /** how much less the best costs than `next`, as a share of next's price, rounded down */
    pct: number;
    /** and per kilogram or litre */
    save: number;
  } | null;
};

/**
 * Which packs are the better buy, per kilogram or litre. Packs not filled in are left out; within
 * half a percent counts as the same price.
 */
export function rankPacks(packs: Pack[], units: Unit[]): Ranking {
  const per = packs.map((p) => perBase(p, units));
  const filled = per.flatMap((v, i) => (v === null ? [] : [i]));
  if (filled.length < 2) return { per, verdict: null };
  const low = Math.min(...filled.map((i) => per[i]!));
  const same = (v: number) => v <= 0 || (v - low) / v < 0.005;
  const best = filled.filter((i) => same(per[i]!));
  const rest = filled.filter((i) => !best.includes(i));
  if (!rest.length) return { per, verdict: { best, next: null, pct: 0, save: 0 } };
  const next = rest.reduce((a, b) => (per[b]! < per[a]! ? b : a));
  const high = per[next]!;
  // rounded down, so "20% less" is never more than the truth (and 99.9% never reads as 100%)
  return { per, verdict: { best, next, pct: Math.floor(((high - low) / high) * 100 + 1e-9), save: high - low } };
}
