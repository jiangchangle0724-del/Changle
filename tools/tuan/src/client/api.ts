// Talking to the server, and what this phone remembers: what's in the cart of each group buy, the
// name and phone number last ordered with, and the orders placed from here (each with the last
// four digits that open it). Nothing is kept anywhere else: a buyer has no account.
import { TAIL_HEADER, type ApiError, type Made, type Moved, type MyHome, type MyOfferDoc, type MyOfferPage, type OfferMove, type OfferPage, type OrderInput, type OrderMove, type OrderPage } from "../api";
import { BASE } from "../base";
import type { How } from "../engine/types";

const memory = new Map<string, string>();
const read = (name: string): string | null => {
  try {
    return localStorage.getItem(name) ?? memory.get(name) ?? null;
  } catch {
    return memory.get(name) ?? null;
  }
};
const write = (name: string, value: string): void => {
  memory.set(name, value);
  try {
    localStorage.setItem(name, value);
  } catch {
    // private mode: it lasts as long as the page
  }
};
function readJson<T>(name: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(read(name) ?? "null");
    return value === null || typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback) ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

// ---------- what this phone remembers ----------

/** A cart: how much of each item, in thousandths of its unit. */
export type Cart = Record<string, number>;
export const savedCart = (offerId: string): Cart => readJson<Cart>(`tuan.cart.${offerId}`, {});
export const saveCart = (offerId: string, cart: Cart): void => write(`tuan.cart.${offerId}`, JSON.stringify(cart));

/** What was last typed at checkout, to save typing it again. */
export interface Me {
  name: string;
  phone: string;
  wechat: string;
  how: How | "";
  address: string;
}
export const savedMe = (): Me => ({ name: "", phone: "", wechat: "", how: "", address: "", ...readJson<Partial<Me>>("tuan.me", {}) });
export const saveMe = (me: Me): void => write("tuan.me", JSON.stringify(me));

/** A group buy a merchant is still writing for a shop, kept on this phone until it's sent: a form this long shouldn't be lost to a phone call. */
export function savedDraft<T extends object>(slug: string): T | null {
  const kept = readJson<Record<string, unknown>>(`tuan.new.${slug}`, {});
  return Object.keys(kept).length ? (kept as T) : null;
}
export const saveDraft = (slug: string, draft: object): void => write(`tuan.new.${slug}`, JSON.stringify(draft));
export function dropDraft(slug: string): void {
  try {
    localStorage.removeItem(`tuan.new.${slug}`);
  } catch {
    // private mode: there was nothing kept
  }
}

/** An order placed from this phone. */
export interface Mine {
  code: string;
  /** the last four digits of the phone number it was placed with: they open it */
  tail: string;
  offerId: string;
  title: string;
  shop: string;
  at: number;
}
export function myOrders(): Mine[] {
  return readJson<Mine[]>("tuan.orders", []).filter((o) => o && typeof o.code === "string" && typeof o.tail === "string");
}
/** Newest first, thirty at most. */
export function rememberOrder(order: Mine): void {
  write("tuan.orders", JSON.stringify([order, ...myOrders().filter((o) => o.code !== order.code)].slice(0, 30)));
}
export const tailOf = (code: string): string | null => myOrders().find((o) => o.code === code)?.tail ?? null;

/** A key for one order, made once: sending the order twice makes one order. */
export function newKey(): string {
  let text = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(18))) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- the server ----------

/** An answer that wasn't the thing asked for; `network` when the server couldn't be reached at all. */
export class ApiFail extends Error {
  constructor(
    public readonly code: ApiError["error"] | "network",
    public readonly detail: Omit<ApiError, "error"> = {},
  ) {
    super(code);
  }
}

/**
 * The sign-in the site keeps on this phone once someone has signed in at changle.ca
 * (site/src/lib/api.ts). These pages are at the same address, so they share its storage: a
 * merchant signed in on the site is signed in here. Empty when nobody is.
 */
export function session(): string {
  try {
    return localStorage.getItem("changle.session") ?? "";
  } catch {
    return "";
  }
}

async function ask<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; tail?: string; signedIn?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.tail ? { [TAIL_HEADER]: init.tail } : {}),
        // (a merchant's own pages only: a buyer's requests never carry it)
        ...(init.signedIn ? { authorization: `Bearer ${session()}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiFail("network");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiFail(res.ok ? "failed" : res.status === 429 ? "limit" : "failed");
  }
  if (!res.ok) {
    const { error, ...detail } = data as ApiError;
    throw new ApiFail(error ?? "failed", detail);
  }
  return data as T;
}

export const getOffer = (offerId: string): Promise<OfferPage> => ask(`/offers/${offerId}`);
export const placeOrder = (offerId: string, order: OrderInput): Promise<OrderPage> => ask(`/offers/${offerId}/orders`, { method: "POST", body: order });
export const getOrder = (code: string, tail: string): Promise<OrderPage> => ask(`/orders/${code}`, { tail });
export const changeOrder = (code: string, tail: string, order: OrderInput): Promise<OrderPage> => ask(`/orders/${code}`, { method: "POST", body: order, tail });
export const cancelOrder = (code: string, tail: string): Promise<OrderPage> => ask(`/orders/${code}/cancel`, { method: "POST", body: {}, tail });

// ---------- a merchant, signed in with their changle.ca account ----------

export const getMy = (): Promise<MyHome> => ask("/my", { signedIn: true });
export const getMyOffer = (offerId: string): Promise<MyOfferPage> => ask(`/my/offers/${offerId}`, { signedIn: true });
export const moveOffer = (offerId: string, move: OfferMove): Promise<MyOfferPage> => ask(`/my/offers/${offerId}`, { method: "POST", body: move, signedIn: true });
export const moveOrder = (code: string, move: OrderMove): Promise<Moved> => ask(`/my/orders/${code}`, { method: "POST", body: move, signedIn: true });
/** A group buy as its document, each part under its id: to change it, or to start the next one from. */
export const getMyDoc = (offerId: string): Promise<MyOfferDoc> => ask(`/my/offers/${offerId}/doc`, { signedIn: true });
/** Change a group buy: the whole document again, the parts that stay under their ids (src/engine/edit.ts). */
export const saveMyDoc = (offerId: string, doc: unknown): Promise<MyOfferDoc> => ask(`/my/offers/${offerId}/doc`, { method: "POST", body: doc, signedIn: true });
/** Start a group buy in a shop from the document a merchant sends (src/engine/offer.ts says what's in it). */
export const startOffer = (slug: string, offer: unknown): Promise<Made> => ask(`/my/shops/${slug}/offers`, { method: "POST", body: offer, signedIn: true });
/** The site's owner only: set a shop up, or change one (src/engine/shop.ts). */
export const saveShop = (shop: unknown): Promise<Made> => ask("/admin/shops", { method: "POST", body: shop, signedIn: true });

/** Copy text; false when the phone won't (an old WeChat), so the page can show it to copy by hand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.className = "copy-scratch";
      scratch.setAttribute("readonly", "");
      document.body.appendChild(scratch);
      scratch.select();
      const done = document.execCommand("copy");
      scratch.remove();
      return done;
    } catch {
      return false;
    }
  }
}
