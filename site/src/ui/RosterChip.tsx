import { Clock, Crown, X } from "lucide-react";
import { Button } from "./Button";
import { labels } from "./labels";
import type { RosterChipProps } from "./types";
import "./RosterChip.css";
export function RosterChip({
  name,
  lang,
  face,
  state = "idle",
  drinks = 0,
  presence = "here",
  host,
  me,
  size = "md",
  onClick,
  onRemove,
}: RosterChipProps) {
  const count = Math.max(0, Math.floor(drinks));
  const content = (
    <>
      <span className="ui-roster-face" aria-hidden="true">
        {face ?? name.trim().slice(0, 1).toUpperCase()}
      </span>
      <span className="ui-roster-info">
        <span className="ui-roster-name">{name}</span>
        <span className="ui-roster-marks">
          {host && <Crown role="img" aria-label={labels.host[lang]} />}
          {me && <span>{labels.me[lang]}</span>}
          {presence !== "here" && (
            <span>
              <Clock aria-hidden="true" />
              {labels[presence === "away" ? "away" : "gone"][lang]}
            </span>
          )}
        </span>
        {count > 0 && (
          <span
            className="ui-roster-drinks"
            aria-label={`${labels.drinks[lang]}: ${count}`}
            role="img"
          >
            {count <= 5
              ? Array.from({ length: count }, (_, i) => <i key={i} />)
              : `×${count}`}
          </span>
        )}
      </span>
    </>
  );
  return (
    <div
      className={`ui-roster ui-roster-${size} ui-roster-${state} ui-roster-${presence}`}
    >
      {onClick ? (
        <button type="button" className="ui-roster-person" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="ui-roster-person">{content}</div>
      )}
      {onRemove && (
        <Button
          tone="icon"
          icon={X}
          label={`${labels.remove[lang]} ${name}`}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
