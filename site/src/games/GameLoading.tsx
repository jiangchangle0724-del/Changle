import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { back } from "../router";
import { GAME_BY_ID, type GameId } from "./registry";
import "./GameLoading.css";

/**
 * While a game's own file downloads (each game is one, the front door stays light): the game
 * screen's shape instead of a blank page. The top bar already has the game's name and a way back,
 * then tonight's people, the stage and the button at the bottom shimmer, and after two seconds a
 * line says the network is slow (UI plan: 加载). A small file of its own that App.tsx fetches beside
 * the front door, so it stays tiny: plain shapes, not the Skeleton component.
 */
export function GameLoading({ id, lang }: { id: GameId; lang: Lang }) {
  const slow = useSlow();
  const name = GAME_BY_ID[id].name;
  const zh = lang === "zh";
  return (
    <div className="screen game-screen game-loading" aria-busy="true">
      <header className="game-loading-bar">
        <button type="button" className="game-loading-back" onClick={back} aria-label={zh ? "返回" : "Back"}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1>
          <span>{name[lang]}</span>
          <small>{name[zh ? "en" : "zh"]}</small>
        </h1>
      </header>
      <span className="ui-visually-hidden">{zh ? "加载中" : "Loading"}</span>
      <div className="game-loading-people" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <i className="game-loading-stage" aria-hidden="true" />
      {slow && (
        <p className="game-loading-slow" role="status">
          {zh ? "网有点慢，马上就好" : "Slow connection, nearly there"}
        </p>
      )}
      <i className="game-loading-action" aria-hidden="true" />
    </div>
  );
}

/**
 * Any other page while its file, or its first answer, is on the way (/me, a profile, a chat, the back
 * office, an online table): a way back and a few shimmering blocks instead of a blank screen, and the
 * same slow-network line after two seconds (UI plan C5). Shares the game shape's file and styles.
 */
export function PageLoading({ lang }: { lang: Lang }) {
  const slow = useSlow();
  const zh = lang === "zh";
  return (
    <div className="screen game-loading page-loading" aria-busy="true">
      <header className="game-loading-bar">
        <button type="button" className="game-loading-back" onClick={back} aria-label={zh ? "返回" : "Back"}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      </header>
      <span className="ui-visually-hidden">{zh ? "加载中" : "Loading"}</span>
      <i className="page-loading-head" aria-hidden="true" />
      <i className="page-loading-line" aria-hidden="true" />
      <i className="page-loading-line page-loading-short" aria-hidden="true" />
      <i className="page-loading-panel" aria-hidden="true" />
      {slow && (
        <p className="game-loading-slow" role="status">
          {zh ? "网有点慢，马上就好" : "Slow connection, nearly there"}
        </p>
      )}
    </div>
  );
}

/** true two seconds in: time to say the network is slow */
function useSlow() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);
  return slow;
}
