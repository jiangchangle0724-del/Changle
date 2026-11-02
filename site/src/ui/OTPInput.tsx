import { useId, useRef } from "react";
import type { OTPInputProps } from "./types";
import "./OTPInput.css";
export function OTPInput({
  value,
  onChange,
  onComplete,
  length = 6,
  charset = "digits",
  label,
  error,
  disabled,
  autoFocus,
}: OTPInputProps) {
  const id = useId();
  const completed = useRef<string | null>(null);
  const clean = (raw: string) =>
    raw
      .toUpperCase()
      .replace(charset === "digits" ? /[^0-9]/g : /[^A-Z]/g, "")
      .slice(0, length);
  const change = (raw: string) => {
    const next = clean(raw);
    onChange(next);
    if (next.length < length) completed.current = null;
    else if (completed.current !== next) {
      completed.current = next;
      onComplete?.(next);
    }
  };
  // A parent reset starts a new attempt, including when it resets after a completed code.
  if (value.length < length) completed.current = null;
  return (
    <div className="ui-otp" aria-disabled={disabled || undefined}>
      <label className="ui-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <div className="ui-otp-field">
        <div className="ui-otp-boxes" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span
              key={i}
              className={`ui-otp-box${i === Math.min(value.length, length - 1) ? " ui-otp-next" : ""}`}
            >
              {value[i] ?? ""}
            </span>
          ))}
        </div>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => change(event.target.value)}
          onPaste={(event) => {
            event.preventDefault();
            change(event.clipboardData.getData("text"));
          }}
          autoComplete="one-time-code"
          inputMode={charset === "digits" ? "numeric" : "text"}
          autoCapitalize={charset === "letters" ? "characters" : "off"}
          spellCheck={false}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <div className="ui-otp-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
