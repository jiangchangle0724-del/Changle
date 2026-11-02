import type { PillProps } from "./types";
import "./Pill.css";
export function Pill(props: PillProps) {
  const Icon = props.icon;
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {props.children}
    </>
  );
  const className = `ui-pill ui-pill-${props.tone ?? "neutral"}`;
  return props.kind === "toggle" ? (
    <button
      type="button"
      className={`${className} ui-pill-toggle`}
      aria-pressed={props.selected}
      onClick={() => props.onToggle(!props.selected)}
    >
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}
