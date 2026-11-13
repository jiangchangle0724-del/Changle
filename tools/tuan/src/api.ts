// What goes between a phone and the server (/tuan/api/…): the shapes both sides agree on.
// A buyer signs in to nothing. A merchant sends their changle.ca session ("Authorization: Bearer …").
import type { OfferError } from "./engine/offer";
import type { RefusalCode } from "./engine/order";
import type { ShopError } from "./engine/shop";
import type { Summary } from "./engine/summary";
import type { DeliveryRule, How, Item, Offer, OfferStatus, Order, OrderLine, OrderStatus, PickupPoint, Roster, Shop, ShopKind, ShopStatus, Unit } from "./engine/types";

/** The last four digits of the buyer's phone number ride in this header: with the order's code, they open the order. */
export const TAIL_HEADER = "x-tail";

export type ApiErrorCode =
  | RefusalCode
  | OfferError
  | ShopError
  | "notfound"
  | "signin" // not signed in (or the sign-in has run out)
  | "forbidden" // signed in, but this isn't theirs
  | "limit" // too many from this network today
  | "locked" // too many wrong tries at this order today
  | "full" // the group buy has taken as many orders as one may
  | "paid" // paid for or handed over: only the merchant changes it now
  | "cancelled" // the order was cancelled: nothing more is done to it
  | "busy" // it changed while this was on its way: read it again
  | "down" // the accounts can't be reached just now
  | "failed"; // something went wrong on the server

export interface ApiError {
  error: ApiErrorCode;
  /** soldout, perbuyer: the items, and how much of each can still be taken */
  items?: { id: string; left: number }[];
  /** min: the least goods for delivery there, in cents */
  min?: number;
  /** item, place: which one, counting from 0 */
  at?: number;
}

// ---------- what a buyer sees ----------

/** A group buy as anyone sees it: open, closed (by the clock or by the merchant), or its shop isn't taking orders. */
export type OfferState = "open" | "closed" | "paused";

export interface ShopCard {
  slug: string;
  name: string;
  kind: ShopKind;
  about: string;
  contact: string;
  pay: string;
  permit: string;
}

export interface PublicItem {
  id: string;
  section: string;
  name: string;
  detail: string;
  photo: string | null;
  price: number;
  unit: Unit;
  step: number;
  /** the least one order may take */
  least: number;
  /** how much is left, or null for no limit */
  left: number | null;
  perBuyer: number | null;
  allergens: string;
}

/** One line of the public list of who's in. */
export interface RosterRow {
  seq: number;
  /** null when the merchant keeps the list nameless */
  name: string | null;
  pieces: number;
}

export interface OfferPage {
  shop: ShopCard;
  offer: { id: string; title: string; note: string; closesAt: number; state: OfferState; roster: Roster };
  items: PublicItem[];
  points: PickupPoint[];
  rules: DeliveryRule[];
  /** empty when the merchant doesn't show the list */
  roster: RosterRow[];
  /** orders that stand */
  orders: number;
  /** the server's clock, for the countdown */
  now: number;
}

/** Placing an order, and changing one (the phone number of an order can't be changed). */
export interface OrderInput {
  /** made by the phone, one per order: sending it twice makes one order */
  key: string;
  name: string;
  phone: string;
  wechat?: string;
  how: How;
  pickupId?: string;
  ruleId?: string;
  address?: string;
  note?: string;
  lines: { itemId: string; qty: number }[];
}

/** An order as its buyer sees it. */
export interface BuyerOrder {
  code: string;
  seq: number;
  name: string;
  /** the phone number's last four digits */
  tail: string;
  wechat: string;
  how: How;
  address: string;
  note: string;
  status: OrderStatus;
  paid: boolean;
  picked: boolean;
  goods: number;
  fee: number;
  final: number | null;
  createdAt: number;
  updatedAt: number;
  lines: (OrderLine & { amount: number })[];
}

export interface OrderPage {
  order: BuyerOrder;
  offer: { id: string; title: string; closesAt: number; state: OfferState };
  shop: Pick<ShopCard, "slug" | "name" | "contact" | "pay">;
  point: PickupPoint | null;
  rule: DeliveryRule | null;
  /** the buyer may still change or cancel it themselves */
  mayChange: boolean;
  now: number;
}

// ---------- what a merchant sees ----------

export interface Me {
  name: string;
  email: string;
  /** the site's owner: sets shops up, and may look after any of them */
  owner: boolean;
}

export interface MyOffer {
  id: string;
  title: string;
  status: OfferStatus;
  closesAt: number;
  /** orders that stand, and how many of them nobody has confirmed yet */
  orders: number;
  fresh: number;
  /** cents, as ordered: goods and delivery */
  total: number;
}

export interface MyShop {
  slug: string;
  name: string;
  kind: ShopKind;
  status: ShopStatus;
  offers: MyOffer[];
}

export interface MyHome {
  me: Me;
  shops: MyShop[];
  now: number;
}

/** One group buy with every order in it, cancelled ones too, and the sheets. Only for those who run the shop. */
export interface MyOfferPage {
  shop: Shop;
  offer: Offer;
  items: Item[];
  points: PickupPoint[];
  rules: DeliveryRule[];
  orders: Order[];
  summary: Summary;
  now: number;
}

/** What a merchant does to an order. */
export type OrderMove =
  | { do: "confirm" }
  | { do: "paid"; on: boolean }
  | { do: "picked"; on: boolean }
  | { do: "cancel" }
  /** what the scale said, for the weighed things in it (null: not weighed after all) */
  | { do: "weigh"; lines: { itemId: string; actual: number | null }[] };

/** What a merchant does to a group buy. */
export type OfferMove = { do: "open" } | { do: "close" };

/** A new group buy's id, or a shop's address. */
export interface Made {
  id: string;
}

/** An order after a merchant's move, as the merchant sees it. */
export interface Moved {
  order: Order;
}
