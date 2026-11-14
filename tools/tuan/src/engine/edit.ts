// Changing a group buy that is already kept. The merchant sends the same document as for starting
// one (src/engine/offer.ts), where every part that stays (an item, a pickup point, a delivery
// area) carries its id; a part without one is new, and a part that was there and isn't in the
// document goes. Orders hold on to the parts they name, so those can change but not go. Pure rules;
// the server keeps what comes out (src/server/store.ts).
import { readOffer, type NewItem, type NewPoint, type NewRule, type OfferError } from "./offer";
import type { OfferBook, Roster } from "./types";

/** The parts some order names (cancelled orders too: they still show what they held). */
export interface Used {
  items: ReadonlySet<string>;
  points: ReadonlySet<string>;
  rules: ReadonlySet<string>;
}

export type EditError =
  | OfferError
  | "busy" // it names a part that isn't there any more: someone else changed it, read it again
  | "inuse" // a part an order names would go
  | "sold"; // an item's limit would be less than what's already ordered (at: which item)

/** A part as it will be kept: under its own id, or new. */
export type Kept<T> = T & { id: string | null };

export interface Edit {
  title: string;
  note: string;
  closesAt: number;
  roster: Roster;
  /** a draft that starts taking orders with this change */
  publish: boolean;
  items: Kept<NewItem>[];
  points: Kept<NewPoint>[];
  rules: Kept<NewRule>[];
  /** the parts that go */
  gone: { items: string[]; points: string[]; rules: string[] };
}

export type PlanEdit = { ok: true; edit: Edit } | { ok: false; error: EditError; at?: number };

const idOf = (part: unknown): string | null => {
  const id = part && typeof part === "object" ? (part as { id?: unknown }).id : null;
  return typeof id === "string" && id !== "" ? id : null;
};
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Give each part of the document its id back, and find the parts that go. */
function settle<T>(sent: unknown[], parts: T[], there: readonly { id: string }[], used: ReadonlySet<string>): { list: Kept<T>[]; gone: string[] } | "busy" | "inuse" {
  const known = new Set(there.map((part) => part.id));
  const seen = new Set<string>();
  const list: Kept<T>[] = [];
  for (const [at, part] of parts.entries()) {
    const id = idOf(sent[at]);
    if (id !== null) {
      if (!known.has(id) || seen.has(id)) return "busy";
      seen.add(id);
    }
    list.push({ ...part, id });
  }
  const gone = there.filter((part) => !seen.has(part.id)).map((part) => part.id);
  return gone.some((id) => used.has(id)) ? "inuse" : { list, gone };
}

/** Check a change to a group buy against the group buy as it stands. */
export function planEdit(book: OfferBook, used: Used, input: unknown, now: number): PlanEdit {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  // a closing time left as it was is fine even when it has passed: the rest can still be put right
  const read = readOffer(input, raw.closesAt === book.offer.closesAt ? book.offer.closesAt - 1 : now);
  if (!read.ok) return read;
  const { offer } = read;

  const items = settle(listOf(raw.items), offer.items, book.items, used.items);
  if (typeof items === "string") return { ok: false, error: items };
  const points = settle(listOf(raw.points), offer.points, book.points, used.points);
  if (typeof points === "string") return { ok: false, error: points };
  const rules = settle(listOf(raw.rules), offer.rules, book.rules, used.rules);
  if (typeof rules === "string") return { ok: false, error: rules };

  const was = new Map(book.items.map((item) => [item.id, item]));
  for (const [at, item] of items.list.entries()) {
    const old = item.id === null ? undefined : was.get(item.id);
    if (!old) continue;
    // what's in orders was counted in the old unit
    if (used.items.has(old.id) && item.unit !== old.unit) return { ok: false, error: "item", at };
    if (item.stock !== null && item.stock < old.sold) return { ok: false, error: "sold", at };
  }

  return {
    ok: true,
    edit: {
      title: offer.title,
      note: offer.note,
      closesAt: offer.closesAt,
      roster: offer.roster,
      publish: book.offer.status === "draft" && raw.open === true,
      items: items.list,
      points: points.list,
      rules: rules.list,
      gone: { items: items.gone, points: points.gone, rules: rules.gone },
    },
  };
}
