/** The small pieces 两清's screens share: the top bar, a figure that rolls to its new value, copying, the keypad. */
import { ChevronLeft, Delete, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "../i18n";
import { reduced } from "../lib/motion";
import { haptic } from "../lib/sound";
import { Button } from "../ui/Button";
import type { Decimals } from "./core";
import { money } from "./format";
import type { Key } from "./input";
import { say } from "./words";

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

const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/**
 * The keypad on 记一笔: twelve keys under the thumb, so the amount is typed without waiting for the
 * phone's keyboard (which covers half the screen and differs between phones). The point is off for
 * a currency with no decimals.
 */
export function Keypad({ onKey, decimals, lang }: { onKey: (k: Key) => void; decimals: Decimals; lang: Lang }) {
  return (
    <div className="split-keys">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="split-key"
          disabled={k === "." && decimals === 0}
          aria-label={k === "back" ? say(lang, "backspace") : k === "." ? say(lang, "point") : undefined}
          onClick={() => {
            haptic();
            onKey(k);
          }}
        >
          {k === "back" ? <Delete aria-hidden="true" /> : k}
        </button>
      ))}
    </div>
  );
}
