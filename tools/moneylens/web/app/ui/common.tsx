// The parts every screen of the app uses: the bar at the top, a field for a secret, a button that
// copies, a line that says what went wrong.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { getLang, onLang, setLang, t, type Key } from "../i18n";

/** Re-render when the language changes. */
export function useLang() {
  const [lang, set] = useState(getLang());
  useEffect(() => onLang(() => set(getLang())), []);
  return lang;
}

const svg = (size: number, children: ComponentChildren, strokeWidth = 2.4) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
export const IconBack = () => svg(20, <path d="M14.5 5.5L8 12l6.5 6.5" />);
export const IconCheck = () => svg(18, <path d="M5 12.5l4.5 4.5L19 7.5" />, 3);
export const IconCopy = () =>
  svg(
    18,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5.5 14.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8A1.5 1.5 0 0 1 14.5 5v.5" />
    </>,
    2,
  );
export const IconLock = () =>
  svg(
    18,
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>,
    2,
  );
/** A warning is never told by its color alone (amber is also the tools' own color): it carries this sign. */
export const IconWarn = () =>
  svg(
    20,
    <>
      <path d="M12 4.5l8.5 14.5h-17z" />
      <path d="M12 10.5v3.5M12 17v.01" />
    </>,
    2,
  );

/** The bar at the top: back to changle.ca's tools, the app's name, the language. */
export function TopBar() {
  const lang = useLang();
  return (
    <header class="bar">
      <a class="bar-back" href="https://changle.ca/tools">
        <IconBack />
        {t("backToTools")}
      </a>
      <span class="bar-brand" lang={lang === "zh" ? "zh-CN" : "en"}>
        {t("brand")}
      </span>
      <button type="button" class="bar-lang" lang={lang === "zh" ? "en" : "zh-CN"} onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
        {t("switchLang")}
      </button>
    </header>
  );
}

/** A screen's title, which takes the focus when the screen appears, so that a screen reader starts there and the keyboard too. */
export function Title({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 class="title" tabIndex={-1} ref={ref}>
      {children}
    </h1>
  );
}

/** What went wrong, what was done, or what to know, in a line with a sign. Read out when it appears. */
export function Note({ tone = "plain", children }: { tone?: "plain" | "done" | "warn" | "error"; children: ComponentChildren }) {
  return (
    <p class={`note note-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "done" ? <IconCheck /> : tone !== "plain" && <IconWarn />}
      <span>{children}</span>
    </p>
  );
}

type SecretProps = {
  id: string;
  label: Key;
  value: string;
  onInput: (value: string) => void;
  /** "new-password" where one is being chosen, "current-password" where one is being entered, "off" for a recovery code. */
  autoComplete: "new-password" | "current-password" | "off";
  /** A recovery code is shown as it is typed, whole (it is longer than a line on a phone), in the type that tells 0 from O. */
  plain?: boolean;
  invalid?: boolean;
  describedBy?: string;
  focus?: boolean;
  disabled?: boolean;
};

/**
 * A field for a passphrase or a recovery code. A passphrase is hidden until "show" is pressed; shown, the field is
 * an ordinary one, which is also what a passphrase in Chinese needs (an input method does not work in a hidden
 * field). Nothing corrects or capitalizes what is typed: the keys pressed are the passphrase.
 */
export function SecretField({ id, label, value, onInput, autoComplete, plain = false, invalid = false, describedBy, focus = false, disabled = false }: SecretProps) {
  useLang();
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const shared = {
    id,
    ref,
    value,
    autoComplete,
    autoCorrect: "off",
    spellcheck: false,
    "aria-invalid": invalid ? ("true" as const) : undefined,
    "aria-describedby": describedBy,
    disabled,
  };
  return (
    <div class="field">
      <label class="field-label" for={id}>
        {t(label)}
      </label>
      <div class="field-row">
        {plain ? (
          <textarea
            {...shared}
            class="code-input"
            rows={2}
            autoCapitalize="characters"
            onInput={(event) => onInput(event.currentTarget.value)}
            // (a code has no lines: Enter is "go", as in a field of one line)
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
          />
        ) : (
          <input {...shared} type={shown ? "text" : "password"} autoCapitalize="off" onInput={(event) => onInput(event.currentTarget.value)} />
        )}
        {!plain && (
          <button type="button" class="field-toggle" aria-pressed={shown} onClick={() => setShown(!shown)}>
            {t(shown ? "hide" : "show")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Puts `text` on the clipboard: the browser's own way, or else the old one (an in-app browser often has only that). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // (fall through to the old way)
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.className = "copy-scratch";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const done = document.execCommand("copy");
    field.remove();
    return done;
  } catch {
    return false;
  }
}

/** Copies `text`. Where the browser will not, it says so, and shows the text in a field to copy by hand. */
export function CopyButton({ text }: { text: string }) {
  useLang();
  const [state, setState] = useState<"idle" | "done" | "manual">("idle");
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <div class="copy">
      <button type="button" class="btn btn-quiet" onClick={async () => setState((await copyText(text)) ? "done" : "manual")}>
        {state === "done" ? <IconCheck /> : <IconCopy />}
        <span aria-live="polite">{t(state === "done" ? "copied" : "copy")}</span>
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
