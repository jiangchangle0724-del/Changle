// The parts every page of 约时间 uses: the bar at the top, a sheet that rises from the bottom,
// a button that copies, a QR code, and a few small drawings.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import qrcode from "qrcode-generator";
import { BASE } from "../../base";
import { copyText } from "../api";
import { getLang, onLang, setLang, t } from "../i18n";

/** Re-render when the language changes. */
export function useLang() {
  const [lang, set] = useState(getLang());
  useEffect(() => onLang(() => set(getLang())), []);
  return lang;
}

type IconProps = { size?: number };
const svg = (size: number, children: ComponentChildren, strokeWidth = 2.4) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
export const IconCheck = ({ size = 20 }: IconProps) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, 3);
/** a wave: could move things */
export const IconWave = ({ size = 20 }: IconProps) => svg(size, <path d="M4 13c2.2-3.5 4.6-3.5 6.8 0s4.6 3.5 6.8 0L20 10" />, 3);
export const IconBack = ({ size = 20 }: IconProps) => svg(size, <path d="M14.5 5.5L8 12l6.5 6.5" />);
export const IconClose = ({ size = 20 }: IconProps) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const IconCopy = ({ size = 18 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5.5 14.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8A1.5 1.5 0 0 1 14.5 5v.5" />
    </>,
    2,
  );
export const IconQr = ({ size = 18 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM20 14v.01M17.5 20H20v-2.5M14 20v.01" />
    </>,
    2,
  );
export const IconStar = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.8 6.300 20l1.400-6.300-4.800-4.300 6.400-.700z" />
  </svg>
);

/** The bar at the top: back to changle.ca's tools, the tool's name, the language. */
export function TopBar() {
  const lang = useLang();
  return (
    <header class="bar">
      <a class="bar-back" href="/tools">
        <IconBack />
        {t("backToTools")}
      </a>
      <a class="bar-brand" href={`${BASE}/`}>
        {lang === "zh" ? "约时间" : "When Works"}
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
 */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useLang();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    openSheets += 1;
    document.documentElement.classList.add("has-sheet");
    history.pushState({ sheet: true }, "");
    let byBack = false;
    const back = () => {
      byBack = true;
      close.current();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && close.current();
    window.addEventListener("popstate", back);
    document.addEventListener("keydown", key);
    panel.current?.focus();
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

/**
 * Copies `text`. If the phone won't (an old WeChat), the text appears in a field that can be
 * pressed, selected and copied by hand.
 */
export function CopyButton({ text, label, kind = "quiet", icon = true }: { text: string; label: string; kind?: "primary" | "quiet"; icon?: boolean }) {
  useLang();
  const [state, setState] = useState<"idle" | "done" | "manual">("idle");
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <div class="copy">
      <button type="button" class={`btn btn-${kind}`} onClick={async () => setState((await copyText(text)) ? "done" : "manual")}>
        {state === "done" ? <IconCheck size={18} /> : icon ? <IconCopy /> : null}
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

/** A QR code on white card stock (a scanner needs dark on light). */
export function Qr({ text, label }: { text: string; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (qr.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
  return (
    <svg class="qr" viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect class="qr-paper" width={n + 8} height={n + 8} rx="2" />
      <path class="qr-ink" d={path} />
    </svg>
  );
}

/** A short line that comes and goes at the bottom of the screen. */
export function Toast({ text }: { text: string | null }) {
  return (
    <div class="toast-wrap" aria-live="polite">
      {text && <div class="toast">{text}</div>}
    </div>
  );
}
