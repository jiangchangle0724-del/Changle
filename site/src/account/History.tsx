import { GAME_BY_ID, isGameId } from "../games/registry";
import { ago } from "../lib/time";
import { useStore } from "../store";
import { EmptyState } from "../ui/EmptyState";

export type HistoryRow = { id: number; game: string; mode: "online" | "single" | string; room: string; players: string[]; drinks: number; minutes: number; at: number };

/** The games someone played: which, when, with whom, and how many times they drank. */
export function HistoryList({ rows, empty }: { rows: HistoryRow[]; empty?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (!rows.length)
    return (
      <EmptyState title={empty ?? (zh ? "还没有记录。" : "Nothing yet.")} body={!empty ? (zh ? "玩一局，这里就会出现。" : "Play a game and it shows up here.") : undefined} />
    );
  return (
    <ul className="history">
      {rows.map((r) => {
        const g = isGameId(r.game) ? GAME_BY_ID[r.game] : null;
        const Icon = g?.icon;
        return (
          <li key={r.id} className="history-row" style={{ ["--gel" as string]: g?.gel ?? "#8c86ff" }}>
            <span className="history-icon" aria-hidden="true">
              {Icon && <Icon size={22} strokeWidth={1.9} />}
            </span>
            <span className="history-main">
              <strong>{g ? (zh ? g.name.zh : g.name.en) : zh ? "一个已经下架的游戏" : "A game that's no longer here"}</strong>
              <small>
                {r.players.length ? (zh ? `和 ${r.players.slice(0, 5).join("、")}${r.players.length > 5 ? " 等" : ""}` : `with ${r.players.slice(0, 5).join(", ")}${r.players.length > 5 ? "…" : ""}`) : ""}
              </small>
            </span>
            <span className="history-side">
              <span className="history-when">{ago(r.at, lang)}</span>
              <span className="history-tags">
                {r.mode === "online" && <span className="history-online">{zh ? "联机" : "Online"}</span>}
                {r.drinks > 0 && <span className="history-drinks">{zh ? `喝了 ${r.drinks} 次` : `${r.drinks} ${r.drinks === 1 ? "drink" : "drinks"}`}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The game someone plays most, lit in that game's color. */
export function FavoriteGame({ id }: { id: string | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const g = id && isGameId(id) ? GAME_BY_ID[id] : null;
  if (!g) return null;
  const Icon = g.icon;
  return (
    <div className="fav-row" style={{ ["--gel" as string]: g.gel }}>
      <span className="fav-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="fav-text">
        <small>{zh ? "最常玩" : "Plays most"}</small>
        <strong>{zh ? g.name.zh : g.name.en}</strong>
      </span>
    </div>
  );
}
