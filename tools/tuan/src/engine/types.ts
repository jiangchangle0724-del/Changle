// What a group buy is made of. Plain data: no browser and no Cloudflare in src/engine.
// Money is whole cents (CAD). Amounts of goods are whole thousandths of the item's unit
// (1500 = 1.5 lb, 2000 = 2 bags). Times are milliseconds since 1970.

/** How a thing is sold. Only "lb" is weighed: its price is per pound and its amount is an estimate until the merchant weighs it. */
export const UNITS = ["each", "box", "bag", "pack", "portion", "lb"] as const;
export type Unit = (typeof UNITS)[number];
export const isUnit = (value: unknown): value is Unit => (UNITS as readonly unknown[]).includes(value);
export const weighed = (unit: Unit): boolean => unit === "lb";

export const SHOP_KINDS = ["leader", "kitchen", "farm"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];
export type ShopStatus = "pending" | "live" | "paused";

export interface Shop {
  id: string;
  slug: string;
  name: string;
  kind: ShopKind;
  about: string;
  /** how a buyer reaches the merchant, as the merchant wrote it */
  contact: string;
  /** how to pay the merchant, as the merchant wrote it */
  pay: string;
  permit: string;
  status: ShopStatus;
}

export type OfferStatus = "draft" | "open" | "closed";
/** The public list of who's in: with names, numbered only, or not shown. */
export type Roster = "names" | "anon" | "off";

export interface Offer {
  id: string;
  shopId: string;
  title: string;
  note: string;
  status: OfferStatus;
  closesAt: number;
  roster: Roster;
}

export interface Item {
  id: string;
  section: string;
  name: string;
  detail: string;
  photo: string | null;
  /** cents for one unit */
  price: number;
  unit: Unit;
  /** the smallest change in amount: 1000 for whole things, 500 for half pounds */
  step: number;
  /** the least one order may take: a merchant who weighs by the half pound may still sell no less than a pound */
  least: number;
  /** how much there is, or null for no limit */
  stock: number | null;
  /** the most one buyer may take, or null for no limit */
  perBuyer: number | null;
  /** how much is in orders that stand */
  sold: number;
  allergens: string;
}

export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  hours: string;
}

export interface DeliveryRule {
  id: string;
  /** where it applies, as the merchant wrote it */
  label: string;
  /** cents of goods before delivery is offered */
  min: number;
  fee: number;
  /** cents of goods from which delivery is free, or null when the fee always applies */
  freeFrom: number | null;
  hours: string;
}

/** Everything a buyer's page needs to take an order. */
export interface OfferBook {
  shop: Shop;
  offer: Offer;
  items: Item[];
  points: PickupPoint[];
  rules: DeliveryRule[];
}

export type OrderStatus = "new" | "confirmed" | "cancelled";
export type How = "pickup" | "delivery";

export interface OrderLine {
  itemId: string;
  name: string;
  unit: Unit;
  price: number;
  /** how much was ordered */
  qty: number;
  /** how much it turned out to be once weighed, or null */
  actual: number | null;
}

export interface Order {
  code: string;
  offerId: string;
  /** its place in the offer's list */
  seq: number;
  name: string;
  phone: string;
  wechat: string;
  how: How;
  pickupId: string | null;
  ruleId: string | null;
  address: string;
  note: string;
  status: OrderStatus;
  paidAt: number | null;
  pickedAt: number | null;
  /** cents: the goods as ordered (an estimate for anything weighed) */
  goods: number;
  fee: number;
  /** cents: goods and fee once everything weighed has been weighed, or null */
  final: number | null;
  /** how many things, for the public list (anything weighed counts as one) */
  pieces: number;
  /** goes up with every change */
  rev: number;
  createdAt: number;
  updatedAt: number;
  lines: OrderLine[];
}
