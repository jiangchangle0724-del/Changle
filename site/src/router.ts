/**
 * The site's addresses: one page, one address.
 *
 *   /                 home (party)          /g/<slug>          a game's card, over home
 *   /tools, /wish     the other home tabs   /g/<slug>/play     the game, on one phone (?c=: a link
 *                                                               of the game's own, 猜歌名's challenges)
 *   /t/<CODE>         an online table       /tv, /tv/<CODE>    the big screen (?g=<slug>)
 *   /me, /me/friends, /admin, /u/<id>, /chat/<id>             accounts
 *   /dj               the DJ booth's speaker (a big screen)    /dj/test           its sound check
 *   /settings, /login open that sheet over home (the address then goes back to /)
 *
 * Links from before (changle.ca/#/g/truth, /#/r/ABCD, /#/tv/ABCD) are rewritten on arrival, so
 * every link ever shared, and 到此一游's own links, still land in the right place.
 *
 * No router library: the History API, plus one click handler so an ordinary <a href="/me"> stays
 * inside the page. /eat, /when, /go, /trip, /hide, /party and /hang-on are other Workers: links there
 * load a real page.
 */
import { useEffect, useRef, useState } from "react";
import { GAMES, GAME_BY_ID, isGameId, type GameId } from "./games/registry";
import type { HomeTab } from "./home/Home";
import type { Lang } from "./i18n";

export type Route =
  | { kind: "home"; tab: HomeTab; game?: GameId; open?: "settings" | "login" }
  | { kind: "game"; id: GameId; c?: string }
  | { kind: "room"; code: string }
  | { kind: "me"; tab?: "friends" }
  | { kind: "admin" }
  | { kind: "user"; id: string }
  | { kind: "chat"; id: string }
  | { kind: "tv"; code?: string; game?: GameId }
  | { kind: "djtest" }
  | { kind: "dev"; search: string };

/** What the site keeps on each history entry. */
export type HistoryMark = {
  /** an entry this site added itself, so its ‹ can go back to the page before */
  inSite?: boolean;
  /** an open sheet's entry (components/Sheet.tsx): the back button closes the sheet */
  sheet?: string;
};

const BY_SLUG = new Map(GAMES.map((g) => [g.slug, g.id]));

/** A game from its address, or from its old id (the links before slugs used ids). */
export function gameFrom(s: string): GameId | undefined {
  const k = s.toLowerCase();
  return BY_SLUG.get(k) ?? (isGameId(k) ? k : undefined);
}

// development only: /dev/show (the Punchline show with made-up data). Undefined under tests.
const DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
const USER = "(u[a-z0-9]{6,20})";
const TABLE = "([A-Za-z0-9]{1,8})";

export function parse(pathname: string, search = ""): Route {
  const p = pathname.replace(/\/+$/, "") || "/";
  let m: RegExpExecArray | null;
  if (p === "/") return { kind: "home", tab: "party" };
  if (p === "/tools" || p === "/wish") return { kind: "home", tab: p.slice(1) as HomeTab };
  if (p === "/settings") return { kind: "home", tab: "party", open: "settings" };
  if (p === "/login") return { kind: "home", tab: "party", open: "login" };
  if ((m = /^\/g\/([A-Za-z0-9-]+)(\/play)?$/.exec(p))) {
    const id = gameFrom(m[1]);
    if (id) {
      const g = GAME_BY_ID[id];
      // a game that plays from a big screen (the DJ booth) is played at that screen's address
      if (m[2] && g.speaker) return { kind: "tv", game: id };
      // one on its own Worker (一起跳): the page opens on its card here, and current() leaves for its stage
      if (m[2] && g.stage) return { kind: "home", tab: "party", game: id };
      if (m[2] && g.ready) {
        const c = new URLSearchParams(search).get("c");
        return c && /^[A-Za-z0-9_-]{1,1600}$/.test(c) ? { kind: "game", id, c } : { kind: "game", id };
      }
      // (a hidden game has no card: only its own /play address opens it, nothing else is a page)
      if (!g.hidden) return { kind: "home", tab: "party", game: id };
    }
  }
  if ((m = new RegExp(`^/t/${TABLE}$`).exec(p))) return { kind: "room", code: m[1].toUpperCase() };
  if (p === "/me") return { kind: "me" };
  if (p === "/me/friends") return { kind: "me", tab: "friends" };
  if (p === "/admin") return { kind: "admin" };
  if ((m = new RegExp(`^/u/${USER}$`).exec(p))) return { kind: "user", id: m[1] };
  if ((m = new RegExp(`^/chat/${USER}$`).exec(p))) return { kind: "chat", id: m[1] };
  if ((m = /^\/tv(?:\/([A-Za-z0-9]{4}))?$/i.exec(p))) {
    const g = new URLSearchParams(search).get("g");
    return { kind: "tv", code: m[1]?.toUpperCase(), game: g ? gameFrom(g) : undefined };
  }
  // changle.ca/dj: a big screen with the DJ booth up (it's the speaker); /dj/test checks the sound alone
  if (p.toLowerCase() === "/dj") return { kind: "tv", game: "dj" };
  if (p.toLowerCase() === "/dj/test") return { kind: "djtest" };
  if (p === "/dev/show" && DEV) return { kind: "dev", search };
  // an address that isn't a page: home (and the address bar says so)
  return { kind: "home", tab: "party" };
}

export function pathOf(r: Route): string {
  switch (r.kind) {
    case "home":
      return r.game ? `/g/${GAME_BY_ID[r.game].slug}` : r.tab === "party" ? "/" : `/${r.tab}`;
    case "game":
      return `/g/${GAME_BY_ID[r.id].slug}/play${r.c ? `?c=${r.c}` : ""}`;
    case "room":
      return `/t/${r.code}`;
    case "me":
      return r.tab === "friends" ? "/me/friends" : "/me";
    case "admin":
      return "/admin";
    case "user":
      return `/u/${r.id}`;
    case "chat":
      return `/chat/${r.id}`;
    case "tv":
      if (r.game === "dj" && !r.code) return "/dj";
      return `/tv${r.code ? `/${r.code}` : ""}${r.game ? `?g=${GAME_BY_ID[r.game].slug}` : ""}`;
    case "djtest":
      return "/dj/test";
    case "dev":
      return `/dev/show${r.search}`;
  }
}

/** The address an old #-link stands for, or null when the hash isn't one. #/g/<id> opened the game itself. */
export function fromLegacyHash(hash: string): string | null {
  if (!hash.startsWith("#/")) return null;
  const [path, query = ""] = hash.slice(1).split("?");
  let m: RegExpExecArray | null;
  if ((m = /^\/g\/([a-z]+)/.exec(path))) {
    const id = gameFrom(m[1]);
    return id ? `/g/${GAME_BY_ID[id].slug}/play` : "/";
  }
  if ((m = new RegExp(`^/r/${TABLE}`).exec(path))) return `/t/${m[1].toUpperCase()}`;
  if ((m = /^\/tv(?:\/([A-Za-z0-9]{4}))?/.exec(path))) {
    const g = new URLSearchParams(query).get("g");
    const id = g ? gameFrom(g) : undefined;
    return pathOf({ kind: "tv", code: m[1]?.toUpperCase(), game: id });
  }
  if (/^\/dj\/test\b/.test(path)) return "/dj/test";
  if (/^\/dev\/show/.test(path)) return `/dev/show${query ? `?${query}` : ""}`;
  if (/^\/me\b/.test(path)) return path.includes("friends") ? "/me/friends" : "/me";
  if (/^\/admin\b/.test(path)) return "/admin";
  if ((m = new RegExp(`^/u/${USER}`).exec(path))) return `/u/${m[1]}`;
  if ((m = new RegExp(`^/chat/${USER}`).exec(path))) return `/chat/${m[1]}`;
  if (/^\/tools/.test(path)) return "/tools";
  if (/^\/wish/.test(path)) return "/wish";
  return "/";
}

const SITE = "开席 Lazy Susan";

/** The tab's title for a page (the per-game pages built by scripts/postbuild.ts use the same words). */
export function titleOf(r: Route, lang: Lang): string {
  const zh = lang === "zh";
  const named = (a: string, b: string) => `${zh ? a : b} · ${SITE}`;
  switch (r.kind) {
    case "home":
      if (r.game) return gameTitle(r.game);
      if (r.tab === "tools") return named("工具", "Tools");
      if (r.tab === "wish") return named("心愿单", "Wishlist");
      return SITE;
    case "game":
      return gameTitle(r.id);
    case "room":
      return named(`桌号 ${r.code}`, `Table ${r.code}`);
    case "tv":
      return r.game === "dj" ? named("打碟", "DJ Booth") : named("大屏幕", "Big screen");
    case "djtest":
      return named("打碟试音", "DJ Booth sound check");
    case "me":
    case "admin":
      return named("我的", "Me");
    case "user":
      return named("主页", "Profile");
    case "chat":
      return named("聊天", "Chat");
    case "dev":
      return SITE;
  }
}

export const gameTitle = (id: GameId) => `${GAME_BY_ID[id].name.zh} ${GAME_BY_ID[id].name.en} · ${SITE}`;

// ---------- moving between pages ----------

const NAV = "changle:navigate";
const here = () => window.location.pathname + window.location.search;
export const mark = () => (window.history.state ?? null) as HistoryMark | null;

// History changes go through here, one at a time. history.back() lands later (a popstate event),
// so whatever is asked for meanwhile waits its turn: otherwise a sheet that opens as another
// closes, or a page change right after a sheet closes, would be undone by the late back.
// Each open sheet has an entry of its own on top of its page's entry, so the phone's back button
// closes the sheet instead of leaving the page.

/**
 * An open sheet's entry. `close` runs when the sheet must go (the back button took its entry, or the
 * page is changing). A guard (useBackGuard) has `popped` instead: it answers the back button only,
 * and simply goes away when the page changes.
 */
type Overlay = { token: string; close: () => void; pushed: boolean; popped?: () => void };
/** open sheets that keep an entry, bottom to top */
const overlays: Overlay[] = [];
/** entries on top whose sheets closed just now: the next sheet to open takes one over */
let spare = 0;
/** history.go() calls still to land */
let backs = 0;
let backTimer: ReturnType<typeof setTimeout> | undefined;
/** the page's own entry under the sheets: its inSite decides what ‹ does */
let under: HistoryMark | null = null;
const waiting: (() => void)[] = [];
// sheet ids differ on every page load: history.state survives a reload
const LOAD = Date.now().toString(36);
let seq = 0;

function settled(fn: () => void) {
  if (backs === 0 && spare === 0) fn();
  else waiting.push(fn);
}

function flush() {
  while (backs === 0 && spare === 0 && waiting.length) waiting.shift()!();
}

function goBackBy(n: number) {
  if (n <= 0) return;
  backs++;
  clearTimeout(backTimer);
  // a back that never lands (nothing to go back to) mustn't hold everything up; a slow one on a
  // busy phone still gets well over a second
  backTimer = setTimeout(() => {
    backs = 0;
    flush();
  }, 1500);
  window.history.go(-n);
}

let releasing = false;
/** Entries let go of and not taken over by the end of this moment come off. */
function release() {
  if (releasing) return;
  releasing = true;
  queueMicrotask(() => {
    releasing = false;
    const n = spare;
    spare = 0;
    if (n) goBackBy(n);
    else flush();
  });
}

function onPop() {
  if (backs > 0 && --backs === 0) clearTimeout(backTimer);
  const top = mark()?.sheet;
  const i = top ? overlays.findIndex((o) => o.token === top) : -1;
  // the entry of a sheet that isn't open (from before a reload, or forward into a closed one)
  if (top && i < 0) window.history.replaceState({ inSite: mark()?.inSite } satisfies HistoryMark, "");
  // the back button took these sheets' entries away: they close (a guard hears the back button)
  for (let j = overlays.length - 1; j > i; j--) {
    const o = overlays[j];
    if (!o.pushed) continue;
    overlays.splice(j, 1);
    (o.popped ?? o.close)();
  }
  flush();
}

if (typeof window !== "undefined") window.addEventListener("popstate", onPop);

function pushOver(o: Overlay) {
  const put = () => {
    if (!overlays.includes(o)) return; // closed before its turn
    if (!overlays.some((x) => x.pushed)) under = mark();
    window.history.pushState({ inSite: true, sheet: o.token } satisfies HistoryMark, "");
    o.pushed = true;
  };
  if (spare === 1 && backs === 0) {
    // a sheet closed this very moment (one sheet giving way to another, or StrictMode's second
    // mount): take its entry over instead of going back and forward
    spare = 0;
    window.history.replaceState({ inSite: true, sheet: o.token } satisfies HistoryMark, "");
    o.pushed = true;
  } else settled(put);
}

/** A sheet closed by itself (✕, the backdrop, Esc, a button in it, or gone): its entry comes off, and any sheet above it closes too. */
function closeOverlay(token: string) {
  const i = overlays.findIndex((o) => o.token === token);
  if (i < 0) return;
  const gone = overlays.splice(i);
  for (const o of gone.slice(1).reverse()) o.close();
  const n = gone.filter((o) => o.pushed).length;
  if (n) {
    spare += n;
    release();
  }
}

/** Every open sheet closes and its entry comes off (the page is changing). How many entries that was. */
function closeAll() {
  const open = overlays.splice(0);
  for (const o of [...open].reverse()) o.close();
  const n = open.filter((o) => o.pushed).length + spare;
  spare = 0;
  return n;
}

/** Go to an address inside the site. Sheets open on the page being left close first. */
export function navigate(path: string, replace = false) {
  goBackBy(closeAll());
  settled(() => {
    const now = mark();
    if (replace) window.history.replaceState({ inSite: now?.inSite ?? false } satisfies HistoryMark, "", path);
    else if (path !== here()) window.history.pushState({ inSite: true } satisfies HistoryMark, "", path);
    window.dispatchEvent(new Event(NAV));
  });
}

export const go = (r: Route, replace = false) => navigate(pathOf(r), replace);

/**
 * One page back: the ‹ arrow, or closing a game's card. Never off the site: a page opened from
 * a link elsewhere goes home instead. A second tap while the first is on its way does nothing.
 */
export function back() {
  if (backs > 0) return;
  const above = overlays.filter((o) => o.pushed).length + spare;
  if ((above ? under : mark())?.inSite) goBackBy(closeAll() + 1);
  else navigate("/", true);
}

/** The other Workers on changle.ca: a link there is a real page load. */
const elsewhere = (path: string) => /^\/(eat|when|go|trip|hide|party|hang-on)(\/|$)/.test(path);

/** /g/<slug>/play of a game on its own Worker (一起跳): the address of its stage, or null. */
export function stageOf(pathname: string): string | null {
  const m = /^\/g\/([A-Za-z0-9-]+)\/play\/?$/.exec(pathname);
  const id = m ? gameFrom(m[1]) : undefined;
  return (id && GAME_BY_ID[id].stage?.screen) || null;
}

function current(first = false): Route {
  // a sheet's entry left over from before a reload: no sheet is open now
  if (first && mark()?.sheet) window.history.replaceState({ inSite: mark()?.inSite } satisfies HistoryMark, "");
  const legacy = fromLegacyHash(window.location.hash);
  if (legacy) window.history.replaceState(mark(), "", legacy);
  // its stage is another Worker's page: a real page load, in place of this entry
  const stage = first ? stageOf(window.location.pathname) : null;
  if (stage) window.location.replace(stage);
  const r = parse(window.location.pathname, window.location.search);
  // the address as the site writes it: a game's old id, a trailing slash, a page that isn't one
  const canonical = pathOf(r);
  if (canonical !== here()) window.history.replaceState(mark(), "", canonical);
  return r;
}

const samePage = (a: Route, b: Route) => pathOf(a) === pathOf(b) && (a.kind !== "home" || b.kind !== "home" || a.open === b.open);

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => current(true));
  useEffect(() => {
    // a sheet's own entry has the same address: the page stays as it is
    const sync = () => {
      const next = current();
      setRoute((now) => (samePage(now, next) ? now : next));
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || elsewhere(url.pathname)) return;
      e.preventDefault();
      navigate(fromLegacyHash(url.hash) ?? url.pathname + url.search);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener(NAV, sync);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener(NAV, sync);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return route;
}

/**
 * While `open`, an entry of its own sits on the history, so the phone's back button (or a swipe
 * back) closes this instead of leaving the page. Closing it any other way takes the entry off again.
 */
export function useBackCloses(open: boolean, onClose: () => void, enabled = true) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!enabled || !open) return;
    const o: Overlay = { token: `${LOAD}.${++seq}`, close: () => close.current(), pushed: false };
    overlays.push(o);
    pushOver(o);
    return () => closeOverlay(o.token);
  }, [open, enabled]);
}

/**
 * While `active`, the phone's back button (or a swipe back) on this page calls `onBack` instead of
 * leaving: a game under way shows its tally first. It keeps an entry of its own like an open sheet,
 * but leaving the page another way (‹ in the tally, a link) just drops it, without calling onBack.
 * One back press uses it up: set it active again to catch the next one.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const popped = useRef(onBack);
  popped.current = onBack;
  useEffect(() => {
    if (!active) return;
    const o: Overlay = { token: `${LOAD}.${++seq}`, close: () => {}, popped: () => popped.current(), pushed: false };
    overlays.push(o);
    pushOver(o);
    return () => closeOverlay(o.token);
  }, [active]);
}

/** Full link to a table, for the QR code and the invite. */
export const tableLink = (code: string) => `${window.location.origin}/t/${code}`;
