import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { back } from "../router";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { GameHeader } from "../ui/GameHeader";
import { GAME_BY_ID, type GameId } from "./registry";
import { clearSaved, readSaved, tableOf, writeSaved } from "./saved";
import "../ui/base.css";
import "./GameShell.css";

type Keeping = {
  game: GameId;
  v: number;
  table: string;
  /** the penalties so far, when the game came back */
  dots?: Record<string, number>;
};
const KeepingContext = createContext<Keeping | null>(null);

/** For the shell: the game that keeps its progress, and the penalty count it came back with. */
export const useKeeping = () => useContext(KeepingContext);

/**
 * Around a game that keeps its progress (UI plan: 中途离开). If this phone has one of its games under
 * way for these people (from the last 12 hours), it asks first: 这局还在，回来继续？ 继续这局 gives
 * the game back what it kept; 重新开始 drops it. Then the game, with `saved` (null for a new game).
 * Bump `version` when what the game keeps changes shape: an old one is then not offered.
 */
export function Resume<D>({ game, version, children }: { game: GameId; version: number; children: (saved: D | null) => ReactNode }) {
  const { players } = useStore();
  const table = tableOf(players);
  const [found] = useState(() => readSaved<D>(game, version, table));
  const [choice, setChoice] = useState<"ask" | "back" | "new">(found ? "ask" : "new");
  if (choice === "ask" && found)
    return (
      <ResumeAsk
        game={game}
        at={found.at}
        onBack={() => setChoice("back")}
        onNew={() => {
          clearSaved(game);
          setChoice("new");
        }}
      />
    );
  const kept = choice === "back" ? found : null;
  return <KeepingContext.Provider value={{ game, v: version, table, dots: kept?.dots }}>{children(kept ? kept.data : null)}</KeepingContext.Provider>;
}

/**
 * Inside the game: keep `data` while the game is under way (from its first move to its end, when it
 * has nothing left to come back to). Plain data only: it goes through JSON.
 */
export function useKeepProgress<D>(data: D, going: boolean) {
  const k = useContext(KeepingContext);
  const json = JSON.stringify(data);
  useEffect(() => {
    if (!k) return;
    if (going) writeSaved<D>(k.game, { v: k.v, table: k.table, data: JSON.parse(json) as D });
    else clearSaved(k.game);
  }, [k, json, going]);
}

/** 这局还在，回来继续？ In the game's own frame, with the time it was left. */
function ResumeAsk({ game, at, onBack, onNew }: { game: GameId; at: number; onBack: () => void; onNew: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const titleId = useId();
  const mins = Math.max(1, Math.round((Date.now() - at) / 60_000));
  const ago =
    mins < 60 ? (zh ? `${mins} 分钟前` : `${mins} min ago`) : zh ? `${Math.round(mins / 60)} 小时前` : `${Math.round(mins / 60)} h ago`;
  return (
    <div className="screen game-screen game-resume">
      <GameHeader title={GAME_BY_ID[game].name} lang={lang} onBack={back} />
      <section className="game-resume-body" aria-labelledby={titleId}>
        <h2 id={titleId}>{zh ? "这局还在，回来继续？" : "This game is still on. Pick it up?"}</h2>
        <p>{zh ? `${ago}停在这里，人和进度都还在。` : `Left ${ago}, with the same people and the score as it was.`}</p>
      </section>
      <div className="game-actions">
        <Button tone="quiet" size="lg" onClick={onNew}>
          {zh ? "重新开始" : "Start over"}
        </Button>
        <Button tone="primary" size="lg" onClick={onBack}>
          {zh ? "继续这局" : "Pick it up"}
        </Button>
      </div>
    </div>
  );
}
