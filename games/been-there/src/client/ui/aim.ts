// The spaces the question in play is about, lit on the board (art/RoundBoard.tsx `aim`), so the
// players see where it would take the token, or which city it's about: where Beijing's Central Axis
// jumps to (straight across), where a car permit can take it (one space less, as thrown, one more),
// the routes an Air Miles card flies to; the city up for auction, or whose rent is put to the vote; the
// cities a card or Mumbai's dabbawalas can build on, knock down or move a house from. On a phone the map
// goes to the one it's about, where there's one (ui/mapView.ts `aim`).
import { BOARD_SIZE, CAIRO, ROUTE_SPACES, canBuildFree, canSell } from "../../engine";
import type { RoomView } from "../../room/protocol";

export interface Aim {
  /** The spaces lit, the one asked about most first. */
  spaces: number[];
  /** Where the token stands: a dashed path runs from there to the first space, round the ring as the
   * token walks, or straight across the middle (`across`). None: no path. */
  from?: number;
  across?: boolean;
  /** The map goes to the first space (a phone's: one question, one place); not to a choice of several
   * spread round the board. */
  look: boolean;
  /** The seat asked (-1: everyone, as at an auction). */
  who: number;
  /** One question: each new one lights up anew. */
  key: string;
}

const around = (at: number) => ((at % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;

/** The spaces the question in play is about, or null if it isn't about any. */
export function aimOf(v: RoomView): Aim | null {
  const s = v.game?.s;
  const pd = s?.pending;
  if (!s || !pd) return null;
  if (pd.k === "auction") return { spaces: [pd.at], look: true, who: -1, key: `${s.turns}:auction:${pd.at}` };
  if (!("who" in pd)) return null;
  const seat = pd.who;
  const pos = s.ps[seat]?.pos;
  if (pos === undefined) return null;
  const key = `${s.turns}:${pd.k}:${seat}:${pos}`;
  /** The team's own cities that pass `ok`. */
  const own = (ok: (at: number) => boolean) => s.deeds.flatMap((d, at) => (d && d.owner === seat && ok(at) ? [at] : []));
  switch (pd.k) {
    case "jump":
      return { spaces: [around(pos + BOARD_SIZE / 2)], from: pos, across: true, look: true, who: seat, key };
    case "permit":
      return { spaces: [0, -1, 1].map((d) => around(pos + pd.steps + d)), from: pos, look: true, who: seat, key };
    case "card-route":
      return { spaces: [...ROUTE_SPACES], look: false, who: seat, key };
    case "freeze":
      return { spaces: [pd.at], look: true, who: seat, key };
    case "card-house": {
      const spaces = own((at) => (pd.card === "review" ? canBuildFree(s, seat, at) : canSell(s, seat, at) && at !== CAIRO));
      return spaces.length ? { spaces, look: false, who: seat, key } : null;
    }
    case "mumbai": {
      const spaces = own((at) => canSell(s, seat, at));
      return spaces.length ? { spaces, look: false, who: seat, key } : null;
    }
    default:
      return null;
  }
}
