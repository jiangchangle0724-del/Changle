// The reactions (表情) on screen right now: each arrives from the room as it happens (store.ts) and
// shows for a few seconds. Kept apart from the app's state so a reaction redraws only its own layer,
// never the board under it (one can come in the middle of a move).
import type { ReactionId } from "../room/protocol";

export interface Shown {
  id: number;
  team: string;
  r: ReactionId;
}

/** How long a reaction shows (ms): it rises and fades out over this. */
export const REACT_SHOW = 2_800;
/** At most this many at once; an older one gives way. */
const MAX_SHOWN = 5;

let shown: Shown[] = [];
const subs = new Set<() => void>();

const tell = () => {
  for (const fn of subs) fn();
};

export function showReaction(x: Shown) {
  if (shown.some((s) => s.id === x.id)) return;
  shown = [...shown, x].slice(-MAX_SHOWN);
  tell();
  setTimeout(() => {
    shown = shown.filter((s) => s.id !== x.id);
    tell();
  }, REACT_SHOW);
}

export const reactionsNow = () => shown;

export function onReactions(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
