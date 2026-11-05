import { ArrowLeft } from "lucide-react";
import type { Lang } from "../i18n";
import { back } from "../router";
import { Skeleton } from "../ui/Skeleton";
import { GAME_BY_ID, type GameId } from "./registry";
import "./GameLoading.css";

/**
 * While a game's own file downloads (each game is one, the front door stays light): the game
 * screen's shape instead of a blank page. The top bar already has the game's name and a way back,
 * then tonight's people, the stage and the button at the bottom shimmer, and after two seconds a
 * line says the network is slow (UI plan: 加载).
 */
export function GameLoading({ id, lang }: { id: GameId; lang: Lang }) {
  const name = GAME_BY_ID[id].name;
  const zh = lang === "zh";
  return (
    <div className="screen game-screen game-loading">
      <header className="game-loading-bar">
        <button type="button" className="game-loading-back" onClick={back} aria-label={zh ? "返回" : "Back"}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1>
          <span>{name[lang]}</span>
          <small>{name[zh ? "en" : "zh"]}</small>
        </h1>
      </header>
      <div className="game-loading-people" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ui-skeleton-shape" />
        ))}
      </div>
      <div className="game-loading-stage">
        <Skeleton lang={lang} shape="block" height="100%" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
      </div>
      <span className="game-loading-action ui-skeleton-shape" aria-hidden="true" />
    </div>
  );
}
