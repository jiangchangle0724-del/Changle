// The frame around the game, in changle.ca's look (site/src/ui and docs/DESIGN.md in the site's
// code): the top bar, bilingual titles, sheets that rise from the bottom and close on the phone's
// back button, switches, and a few line icons drawn on a 24 grid.
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { other, t, type Key } from "../i18n";

/** Line icons, 24 x 24, stroked (drawn for this game). */
const ICONS = {
  back: "M15 5l-7 7 7 7",
  help: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  exitFull: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  tv: "M3 5h18v12H3zM8 21h8M12 17v4",
  close: "M6 6l12 12M18 6L6 18",
  people: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.6 3 5.2",
  eye: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z",
  play: "M8 5.5v13l10.5-6.5z"
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** A title in both languages: the reader's leads, the other rides beneath it, smaller. */
export function BiTitle({ k, size = "sm", vars }: { k: Key; size?: "sm" | "md" | "lg" | "xl"; vars?: Record<string, string | number> }) {
  return (
    <span class={`bi-title bi-${size}`}>
      <span>{t(k, vars)}</span>
      <span>{other(k, vars)}</span>
    </span>
  );
}

export function IconButton(props: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; class?: string }) {
  return (
    <button type="button" class={`icon-btn ${props.class ?? ""}`} aria-label={props.label} title={props.label} aria-pressed={props.pressed} onClick={props.onClick}>
      <Icon name={props.icon} />
    </button>
  );
}

/** The game's top bar: back on the left, the bilingual title in the middle, the extras on the right. */
export function TopBar(props: { onBack?: () => void; backLabel?: string; right?: ComponentChildren; center?: ComponentChildren }) {
  return (
    <header class="topbar">
      <div class="topbar-side">{props.onBack && <IconButton icon="back" label={props.backLabel ?? t("back")} onClick={props.onBack} />}</div>
      <div class="topbar-title">{props.center ?? <BiTitle k="title" />}</div>
      <div class="topbar-side topbar-right">{props.right}</div>
    </header>
  );
}

/** An on/off switch with its label (a real checkbox underneath, so keyboards and readers know it). */
export function Switch(props: { label: string; hint?: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <label class={`switch-row${props.disabled ? " is-disabled" : ""}`} for={id}>
      <span class="switch-text">
        <span class="switch-label">{props.label}</span>
        {props.hint && <span class="switch-hint">{props.hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" class="switch" checked={props.on} disabled={props.disabled} onChange={(event) => props.onChange((event.currentTarget as HTMLInputElement).checked)} />
    </label>
  );
}

/**
 * A sheet from the bottom of the screen (rules, the menu, a question). The phone's back button
 * closes it before it leaves the page: it adds its own step to the history while open.
 */
export function Sheet(props: { open: boolean; title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    if (!props.open) return;
    const opener = document.activeElement as HTMLElement | null;
    const mark = { hcSheet: titleId };
    history.pushState(mark, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      onClose.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose.current();
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      // closed by a button: take back the step it added
      if (!popped && (history.state as { hcSheet?: string } | null)?.hcSheet === titleId) history.back();
      if (opener?.isConnected) opener.focus();
    };
  }, [props.open, titleId]);
  if (!props.open) return null;
  return (
    <div class="sheet-layer">
      <div class="sheet-scrim" onClick={() => props.onClose()} aria-hidden="true" />
      <section ref={panel} class={`sheet is-open${props.wide ? " sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <h2 id={titleId} class="sheet-title">
            {props.title}
          </h2>
          <IconButton icon="close" label={t("close")} onClick={props.onClose} />
        </div>
        <div class="sheet-body">{props.children}</div>
      </section>
    </div>
  );
}

/** The rules, as the sheet behind the top bar's question mark shows them. */
export function Rules({ custom }: { custom: string }) {
  return (
    <div class="rules-text">
      <p>{t("rule1")}</p>
      <p>{t("rule2")}</p>
      <p>{t("rule3")}</p>
      <p>{t("rule4", { n: 3 })}</p>
      <p>{t(custom ? "rulePenaltyCustom" : "rulePenalty")}</p>
      <p>{t("ruleScreen")}</p>
      <p class="rules-small">{t("ruleControls")}</p>
    </div>
  );
}
