// A time within one period, to the minute (Steve, 2026-11-14): a line for the period with a handle
// at each end to drag, and the two times to type. Used for my own answer to a slot, and by a host
// for the time that was set.
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { clock, MIN_SPAN, spanLabel, type Span } from "../../engine";
import { t } from "../i18n";
import { Sheet, useLang } from "./common";

/** "19:30" as a time field wants it: "19:30", "06:00". */
const field = (minutes: number) => clock(minutes).padStart(5, "0");
/** A time field's "HH:MM" back to minutes; null when it isn't one. */
function minutesOf(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 1440 ? minutes : null;
}

/**
 * A new start for a time, kept inside the period and half an hour or more long. Typed in, it moves
 * the other end along if it has to; dragged, it stops at it.
 */
export function moveStart(span: Span, range: Span, start: number, push: boolean): Span {
  const from = Math.min(Math.max(start, range[0]), range[1] - MIN_SPAN);
  if (span[1] - from >= MIN_SPAN) return [from, span[1]];
  return push ? [from, Math.min(range[1], from + MIN_SPAN)] : [span[1] - MIN_SPAN, span[1]];
}
export function moveEnd(span: Span, range: Span, end: number, push: boolean): Span {
  const to = Math.max(Math.min(end, range[1]), range[0] + MIN_SPAN);
  if (to - span[0] >= MIN_SPAN) return [span[0], to];
  return push ? [Math.max(range[0], to - MIN_SPAN), to] : [span[0], span[0] + MIN_SPAN];
}

/** The hours marked under the line: every hour, or every other one in a long period. */
const ticks = (range: Span): number[] => {
  const hours = (range[1] - range[0]) / 60;
  const step = hours > 5 ? 2 : 1;
  const out: number[] = [];
  for (let h = Math.ceil(range[0] / 60); h * 60 <= range[1] + 1; h += step) out.push(Math.min(h * 60, range[1]));
  return out;
};

export function Timeline({ range, span, onSpan, disabled }: { range: Span; span: Span; onSpan: (span: Span) => void; disabled?: boolean }) {
  useLang();
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<"from" | "to" | null>(null);
  // the latest, for the pointer moves between renders
  const now = useRef({ span, onSpan });
  now.current = { span, onSpan };
  const width = range[1] - range[0];
  const at = (minutes: number) => `${((minutes - range[0]) / width) * 100}%`;

  const minuteAt = (x: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.round(range[0] + (Math.min(Math.max(x - box.left, 0), box.width) / box.width) * width);
  };
  const move = (end: "from" | "to", minutes: number) => {
    const { span: was, onSpan: tell } = now.current;
    tell(end === "from" ? moveStart(was, range, minutes, false) : moveEnd(was, range, minutes, false));
  };
  const down = (event: PointerEvent) => {
    if (disabled) return;
    const minutes = minuteAt(event.clientX);
    const [from, to] = now.current.span;
    // the nearer end; between them, whichever side of the middle
    const end = minutes <= (from + to) / 2 ? "from" : "to";
    dragging.current = end;
    track.current!.setPointerCapture(event.pointerId);
    move(end, minutes);
    // stopping the browser's own handling also stops it giving the handle focus: give it here, so
    // the arrow keys move what was just pressed
    track.current!.querySelector<HTMLElement>(`[data-end="${end}"]`)?.focus({ preventScroll: true });
    event.preventDefault();
  };
  const drag = (event: PointerEvent) => dragging.current && move(dragging.current, minuteAt(event.clientX));
  const up = () => (dragging.current = null);

  const key = (end: "from" | "to") => (event: KeyboardEvent) => {
    const [from, to] = span;
    const was = end === "from" ? from : to;
    const by: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -15, PageUp: 15, Home: -1440, End: 1440 };
    if (!(event.key in by)) return;
    event.preventDefault();
    move(end, was + by[event.key]);
  };

  const handle = (end: "from" | "to") => {
    const value = end === "from" ? span[0] : span[1];
    return (
      <div
        class="timeline-handle"
        data-end={end}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t(end === "from" ? "timeFrom" : "timeTo")}
        aria-valuemin={end === "from" ? range[0] : span[0] + MIN_SPAN}
        aria-valuemax={end === "from" ? span[1] - MIN_SPAN : range[1]}
        aria-valuenow={value}
        aria-valuetext={clock(value)}
        aria-disabled={disabled || undefined}
        style={{ "--at": at(value) }}
        onKeyDown={key(end)}
      />
    );
  };

  return (
    <div class="timeline" data-disabled={disabled ? "" : undefined}>
      <div class="timeline-track" ref={track} onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up}>
        <div class="timeline-rail" />
        <div class="timeline-fill" style={{ "--from": at(span[0]), "--to": at(span[1]) }} />
        {handle("from")}
        {handle("to")}
      </div>
      <div class="timeline-ticks" aria-hidden="true">
        {ticks(range).map((minutes) => (
          <span key={minutes} style={{ "--at": at(minutes) }}>
            {Math.round(minutes / 60)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The two times, to type: "从 19:30 到 22:00". */
export function TimeFields({ range, span, onSpan, disabled }: { range: Span; span: Span; onSpan: (span: Span) => void; disabled?: boolean }) {
  useLang();
  const typed = (end: "from" | "to") => (event: Event) => {
    const minutes = minutesOf((event.currentTarget as HTMLInputElement).value);
    if (minutes === null) return;
    onSpan(end === "from" ? moveStart(span, range, minutes, true) : moveEnd(span, range, minutes, true));
  };
  return (
    <div class="time-fields">
      <label class="field">
        <span class="field-label">{t("timeFrom")}</span>
        <input type="time" step={60} min={field(range[0])} max={field(range[1] - MIN_SPAN)} value={field(span[0])} disabled={disabled} onChange={typed("from")} />
      </label>
      <span class="time-dash" aria-hidden="true">
        –
      </span>
      <label class="field">
        <span class="field-label">{t("timeTo")}</span>
        <input type="time" step={60} min={field(range[0] + MIN_SPAN)} max={field(range[1])} value={field(span[1])} disabled={disabled} onChange={typed("to")} />
      </label>
    </div>
  );
}

/** A sheet with a period's line and its two times, and whatever else the caller puts around them. */
export function TimeSheet({
  title,
  hint,
  range,
  span,
  onSpan,
  disabled,
  top,
  bottom,
  footer,
  onClose,
}: {
  title: string;
  hint?: string;
  range: Span;
  span: Span;
  onSpan: (span: Span) => void;
  disabled?: boolean;
  top?: ComponentChildren;
  bottom?: ComponentChildren;
  footer: ComponentChildren;
  onClose: () => void;
}) {
  useLang();
  const whole = span[0] === range[0] && span[1] === range[1];
  return (
    <Sheet title={title} onClose={onClose} footer={footer}>
      {top}
      <p class="hint">{hint ?? t("timeHint", { range: spanLabel(range) })}</p>
      <TimeFields range={range} span={span} onSpan={onSpan} disabled={disabled} />
      <Timeline range={range} span={span} onSpan={onSpan} disabled={disabled} />
      <div class="row-between time-foot">
        <output class="time-now" aria-live="polite">
          {disabled ? "" : spanLabel(span)}
        </output>
        {!whole && !disabled && (
          <button type="button" class="link-btn" onClick={() => onSpan(range)}>
            {t("timeWhole")}
          </button>
        )}
      </div>
      {bottom}
    </Sheet>
  );
}
