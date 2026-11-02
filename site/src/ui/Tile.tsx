import { Clock, Users, Wine } from "lucide-react";
import { Pill } from "./Pill";
import { labels } from "./labels";
import type { TileProps } from "./types";
import "./Tile.css";
export function Tile({
  name,
  lang,
  icon: Icon,
  category,
  players,
  minutes,
  drinking,
  isNew,
  soon,
  lit,
  size = "grid",
  onOpen,
}: TileProps) {
  const other = lang === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      className={`ui-tile ui-category-${category} ui-tile-${size}${lit ? " ui-tile-lit" : ""}`}
      disabled={soon}
      onClick={onOpen}
    >
      <Icon
        className="ui-tile-watermark"
        strokeWidth={1.6}
        aria-hidden="true"
      />
      <span className="ui-tile-top">
        {isNew && <Pill>{labels.new[lang]}</Pill>}
        {soon && <span>{labels.soon[lang]}</span>}
      </span>
      <span className="ui-tile-title">
        <span lang={lang === "zh" ? "zh-CN" : "en"}>{name[lang]}</span>
        <small lang={other === "zh" ? "zh-CN" : "en"}>{name[other]}</small>
      </span>
      <span className="ui-tile-meta">
        {players && (
          <span>
            <Users aria-hidden="true" />
            {players.min}–{players.max}
            <span className="ui-visually-hidden"> {labels.players[lang]}</span>
          </span>
        )}
        {minutes !== undefined && (
          <span>
            <Clock aria-hidden="true" />
            {minutes} {labels.minutes[lang]}
          </span>
        )}
        {drinking && <Wine aria-label={labels.drinking[lang]} role="img" />}
      </span>
    </button>
  );
}
