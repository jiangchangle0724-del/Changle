import { createContext, useContext } from "react";

/**
 * What the page around a one-phone game gives the game's shell (App.tsx): the game's own light, and
 * starting the same game over from nothing (再来一局 in the tally that ‹ opens). Null outside a game
 * page, in the component previews.
 */
export type GameRunValue = { gel: string; restart: () => void };

export const GameRun = createContext<GameRunValue | null>(null);

export const useGameRun = () => useContext(GameRun);
