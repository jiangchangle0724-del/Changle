/** Units of weight and volume for the unit-price tool, and the arithmetic behind "which pack is the better buy". */

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

/** What a pack's size is printed in: grams and millilitres first, then the units above. */
export const PACK_MASS: Unit[] = [{ id: "g", zh: "克", en: "g", size: 0.001 }, ...MASS.filter((u) => u.id !== "100g")];
export const PACK_VOLUME: Unit[] = [{ id: "ml", zh: "毫升", en: "mL", size: 0.001 }, ...VOLUME.filter((u) => u.id !== "100ml")];

export type Pack = { price: string; qty: string; unit: string };

/** Price per kilogram or litre of a pack, or null while the price or the amount is missing. */
export function perBase(p: Pack, units: Unit[]) {
  const unit = units.find((u) => u.id === p.unit) ?? units[0];
  const price = Number(p.price);
  const qty = Number(p.qty);
  if (!p.price || !p.qty || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  return price / (qty * unit.size);
}

export type Verdict = { better: "a" | "b" | "same"; a: number; b: number; pct: number } | null;

/**
 * Which of two packs costs less per kilogram or litre, and by what share of the dearer one's
 * price. Within half a percent they count as the same; null until both packs are filled in.
 */
export function comparePacks(a: Pack, b: Pack, units: Unit[]): Verdict {
  const pa = perBase(a, units);
  const pb = perBase(b, units);
  if (pa === null || pb === null) return null;
  const high = Math.max(pa, pb);
  const pct = high > 0 ? ((high - Math.min(pa, pb)) / high) * 100 : 0;
  if (pct < 0.5) return { better: "same", a: pa, b: pb, pct: 0 };
  // rounded down, so "20% less" is never more than the truth (and 99.9% never reads as 100%)
  return { better: pa < pb ? "a" : "b", a: pa, b: pb, pct: Math.floor(pct + 1e-9) };
}
