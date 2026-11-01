import { useEffect, useRef, useState, type RefObject } from "react";
import { reduced } from "../lib/anim";

/** Anything a player presses or types into. */
const ACTIONS = "button, input:not([type='hidden']), textarea, select, [role='button']";
/** What a player types into. */
const FIELDS = "input, textarea, select";
/** A game asking for particular controls to be brought into view (see bringIntoView). */
const ASK = "net:bring-into-view";
/** Room left between an action brought into view and the reactions bar (the bar's fade sits in it). */
const CLEAR = 30;
/** New actions this close together are one group: a form, a row of names, the four titles. */
const NEAR = 80;
/** ...and this close when they are items of one list. */
const LIST = 240;
/** How long a new action is kept in view while the screen around it settles (entrances, a figure rising). */
const HOLD = 1500;

type Band = { top: number; bottom: number; scroller: HTMLElement | null };
type Group = { els: HTMLElement[]; top: number; bottom: number };

/** The part of the screen a player can see and tap: under the top edge, above the reactions bar. */
function band(screen: HTMLElement, body: HTMLElement): Band {
  // a phone on its side: the body scrolls inside the screen and the bar sits below it
  const inner = /auto|scroll/.test(getComputedStyle(body).overflowY);
  let top = 0;
  let bottom = window.innerHeight;
  if (inner) {
    const r = body.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  const dock = screen.querySelector<HTMLElement>(":scope > .react-dock")?.getBoundingClientRect();
  if (dock && dock.height > 0) bottom = Math.min(bottom, dock.top);
  // the "reconnecting" strip sticks to the top while it's up
  const strip = screen.querySelector<HTMLElement>(":scope > .net-banner")?.getBoundingClientRect();
  if (strip && strip.height > 0 && strip.top < 80) top = Math.max(top, strip.bottom);
  return { top, bottom, scroller: inner ? body : null };
}

function shown(el: HTMLElement) {
  if (el.closest("[aria-hidden='true'], [inert]")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}
const enabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true";
/**
 * What a control says and whether it can be pressed: when either changes, it's a new action
 * ("Stop writing" turning into "Reveal now"). A number ticking in a label is not.
 */
const signature = (el: HTMLElement) =>
  `${enabled(el) ? 1 : 0}${(el.textContent ?? "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)}`;

/** Items of one list: the same parent, or each in its own wrapper in the same list (not the body itself). */
function kin(a: HTMLElement, b: HTMLElement, body: HTMLElement) {
  const ap = a.parentElement;
  const bp = b.parentElement;
  if (ap && ap === bp) return ap !== body;
  const ag = ap?.parentElement;
  return !!ag && ag === bp?.parentElement && ag !== body;
}

/**
 * Controls that sit together, top to bottom: close by (a form, a row of names, the four titles), or
 * in one list even with something else between them (the answers to vote on, around your own).
 */
function groupsOf(els: HTMLElement[], body: HTMLElement): Group[] {
  const items = els.map((el) => ({ el, r: el.getBoundingClientRect() })).sort((x, y) => x.r.top - y.r.top);
  const groups: Group[] = [];
  for (const { el, r } of items) {
    const last = groups[groups.length - 1];
    const gap = last ? r.top - last.bottom : Infinity;
    const list = !!last && last.els.some((x) => kin(x, el, body));
    if (last && (gap <= NEAR || (list && gap <= LIST))) {
      last.els.push(el);
      last.bottom = Math.max(last.bottom, r.bottom);
    } else groups.push({ els: [el], top: r.top, bottom: r.bottom });
  }
  return groups;
}

/** How much a group asks of the player: each control, and a box to type in counts more. */
const weight = (g: Group) => g.els.length + 2 * g.els.filter((el) => el.matches(FIELDS)).length;

/**
 * Of what just turned up, the group to look after. The first that runs under the bar, except: a
 * bigger group above it whose start has gone off the top comes first (the answers to vote on, not
 * the host's button under them; a lone toggle doesn't outweigh your turn to speak), and a group in
 * full view above it stays in view if bringing that one up would push it off the top and it is
 * where the player starts (a box to type in) or far outweighs it (the answers again, not the heat
 * switch over the host's skip). With nothing under the bar, the first group whose start has gone
 * off the top; else the first.
 */
function pick(groups: Group[], b: Band) {
  const i = groups.findIndex((g) => g.bottom > b.bottom - 8);
  if (i < 0) return groups.find((g) => g.top < b.top - 1) ?? groups[0];
  const under = groups[i];
  const before = groups.slice(0, i);
  const cut = before.filter((g) => g.top < b.top - 1).sort((x, y) => weight(y) - weight(x))[0];
  if (cut && weight(cut) > weight(under)) return cut;
  const need = Math.min(under.bottom - (b.bottom - CLEAR), under.top - (b.top + 12));
  const keep = before.find(
    (g) => g.top >= b.top - 1 && need > g.top - (b.top + 12) && (g.els.some((el) => el.matches(FIELDS)) || weight(g) >= 3 * weight(under)),
  );
  return keep ?? under;
}

/**
 * Scroll just far enough that this group is clear of the bar, never so far that its top leaves the
 * screen (of a group taller than the screen, just its first control: the rest visibly runs on
 * below); or, when its start has gone off the top, bring that back down while its end stays clear of
 * the bar. Says whether it moved anything.
 */
function settle(els: HTMLElement[], b: Band) {
  const live = els.filter((el) => el.isConnected && shown(el));
  if (!live.length) return false;
  const rects = live.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const under = bottom > b.bottom - 8;
  const cut = top < b.top - 1;
  const tall = bottom - top > b.bottom - b.top - 20;
  // (of a group taller than the screen, its first control is what has to be in view)
  const first = rects.reduce((a, r) => (r.top < a.top ? r : a)).bottom;
  let dy = 0;
  if (under && !cut) dy = Math.max(0, Math.min((tall ? first : bottom) - (b.bottom - CLEAR), top - (b.top + 12)));
  // (a group that fits keeps its end clear of the bar this way too; one that doesn't shows its start)
  else if (cut) dy = top - (b.top + 12);
  if (Math.abs(dy) < 1) return false;
  const el = b.scroller ?? document.scrollingElement;
  // (already as far as it goes that way)
  if (el && (dy > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0)) return false;
  const to: ScrollToOptions = { top: dy, behavior: reduced() ? "auto" : "smooth" };
  if (b.scroller) b.scroller.scrollBy(to);
  else window.scrollBy(to);
  return true;
}

/**
 * Bring these controls (the box for the next prompt and its button) up above the reactions bar,
 * the same way a new action is, and keep them there over whatever else turns up meanwhile: for a
 * game that knows what comes next once you've done one thing.
 */
export function bringIntoView(els: HTMLElement[]) {
  els[0]?.closest(".net-screen")?.dispatchEvent(new CustomEvent<HTMLElement[]>(ASK, { detail: els }));
}

/**
 * Online, the reactions bar rides along the bottom of the screen. Whenever something new to press
 * or type turns up on this phone (your pick, your turn to speak, the four titles, the host's skip),
 * or a button changes to a new move, and it is under the bar or below the edge, the screen scrolls
 * just enough to bring it up above the bar, and keeps it there while the screen settles. Nothing
 * moves while a finger is on the screen or someone is typing, and the player's own scrolling wins.
 */
export function useActionsInView(screen: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>, on: boolean, lang: string) {
  // switching language relabels every button: nothing new to bring into view
  const quiet = useRef(false);
  const shownLang = useRef(lang);
  useEffect(() => {
    if (shownLang.current === lang) return;
    shownLang.current = lang;
    quiet.current = true;
  }, [lang]);

  useEffect(() => {
    const root = screen.current;
    const main = body.current;
    if (!on || !root || !main) return;
    const seen = new WeakMap<Element, string>();
    // the group being looked after, and until when (a game's own ask holds over anything new)
    let target: HTMLElement[] = [];
    let until = 0;
    let asked = 0;
    let timer = 0;
    let touchedAt = 0;
    let movingUntil = 0;
    // the control this player last pressed: once it has gone (sent, done), what's left to do counts as new
    let pressed: HTMLElement | null = null;
    let pressedAt = 0;

    const check = () => {
      timer = 0;
      const now = performance.now();
      // (a finger that never came up stops counting after a few seconds)
      if (touchedAt && now - touchedAt < 4000) {
        timer = window.setTimeout(check, 250);
        return;
      }
      // (a control counts once it can be pressed: titles that unlock when the song starts are new then)
      const fresh: HTMLElement[] = [];
      for (const el of main.querySelectorAll<HTMLElement>(ACTIONS)) {
        if (!shown(el)) continue;
        const sig = signature(el);
        if (seen.get(el) === sig) continue;
        seen.set(el, sig);
        if (enabled(el)) fresh.push(el);
      }
      if (quiet.current) {
        quiet.current = false;
        return;
      }
      const b = band(root, main);
      const done = !!pressed && now - pressedAt < HOLD && (!pressed.isConnected || !enabled(pressed) || !shown(pressed));
      if ((fresh.length || done) && now > asked) {
        // (what turned up a moment ago is still part of it: the host's skip comes with the phase, the names after the wheel stops)
        const kept = now < until ? target.filter((el) => el.isConnected && shown(el) && enabled(el)) : [];
        const pool = done ? [...main.querySelectorAll<HTMLElement>(ACTIONS)].filter((el) => shown(el) && enabled(el)) : [...kept, ...fresh];
        pressed = null;
        target = pick(groupsOf([...new Set(pool)], main), b)?.els ?? [];
        until = now + HOLD;
      }
      if (!target.length || now > until) {
        target = [];
        return;
      }
      const focus = document.activeElement;
      const typing = !!focus && main.contains(focus) && focus.matches(FIELDS);
      if (!typing && now > movingUntil && settle(target, b)) movingUntil = now + 450;
      // keep it in view while the screen around it settles
      timer = window.setTimeout(check, 150);
    };
    // after the burst of changes a new phase brings (an exit, then an entrance)
    const schedule = () => {
      if (!timer) timer = window.setTimeout(check, 250);
    };
    const down = () => {
      touchedAt = performance.now();
      target = [];
      asked = 0;
    };
    const up = () => (touchedAt = 0);
    const wheel = () => {
      target = [];
      asked = 0;
    };
    const ask = (e: Event) => {
      const els = (e as CustomEvent<HTMLElement[]>).detail;
      if (!els?.length) return;
      target = els;
      until = asked = performance.now() + HOLD;
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 0);
    };
    const press = (e: Event) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(ACTIONS);
      if (!el || !main.contains(el)) return;
      pressed = el;
      pressedAt = performance.now();
    };

    const watch = new MutationObserver(schedule);
    watch.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "aria-hidden", "hidden", "inert", "class"] });
    const opts = { capture: true, passive: true };
    window.addEventListener("pointerdown", down, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    window.addEventListener("wheel", wheel, opts);
    root.addEventListener(ASK, ask);
    main.addEventListener("click", press, true);
    schedule();
    return () => {
      watch.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", down, opts);
      window.removeEventListener("pointerup", up, opts);
      window.removeEventListener("pointercancel", up, opts);
      window.removeEventListener("wheel", wheel, opts);
      root.removeEventListener(ASK, ask);
      main.removeEventListener("click", press, true);
    };
  }, [screen, body, on]);
}

/** True while the screen runs on below the reactions bar (the bar then fades the edge it covers). */
export function useMoreBelow(body: RefObject<HTMLElement | null>, on: boolean) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const main = body.current;
    if (!on || !main) {
      setMore(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const inner = /auto|scroll/.test(getComputedStyle(main).overflowY);
      const el = inner ? main : document.scrollingElement;
      if (!el) return;
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 6);
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    // (on its side the body is a fixed box that scrolls: what's in it changing is what counts)
    const sizes = new ResizeObserver(queue);
    sizes.observe(main);
    const changes = new MutationObserver(queue);
    changes.observe(main, { childList: true, subtree: true });
    window.addEventListener("scroll", queue, { passive: true });
    main.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    queue();
    return () => {
      sizes.disconnect();
      changes.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      main.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [body, on]);
  return more;
}
