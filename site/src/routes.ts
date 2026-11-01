import { GAME_BY_ID, GAMES, isGameId, type GameId } from "./games/registry";
import type { HomeTab } from "./home/Home";

/**
 * Every page has its own address (docs/ui-plan.md, A3): a game's card can be shared, the browser's
 * back button closes what was opened, and search engines see each game. The site used to keep the
 * page after a # (changle.ca/#/g/dice); those links still work: they are rewritten to the new
 * address when they open.
 *
 *   /                      the games          /tools, /wish     the other two tabs
 *   /g/<game>              a game's card      /g/<game>/play    playing it on one phone
 *   /t/<CODE>              an online table    /tv, /tv/<CODE>   the big screen (?g=<game> queued up)
 *   /me, /me/friends       your page          /u/<id>, /chat/<id>, /admin
 *   /dj, /dj/test          the DJ booth on a big screen, and its sound check
 *
 * /eat, /trip, /go and /party belong to other Workers on the same domain: never routes here.
 */
export type Route =
  | { kind: "home"; tab: HomeTab; sheet?: GameId }
  | { kind: "game"; id: GameId }
  | { kind: "room"; code: string }
  | { kind: "me"; friends?: boolean }
  | { kind: "admin" }
  | { kind: "user"; id: string }
  | { kind: "chat"; id: string }
  | { kind: "tv"; code?: string; game?: GameId }
  | { kind: "djtest" };

/** Each game's address: its English name, so a shared link reads well. */
export const SLUG: Record<GameId, string> = {
  truth: "truth-or-dare",
  rogue: "rogue-thirteen",
  trip: "been-there",
  superlatives: "superlatives",
  king: "kings-game",
  drama: "drama-queens",
  postit: "post-it-note",
  limbo: "limbo",
  prompts: "never-have-i-ever",
  euchre: "euchre",
  dice: "seven-eight-nine",
  freeze: "freeze-dance",
  wheel: "wheel-of-fate",
  undercover: "undercover",
  tune: "name-that-tune",
  punchline: "punchline",
  draw: "draw-and-guess",
  dj: "dj-booth",
};
const BY_SLUG = Object.fromEntries(Object.entries(SLUG).map(([id, slug]) => [slug, id as GameId])) as Record<string, GameId>;

/** The game an address names, by its slug or its old id (/g/dice still works). */
export function gameOf(name: string): GameId | null {
  const s = name.toLowerCase();
  return BY_SLUG[s] ?? (isGameId(s) ? s : null);
}

/** The games that have a page of their own: playable and on the board. */
export const PAGE_GAMES = GAMES.filter((g) => g.ready && !g.hidden);

const CODE = /^[A-Za-z0-9]{1,8}$/;
const USER = /^u[a-z0-9]{6,20}$/;

export function pathOf(r: Route): string {
  switch (r.kind) {
    case "home":
      if (r.tab !== "party") return `/${r.tab}`;
      return r.sheet ? `/g/${SLUG[r.sheet]}` : "/";
    case "game":
      return `/g/${SLUG[r.id]}/play`;
    case "room":
      return `/t/${r.code}`;
    case "me":
      return r.friends ? "/me/friends" : "/me";
    case "admin":
      return "/admin";
    case "user":
      return `/u/${r.id}`;
    case "chat":
      return `/chat/${r.id}`;
    case "tv":
      return `/tv${r.code ? `/${r.code}` : ""}${r.game ? `?g=${r.game}` : ""}`;
    case "djtest":
      return "/dj/test";
  }
}

const HOME: Route = { kind: "home", tab: "party" };

/** The page an address shows. Unknown addresses are the home page. */
export function parsePath(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const [a, b, c] = parts;
  const q = new URLSearchParams(search);
  if (!a) return HOME;
  switch (a.toLowerCase()) {
    case "tools":
    case "wish":
      return { kind: "home", tab: a.toLowerCase() as HomeTab };
    case "g": {
      const id = b ? gameOf(b) : null;
      if (!id || GAME_BY_ID[id].hidden) return HOME;
      if (c?.toLowerCase() === "play" && GAME_BY_ID[id].ready) return { kind: "game", id };
      return { kind: "home", tab: "party", sheet: id };
    }
    case "t":
    case "r":
      return b && CODE.test(b) ? { kind: "room", code: b.toUpperCase() } : HOME;
    case "me":
      return { kind: "me", friends: b === "friends" };
    case "admin":
      return { kind: "admin" };
    case "u":
      return b && USER.test(b) ? { kind: "user", id: b } : HOME;
    case "chat":
      return b && USER.test(b) ? { kind: "chat", id: b } : HOME;
    case "tv": {
      const g = q.get("g");
      return { kind: "tv", code: b && /^[A-Za-z0-9]{4}$/.test(b) ? b.toUpperCase() : undefined, game: g && isGameId(g) ? g : undefined };
    }
    case "dj":
      return b?.toLowerCase() === "test" ? { kind: "djtest" } : { kind: "tv", game: "dj" };
  }
  return HOME;
}

/**
 * The old addresses, kept after a # (changle.ca/#/r/ABCD, as printed in QR codes and sent in
 * chats before): the page they meant, or null when the hash isn't one of them.
 */
export function parseLegacyHash(hash: string): Route | null {
  if (!hash.startsWith("#/") || hash.startsWith("#/dev/")) return null;
  const [path, search = ""] = hash.slice(1).split("?");
  const p = path.replace(/\/+$/, "") || "/";
  // #/g/dice was the game itself (its card came up only when there were too few on this phone)
  const g = /^\/g\/([a-z-]+)$/i.exec(p);
  if (g) {
    const id = gameOf(g[1]);
    return id && GAME_BY_ID[id].ready && !GAME_BY_ID[id].hidden ? { kind: "game", id } : HOME;
  }
  return parsePath(p, search ? `?${search}` : "");
}

/** The page this tab shows now. */
export function currentRoute(): Route {
  return parseLegacyHash(window.location.hash) ?? parsePath(window.location.pathname, window.location.search);
}

const NAVIGATED = "changle:navigate";

type Nav = { inSite?: boolean };

/**
 * Open a page of the site without reloading. A page opened this way is marked, so its ‹ can go back
 * to the page before; `replace` swaps the current page instead (a tab, a sheet that becomes the
 * game), keeping that mark.
 */
export function navigate(to: Route | string, opts: { replace?: boolean } = {}) {
  const url = typeof to === "string" ? to : pathOf(to);
  const here = window.location.pathname + window.location.search;
  const state = (window.history.state ?? {}) as Nav;
  if (opts.replace) window.history.replaceState({ ...state }, "", url);
  else if (url !== here || window.location.hash) window.history.pushState({ inSite: true } satisfies Nav, "", url);
  else return;
  window.dispatchEvent(new Event(NAVIGATED));
}

/** Whether the page on screen was opened from another page of this site (so back stays here). */
export function openedHere(): boolean {
  return !!(window.history.state as Nav | null)?.inSite;
}

/** Back to the page before when it's ours; otherwise `fallback`, in place of this one. */
export function goBack(fallback: Route = HOME) {
  if (openedHere()) window.history.back();
  else navigate(fallback, { replace: true });
}

/** Calls `fn` whenever the address changes: a link, ‹ or the browser's own back and forward. */
export function onRouteChange(fn: () => void): () => void {
  window.addEventListener("popstate", fn);
  window.addEventListener(NAVIGATED, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(NAVIGATED, fn);
  };
}

const OURS = /^\/(?:$|tools\b|wish\b|g\/|t\/|r\/|me\b|admin\b|u\/|chat\/|tv\b|dj\b)/;

/**
 * Links in the page (`<a href="/me">`) open without a reload, like buttons. Anything else (other
 * Workers' pages like /eat, files, other sites, a new tab) is left to the browser.
 */
export function catchLinks(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//")) return;
  const url = new URL(href, window.location.origin);
  if (!OURS.test(url.pathname)) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
}

/** A share link for a page: the full address (what goes in a QR code or a chat). */
export const linkTo = (to: Route | string) => `${window.location.origin}${typeof to === "string" ? to : pathOf(to)}`;
