import type { GameMeta } from "../games/registry";

/** One game on the lighting board: a gel-colored tile with both names. */
export function Tile({
  g,
  i,
  lit,
  lang,
  onOpen,
  onPress,
  disabled,
  compact,
}: {
  g: GameMeta;
  i: number;
  lit: boolean;
  lang: "zh" | "en";
  onOpen?: () => void;
  onPress?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const Icon = g.icon;
  const main = lang === "zh" ? g.name.zh : g.name.en;
  const sub = lang === "zh" ? g.name.en : g.name.zh;
  return (
    <button
      type="button"
      data-tile={i}
      className={`tile ${lit ? "is-lit" : ""} ${g.ready ? "" : "is-soon"} ${compact ? "tile-compact" : ""}`}
      style={{ ["--gel" as string]: g.gel }}
      onClick={onOpen}
      onPointerDown={onPress}
      disabled={disabled}
      aria-pressed={lit}
      aria-label={`${g.name.en} ${g.name.zh}`}
    >
      <Icon className="tile-icon" size={64} strokeWidth={1.6} aria-hidden="true" />
      <span className={`tile-main ${lang === "zh" ? "is-zh" : ""}`}>{main}</span>
      <span className="tile-sub">{sub}</span>
      <span className="tile-foot">
        <span className="tile-players">{g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`}</span>
        {g.isNew && g.ready && <span className="tile-tag">{lang === "zh" ? "新" : "New"}</span>}
      </span>
    </button>
  );
}
