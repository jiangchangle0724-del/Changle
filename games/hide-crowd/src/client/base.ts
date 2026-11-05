// 藏在人群里 is one of changle.ca's games: it lives at changle.ca/hide, and a game is started from a
// changle.ca table (an online room there). Every page, file and server call of the game sits under
// BASE; the table it came from is where its back buttons lead.

export const BASE = "/hide";

/** On changle.ca itself (not a computer running the game on its own for development or tests). */
export const onChangle = () => typeof location !== "undefined" && /(^|\.)changle\.ca$/.test(location.hostname);

const TABLE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function session(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // no session storage: every visit counts as the first
  }
  return null;
}

/** The changle.ca table code: from the room, or from the link that brought this phone here. */
export function tableFrom(view: { table?: string | null } | null | undefined): string | null {
  if (view?.table && TABLE_RE.test(view.table)) return view.table;
  try {
    const asked = new URLSearchParams(location.search).get("table")?.toUpperCase();
    if (asked && TABLE_RE.test(asked)) {
      session("hc.table", asked);
      return asked;
    }
  } catch {
    // no address to read
  }
  const kept = session("hc.table");
  return kept && TABLE_RE.test(kept) ? kept : null;
}

/** The changle.ca table's page: a phone's seat there, or the big screen's. */
export const tableUrl = (table: string, screen = false) => (screen ? `/tv/${table}` : `/t/${table}`);

/** The link that brings someone new to this game: the table on changle.ca when there is one. */
export const joinUrl = (code: string, table: string | null) => (table ? `${location.origin}/t/${table}` : `${location.origin}${BASE}/r/${code}`);

/** This game's big screen, for a TV or a computer. */
export const screenUrl = (code: string, table: string | null) => `${BASE}/tv/${code}${table ? `?table=${table}` : ""}`;

/**
 * Go back to the changle.ca table. `over` tells the table the game has ended, so the host's phone
 * closes it there and everyone lands back in the table's lobby.
 */
export function backToTable(table: string, opts: { screen?: boolean; over?: string } = {}) {
  if (opts.over) session(opts.screen ? "hide.over.tv" : "hide.over", opts.over);
  location.href = tableUrl(table, opts.screen);
}

export type Route =
  | { kind: "home" }
  | { kind: "room"; code: string; role: "player" | "screen" }
  | { kind: "practice" }
  | { kind: "credits" };

/** Which page this is, from the address. */
export function routeOf(pathname: string): Route {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) || "/" : pathname;
  let match = /^\/tv\/(\d{4})\/?$/.exec(path);
  if (match) return { kind: "room", code: match[1], role: "screen" };
  match = /^\/r\/(\d{4})\/?$/.exec(path);
  if (match) return { kind: "room", code: match[1], role: "player" };
  if (/^\/practice\/?$/.test(path)) return { kind: "practice" };
  if (/^\/credits\/?$/.test(path)) return { kind: "credits" };
  return { kind: "home" };
}
