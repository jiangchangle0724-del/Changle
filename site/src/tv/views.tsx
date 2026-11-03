import { lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import type { GameId, GameView } from "../shared/protocol";

/** What a game's big-screen view is given: the game as the room sees it, and whether this screen plays the show's sounds. */
export type TvViewProps<V extends GameView = GameView> = { v: V; sound: boolean };

type ViewOf<K extends GameId> = LazyExoticComponent<ComponentType<TvViewProps<Extract<GameView, { id: K }>>>>;

/**
 * Every game's big-screen view: one component per game, in its own file next to the game. The TV
 * (changle.ca/tv) shows it, and so does a phone that only watches (full screen, to mirror to a
 * TV). A game that isn't here yet shows its phone screen on the TV instead (TvGame in TvApp).
 */
const VIEWS: { [K in GameId]?: ViewOf<K> } = {
  punchline: lazy(() => import("../party/punchline/TvPunch")),
  superlatives: lazy(() => import("../party/superlatives/TvSuper")),
  undercover: lazy(() => import("../online/games/TvUndercover")),
  tune: lazy(() => import("../party/tune/TvTune")),
  drama: lazy(() => import("../party/drama/TvDrama")),
};

export const hasTvView = (id: GameId | null | undefined): boolean => !!id && !!VIEWS[id];

/**
 * The games a phone that only watches shows as the big screen does: their own view, or, for the
 * two with big screens of their own (到此一游's, the DJ booth's speaker), the way there.
 */
export const watchable = (id: GameId | null | undefined): boolean => hasTvView(id) || id === "trip" || id === "dj";

/** The game on the big screen: its own view (loaded when the game starts), never anyone's secrets. */
export function TvView({ v, sound, fallback = null }: { v: GameView; sound: boolean; fallback?: ReactNode }) {
  const shown = useMemo(() => publicView(v), [v]);
  const View = VIEWS[v.id] as LazyExoticComponent<ComponentType<TvViewProps>> | undefined;
  if (!View) return null;
  return (
    <Suspense fallback={fallback}>
      <View v={shown} sound={sound} />
    </Suspense>
  );
}

/**
 * What only one phone may know (its own word, card, pick or vote) is taken out before a view sees
 * it. A big screen's view never has any (its id has no seat), but a phone that only watches gets
 * the view drawn for its own seat, and someone who switched to watching halfway through a game
 * may still have a word or a card there. Nothing of it may reach the screen everyone looks at.
 */
export function publicView(v: GameView): GameView {
  switch (v.id) {
    case "undercover":
      return { ...v, myWord: null, isBlank: false, myVote: null };
    case "superlatives":
      return { ...v, myVote: null };
    case "drama":
      return { ...v, me: null, myVote: null };
    case "tune":
      return { ...v, mine: null };
    case "punchline":
      return { ...v, mine: [], match: v.match ? { ...v.match, mine: null, myVotes: [], canVote: false, maxVotes: 0 } : null };
    default:
      return v;
  }
}
