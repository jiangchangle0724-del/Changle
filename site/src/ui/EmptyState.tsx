import { Inbox } from "lucide-react";
import { Button } from "./Button";
import type { EmptyStateProps } from "./types";
import "./EmptyState.css";
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  tone = "neutral",
}: EmptyStateProps) {
  return (
    <div className={`ui-empty ui-empty-${tone}`}>
      <Icon aria-hidden="true" />
      <h2>{title}</h2>
      {body && <div className="ui-empty-body">{body}</div>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
