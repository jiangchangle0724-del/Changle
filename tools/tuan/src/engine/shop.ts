// A shop, as the owner of the site sets it up by hand (merchants applying for themselves comes
// later). Pure rules; the server keeps it (src/server/store.ts).
import { SLUG_RE } from "./ids";
import { cleanLine, cleanLines } from "./text";
import { SHOP_KINDS, type ShopKind, type ShopStatus } from "./types";

export const MEMBERS_MAX = 10;
/** An email address, loosely: the accounts themselves were checked when they signed up. */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export interface NewShop {
  slug: string;
  name: string;
  kind: ShopKind;
  about: string;
  contact: string;
  pay: string;
  permit: string;
  status: ShopStatus;
  /** the accounts that run it, by email, lower case */
  members: string[];
}

export type ShopError = "bad" | "slug" | "name" | "members";
export type ReadShop = { ok: true; shop: NewShop } | { ok: false; error: ShopError };

/** Check a shop as the owner sent it. */
export function readShop(input: unknown): ReadShop {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "bad" };
  const raw = input as Record<string, unknown>;
  if (typeof raw.slug !== "string" || !SLUG_RE.test(raw.slug)) return { ok: false, error: "slug" };
  const name = cleanLine(raw.name, 40);
  if (!name) return { ok: false, error: "name" };
  const kind = raw.kind ?? "leader";
  if (!(SHOP_KINDS as readonly unknown[]).includes(kind)) return { ok: false, error: "bad" };
  const status = raw.status ?? "live";
  if (status !== "pending" && status !== "live" && status !== "paused") return { ok: false, error: "bad" };

  if (!Array.isArray(raw.members) || raw.members.length === 0 || raw.members.length > MEMBERS_MAX) return { ok: false, error: "members" };
  const members = new Set<string>();
  for (const one of raw.members as unknown[]) {
    const email = typeof one === "string" ? one.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return { ok: false, error: "members" };
    members.add(email);
  }

  return {
    ok: true,
    shop: {
      slug: raw.slug,
      name,
      kind: kind as ShopKind,
      about: cleanLines(raw.about, 600),
      contact: cleanLines(raw.contact, 300),
      pay: cleanLines(raw.pay, 600),
      permit: cleanLine(raw.permit, 200) ?? "",
      status,
      members: [...members],
    },
  };
}
