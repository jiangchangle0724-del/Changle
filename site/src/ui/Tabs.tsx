import { useRef } from "react";
import type { TabsProps } from "./types";
import "./Tabs.css";
export function Tabs<K extends string = string>({
  items,
  value,
  onChange,
  label,
  variant = "tabs",
}: TabsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  );
  return (
    <div
      className={`ui-tabs ui-tabs-${variant}`}
      role={variant === "tabs" ? "tablist" : "radiogroup"}
      aria-label={label}
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          ref={(node) => {
            refs.current[i] = node;
          }}
          type="button"
          className="ui-tab"
          role={variant === "tabs" ? "tab" : "radio"}
          aria-selected={variant === "tabs" ? item.key === value : undefined}
          aria-checked={
            variant === "segmented" ? item.key === value : undefined
          }
          tabIndex={i === selected ? 0 : -1}
          onClick={() => onChange(item.key)}
          onKeyDown={(event) => {
            const rtl =
              getComputedStyle(event.currentTarget).direction === "rtl";
            const delta =
              event.key === "ArrowRight"
                ? rtl
                  ? -1
                  : 1
                : event.key === "ArrowLeft"
                  ? rtl
                    ? 1
                    : -1
                  : event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowUp"
                      ? -1
                      : 0;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : delta
                    ? (i + delta + items.length) % items.length
                    : -1;
            if (next < 0) return;
            event.preventDefault();
            refs.current[next]?.focus();
            onChange(items[next].key);
          }}
        >
          <span>
            {item.label}
            {item.badge !== undefined && (
              <span className="ui-tab-badge">{item.badge}</span>
            )}
          </span>
          {item.sub && <small>{item.sub}</small>}
        </button>
      ))}
    </div>
  );
}
