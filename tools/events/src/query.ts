// The filters the API, the calendar feed and the preview share: from, to (YYYY-MM-DD), cat, area,
// tag (comma lists; values that aren't one of ours are ignored).
import { AREAS, CATEGORIES, TAGS, type Area, type Category, type PublicEvent, type Tag } from "./types";

export interface Query {
  from: string;
  to: string;
  cats: Category[];
  areas: Area[];
  tags: Tag[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A comma list from the query, keeping only the allowed values. */
function pick<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter((s): s is T => (allowed as readonly string[]).includes(s));
}

/** The filters in a query string. The dates default to the published window. */
export function readQuery(q: URLSearchParams, window: { from: string; to: string }): Query {
  return {
    from: DATE.test(q.get("from") ?? "") ? q.get("from")! : window.from,
    to: DATE.test(q.get("to") ?? "") ? q.get("to")! : window.to,
    cats: pick(q.get("cat"), CATEGORIES),
    areas: pick(q.get("area"), AREAS),
    tags: pick(q.get("tag"), TAGS),
  };
}

/** The Vancouver date of a start or end: "2026-11-10" from "2026-11-10T17:30:00-07:00" or from "2026-11-10". */
export const dayOf = (iso: string): string => iso.slice(0, 10);

/** The events on a day from `from` to `to`, in one of the categories and one of the areas asked for, with every tag asked for. */
export function filterEvents(events: PublicEvent[], q: Query): PublicEvent[] {
  return events.filter(
    (e) =>
      dayOf(e.start) <= q.to &&
      dayOf(e.end ?? e.start) >= q.from &&
      (!q.cats.length || (e.category !== null && q.cats.includes(e.category))) &&
      (!q.areas.length || (e.area !== null && q.areas.includes(e.area))) &&
      q.tags.every((t) => (t === "featured" ? e.featured : t === "free" ? e.isFree === true || e.tags.includes("free") : e.tags.includes(t))),
  );
}
