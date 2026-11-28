/** The small pieces 两清's screens share: the top bar, a figure that rolls to its new value, copying, the keypad. */
import { BedDouble, Car, ChevronLeft, Delete, Plus, Shapes, ShoppingBag, ShoppingCart, Ticket, UtensilsCrossed, X, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "../i18n";
import type { Category } from "./categories";
import { reduced } from "../lib/motion";
import { haptic } from "../lib/sound";
import { Button } from "../ui/Button";
import type { Decimals } from "./core";
import { money } from "./format";
import type { Key } from "./input";
import { say } from "./words";

/**
 * A sentence or two of running text that wraps between its sentences before it wraps inside one.
 * Chinese has no spaces to say where a break may fall, so a line left to itself ends mid-word; the
 * words mark the place with a line break.
 */
export function Sentences({ text, lang }: { text: string; lang: Lang }) {
  return (
    <>
      {text.split("\n").map((sentence, i) => (
        <Fragment key={i}>
          {i > 0 && lang === "en" ? " " : null}
          <span className="split-sentence">{sentence}</span>
        </Fragment>
      ))}
    </>
  );
}

/** The top bar: the way back (or ✕ on a screen that closes), the title in the middle, one or two buttons on the right. */
export function Bar({ title, onBack, close, right, lang }: { title: ReactNode; onBack: () => void; close?: boolean; right?: ReactNode; lang: Lang }) {
  return (
    <header className="split-bar">
      <div className="split-bar-side">
        <Button tone="icon" icon={close ? X : ChevronLeft} label={say(lang, close ? "close" : "back")} onClick={onBack} />
      </div>
      <h1 className="split-bar-title">{title}</h1>
      <div className="split-bar-side split-bar-right">{right}</div>
    </header>
  );
}

/** A token's value as the page computes it (a duration in ms, or 0 when it isn't one). */
function tokenMs(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : 0;
}

/**
 * An amount that rolls from the value it showed to its new one (one of 两清's three motions: the
 * figure moving is how you see an expense land in what you owe). It starts fast and settles; with
 * reduced motion it is simply there. `from` is what it showed before the screen was last away (记一笔
 * takes the whole screen), so it can roll on from there when the screen comes back.
 */
export function Rolling({ value, from, currency, lang }: { value: number; from?: number | null; currency: string; lang: Lang }) {
  const [shown, setShown] = useState(from ?? value);
  // what the figure reads this moment: a roll starts from there, so one cut short (the amount changed
  // again, or the screen was drawn twice) carries on from where it had got to
  const at = useRef(shown);
  at.current = shown;
  useEffect(() => {
    const start = at.current;
    if (start === value) return;
    const ms = reduced() ? 0 : tokenMs("--dur-emphasis");
    if (!ms) {
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / ms);
      // ease-out: most of the way at once, then settling (1 - (1 - t)^4)
      const eased = 1 - (1 - t) ** 4;
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  // read out once, as the amount it settles on, not at every step on the way
  return (
    <>
      <span aria-hidden="true">{money(shown, currency, lang)}</span>
      <span className="ui-visually-hidden">{money(value, currency, lang)}</span>
    </>
  );
}

/** Put text on the clipboard. True when it got there. (The site's text can't be long-pressed, so anything worth copying has a button.) */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // an in-app browser without the clipboard API: the old way, through a field that is selected and copied
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      // (inside the open sheet when there is one: everything outside an open sheet can't be selected)
      ([...document.querySelectorAll("dialog[open]")].pop() ?? document.body).appendChild(field);
      field.select();
      // (an iPhone selects nothing with select() alone)
      field.setSelectionRange(0, field.value.length);
      const done = document.execCommand("copy");
      field.remove();
      return done;
    } catch {
      return false;
    }
  }
}

const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back", "+"];
/** where the keys that aren't digits sit (split.css: the + down the right at the top, delete under it, 0 twice as wide) */
const PLACE: Partial<Record<Key, string>> = { ".": " is-point", "0": " is-zero", back: " is-back", "+": " is-plus" };

/**
 * The keypad on 记一笔: thirteen keys under the thumb, so the amount is typed without waiting for the
 * phone's keyboard (which covers half the screen and differs between phones). The point is off for
 * a currency with no decimals. Its + adds another amount to the one typed (input.ts).
 */
export function Keypad({ onKey, decimals, lang }: { onKey: (k: Key) => void; decimals: Decimals; lang: Lang }) {
  return (
    <div className="split-keys">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className={`split-key${PLACE[k] ?? ""}`}
          disabled={k === "." && decimals === 0}
          aria-label={k === "back" ? say(lang, "backspace") : k === "." ? say(lang, "point") : k === "+" ? say(lang, "plus") : undefined}
          onClick={() => {
            haptic();
            onKey(k);
          }}
        >
          {k === "back" ? <Delete aria-hidden="true" /> : k === "+" ? <Plus aria-hidden="true" /> : k}
        </button>
      ))}
    </div>
  );
}

/** Each kind of spending's picture (categories.ts): its name is always said beside it, or for a screen reader. */
export const KIND_ICONS: Record<Category, LucideIcon> = { food: UtensilsCrossed, groceries: ShoppingCart, transport: Car, lodging: BedDouble, fun: Ticket, shopping: ShoppingBag, other: Shapes };

/** A kind's picture in a small round, as each expense in the list and each line of 按分类 begins. */
export function KindMark({ kind }: { kind: Category }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className="split-kind-mark" aria-hidden="true">
      <Icon />
    </span>
  );
}

/**
 * A link that looks like a small quiet Button (ui/Button.tsx): sms: or mailto:, so the phone's own
 * Messages or Mail opens with what it says. A link, not a button, since that is how a phone takes it.
 */
/**
 * A field in an open sheet, kept in sight as the phone's keyboard comes up. On an iPhone the sheet
 * then stands on the keyboard and grows shorter (ui/screenAnchor), which can leave the field just
 * tapped out of sight in the sheet's own scroll (Steve, 2026-11-27: the phone number on a transfer).
 * Once the screen has settled (its last resize, or a moment without one), the sheet's list scrolls
 * just far enough to show the field with what it is called (its label, or its form); nothing else
 * moves. The room kept round it is its `scroll-margin` (split.css).
 */
export function keepInSight(field: HTMLElement) {
  const vv = window.visualViewport;
  const show = () => {
    const list = field.closest<HTMLElement>(".ui-sheet-body");
    if (!list || document.activeElement !== field) return;
    const what = field.closest<HTMLElement>("label, form") ?? field;
    const r = what.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(what).scrollMarginTop) || 0;
    // (the screen ends at the keyboard: a sheet that doesn't stand on it goes on behind it)
    const bottom = Math.min(box.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
    const above = r.top - gap - box.top;
    const by = above < 0 ? above : r.bottom + gap > bottom ? Math.min(r.bottom + gap - bottom, above) : 0;
    if (by) list.scrollBy({ top: by, behavior: reduced() ? "auto" : "smooth" });
  };
  let timer = window.setTimeout(show, 450);
  const soon = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(show, 120);
  };
  // (a keyboard is up within a second or so; the field let go of, there is nothing to keep in sight)
  const stop = () => {
    vv?.removeEventListener("resize", soon);
    field.removeEventListener("blur", stop);
  };
  vv?.addEventListener("resize", soon);
  field.addEventListener("blur", stop);
  window.setTimeout(stop, 1500);
}

/** A keyboard takes at least this much of the screen (a phone's is about half of it). */
const KEYBOARD_MIN = 150;

/**
 * Whether the phone's keyboard is up, while `on` (a sheet with fields is open): the screen it leaves
 * the page is much shorter than the page's own (the visual viewport against the layout viewport,
 * which a keyboard doesn't change, and as they are with two fingers zoomed in too). On a computer
 * there is none, so never. It goes down after whatever tap put it away is over, so what changes
 * with it doesn't move under a finger.
 */
export function useKeyboardUp(on: boolean): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) {
      setUp(false);
      return;
    }
    const check = () => setUp(document.documentElement.clientHeight - vv.height * vv.scale > KEYBOARD_MIN);
    check();
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, [on]);
  return up;
}

export function SendLink({ href, icon: Icon, children, onSend }: { href: string; icon: LucideIcon; children: ReactNode; onSend?: () => void }) {
  return (
    <a className="ui-button ui-button-quiet ui-button-sm split-send-link" href={href} onClick={onSend}>
      <span className="ui-button-content">
        <Icon aria-hidden="true" />
        {children}
      </span>
    </a>
  );
}

