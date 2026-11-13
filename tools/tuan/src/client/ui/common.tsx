// The parts every page of 跟一单 uses: the bar at the top, a sheet that rises from the bottom, a
// stepper, a button that copies, a line that comes and goes, and a few small drawings.
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BASE } from "../../base";
import { amountText, dollars, MILLI } from "../../engine/money";
import { weighed, type Unit } from "../../engine/types";
import { copyText } from "../api";
import { getLang, onLang, setLang, t, unitName } from "../i18n";

/** Re-render when the language changes. */
export function useLang() {
  const [lang, set] = useState(getLang());
  useEffect(() => onLang(() => set(getLang())), []);
  return lang;
}

/** The page's name, as the phone's tab, history and share sheet show it. */
export function useTitle(text: string | null) {
  const lang = useLang();
  useEffect(() => {
    if (text) document.title = `${text} · ${t("brand")}`;
  }, [text, lang]);
}

/** "$38.00" */
export const money = dollars;
/** "2", "1.5 lb": how much of something, as people say it. */
export const qtyText = (unit: Unit, qty: number): string => (weighed(unit) ? `${amountText(qty)} lb` : String(qty / MILLI));
/** "$38.00 / 袋" */
export const priceText = (price: number, unit: Unit): string => `${dollars(price)} / ${unitName(unit)}`;

type IconProps = { size?: number };
const svg = (size: number, children: ComponentChildren, strokeWidth = 2.4) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
export const IconCheck = ({ size = 20 }: IconProps) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, 3);
export const IconBack = ({ size = 20 }: IconProps) => svg(size, <path d="M14.5 5.5L8 12l6.5 6.5" />);
export const IconClose = ({ size = 20 }: IconProps) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const IconPlus = ({ size = 20 }: IconProps) => svg(size, <path d="M12 5v14M5 12h14" />, 2.8);
export const IconMinus = ({ size = 20 }: IconProps) => svg(size, <path d="M5 12h14" />, 2.8);
export const IconNext = ({ size = 18 }: IconProps) => svg(size, <path d="M9.5 5.5L16 12l-6.5 6.5" />);
export const IconClock = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
    2,
  );
export const IconPin = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 21s6.5-5.6 6.5-10.5a6.500 6.500 0 1 0-13 0C5.500 15.400 12 21 12 21z" />
      <circle cx="12" cy="10.500" r="2.300" />
    </>,
    2,
  );
export const IconCopy = ({ size = 18 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5.5 14.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8A1.5 1.5 0 0 1 14.5 5v.5" />
    </>,
    2,
  );

/** The bar at the top: the tool's name (home), and the language. */
export function TopBar() {
  const lang = useLang();
  return (
    <header class="bar">
      <a class="bar-brand" href={`${BASE}/`}>
        {t("brand")}
      </a>
      <button type="button" class="bar-lang" lang={lang === "zh" ? "en" : "zh-CN"} onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
        {t("switchLang")}
      </button>
    </header>
  );
}

let openSheets = 0;

/**
 * A panel that rises from the bottom. It closes on its own button, a tap outside, Escape, and the
 * phone's back button (opening it adds a step to the page's history, as the site's sheets do).
 * The step is added the moment the sheet is on the page, before anything on it can be tapped
 * (a layout effect): a tap or the back button never finds a sheet without its step.
 */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useLang();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    openSheets += 1;
    document.documentElement.classList.add("has-sheet");
    history.pushState({ ...history.state, sheet: true }, "");
    let byBack = false;
    const back = () => {
      byBack = true;
      close.current();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && close.current();
    window.addEventListener("popstate", back);
    document.addEventListener("keydown", key);
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus();
    return () => {
      window.removeEventListener("popstate", back);
      document.removeEventListener("keydown", key);
      openSheets -= 1;
      if (!openSheets) document.documentElement.classList.remove("has-sheet");
      // closed some other way: take the step back out of the history
      if (!byBack && history.state?.sheet) history.back();
      before?.focus?.();
    };
  }, []);

  return (
    <div class="scrim" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button type="button" class="icon-btn" aria-label={t("close")} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Less, how much, more. */
export function Stepper({ text, lessLabel, moreLabel, onLess, onMore, canMore = true, large = false }: { text: string; lessLabel: string; moreLabel: string; onLess: () => void; onMore: () => void; canMore?: boolean; large?: boolean }) {
  return (
    <div class={`stepper${large ? " stepper-lg" : ""}`}>
      <button type="button" class="step" aria-label={lessLabel} onClick={onLess}>
        <IconMinus size={large ? 22 : 18} />
      </button>
      <output class="step-n" aria-live="polite">
        {text}
      </output>
      <button type="button" class="step step-more" aria-label={moreLabel} onClick={onMore} disabled={!canMore}>
        <IconPlus size={large ? 22 : 18} />
      </button>
    </div>
  );
}

/**
 * Copies `text`. If the phone won't (an old WeChat), the text appears in a field that can be
 * pressed, selected and copied by hand.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  useLang();
  const [state, setState] = useState<"idle" | "done" | "manual">("idle");
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <div class="copy">
      <button type="button" class="btn btn-quiet btn-sm" onClick={async () => setState((await copyText(text)) ? "done" : "manual")}>
        {state === "done" ? <IconCheck size={18} /> : <IconCopy />}
        <span aria-live="polite">{state === "done" ? t("copied") : label}</span>
      </button>
      {state === "manual" && (
        <label class="copy-manual">
          <span>{t("copyByHand")}</span>
          <input type="text" readOnly value={text} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}

/** The first email address in a line of text (how to pay usually has one), or null. */
export const emailIn = (text: string): string | null => /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(text)?.[0] ?? null;

/**
 * Text a merchant wrote, beside a button that copies it (or the part of it worth copying). Nothing
 * on these pages can be selected, as on changle.ca: what people need to copy gets a button.
 */
export function Copyable({ text, copy = text, label }: { text: string; copy?: string; label: string }) {
  return (
    <div class="copyable">
      <Lines text={text} />
      <CopyButton text={copy} label={label} />
    </div>
  );
}

/** A short line that comes and goes at the bottom of the screen, with at most one thing to tap. */
export function Toast({ text, action, onAction }: { text: string | null; action?: string; onAction?: () => void }) {
  return (
    <div class="toast-wrap" aria-live="polite">
      {text && (
        <div class="toast">
          {text}
          {action && (
            <button type="button" class="toast-act" onClick={onAction}>
              {action}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Text a merchant wrote, line breaks kept. Always as text: nothing in it is ever markup. */
export function Lines({ text, class: className }: { text: string; class?: string }) {
  return <p class={`lines${className ? ` ${className}` : ""}`}>{text}</p>;
}
