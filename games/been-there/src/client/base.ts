// 到此一游 is one of changle.ca's games: it lives at changle.ca/trip, and a game is started from a
// changle.ca table (an online room there). Every page, file and server call of the game sits under
// BASE; the table it came from is where its back buttons lead.

export const BASE = "/trip";

/** On changle.ca itself (not a computer running the game on its own for development or tests). */
export const onChangle = () => typeof location !== "undefined" && /(^|\.)changle\.ca$/.test(location.hostname);

const TABLE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/** The changle.ca table code, from the room or from the link that brought this phone here. */
export function tableFrom(view: { table?: string | null } | null | undefined): string | null {
  if (view?.table && TABLE_RE.test(view.table)) return view.table;
  try {
    const q = new URLSearchParams(location.search).get("table")?.toUpperCase();
    if (q && TABLE_RE.test(q)) {
      sessionStorage.setItem("bt.table", q);
      return q;
    }
    const kept = sessionStorage.getItem("bt.table");
    return kept && TABLE_RE.test(kept) ? kept : null;
  } catch {
    return null;
  }
}

/** The changle.ca table's page: a phone's seat there, or the big screen's. */
export const tableUrl = (table: string, screen = false) => (screen ? `/tv/${table}` : `/#/r/${table}`);

/** The link that brings someone new to this game: the table on changle.ca when there is one. */
export const joinUrl = (code: string, table: string | null) => (table ? `${location.origin}/#/r/${table}` : `${location.origin}${BASE}/r/${code}`);

/**
 * Go back to the changle.ca table. `over` tells the table this game has ended, so the host's phone
 * closes it there and everyone lands back in the table's lobby.
 */
export function backToTable(table: string, opts: { screen?: boolean; over?: string } = {}) {
  try {
    if (opts.over) sessionStorage.setItem("trip.over", opts.over);
  } catch {
    // private mode: the host closes the game at the table by hand
  }
  location.href = tableUrl(table, opts.screen);
}
