import type { ButtonProps } from "./types";
import "./Button.css";

export function Button(props: ButtonProps) {
  const iconOnly = props.tone === "icon";
  const Icon = props.icon;
  return (
    <button
      type={props.type ?? "button"}
      className={`ui-button ui-button-${props.tone ?? "primary"} ui-button-${iconOnly ? "sm" : (props.size ?? "md")}${!iconOnly && props.block ? " ui-button-block" : ""}`}
      disabled={props.disabled || props.busy}
      aria-busy={props.busy || undefined}
      aria-label={iconOnly ? props.label : undefined}
      title={iconOnly ? props.label : undefined}
      aria-pressed={iconOnly ? props.pressed : undefined}
      onClick={props.onClick}
    >
      <span
        className="ui-button-content"
        style={{ opacity: props.busy ? 0 : undefined }}
      >
        {Icon && <Icon aria-hidden="true" />}
        {!iconOnly && props.children}
      </span>
      {props.busy && (
        <span className="ui-button-progress" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  );
}
