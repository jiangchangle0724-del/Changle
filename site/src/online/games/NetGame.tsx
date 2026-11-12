import { lazy, Suspense } from "react";
import { GAME_BY_ID } from "../../games/registry";
import type { GameView } from "../../shared/protocol";
import { watchable } from "../../tv/views";
import { NetFrame } from "../NetFrame";
import { useRoom } from "../RoomContext";
import { useStore } from "../../store";
import { PageLoading } from "../../games/GameLoading";
import { Skeleton } from "../../ui/Skeleton";
import { NetDice } from "./NetDice";
import { NetDraw } from "./NetDraw";
import { NetKing } from "./NetKing";
import { NetPrompts } from "./NetPrompts";
import { NetRogue } from "./NetRogue";
import { NetTruth } from "./NetTruth";
import { NetUndercover } from "./NetUndercover";
import { NetWheel } from "./NetWheel";
import { NetSuper } from "../../party/superlatives/NetSuper";
import { NetDrama } from "../../party/drama/NetDrama";
import { NetPunch } from "../../party/punchline/NetPunch";
import { NetPostit } from "../../party/postit/NetPostit";
import { NetFreeze } from "../../party/freeze/NetFreeze";
import { NetLimbo } from "../../party/limbo/NetLimbo";
import { NetTune } from "../../party/tune/NetTune";
import { NetEuchre } from "../../party/euchre/NetEuchre";
import { NetHide } from "../../party/hide/NetHide";
import { NetTrip } from "../../party/trip/NetTrip";
import { NetDj } from "../../party/dj/NetDj";

// a phone that only watches shows the big screen's view (src/tv): loaded only when one does
const Watch = lazy(() => import("../../tv/Watch"));
// 最后一张 (its cards, its screen, its styles) loads when its game starts
const NetLastCard = lazy(() => import("../../party/lastcard/NetLastCard"));
// 一本正经 too (its pictures, its screen, its styles)
const NetStraightFace = lazy(() => import("../../party/straightface/NetStraightFace"));

/** The game the server says is on, rendered for this phone. */
export function NetGame({ view, onLeave }: { view: GameView; onLeave: () => void }) {
  const { room, me } = useRoom();
  const { lang } = useStore();
  // a seat that only watches sees the game as the big screen does, to mirror to a TV (the game's
  // own phone screen doesn't run under it: its music and its jumps elsewhere are the screen's now);
  // not the host's, though: the game waits on the host's buttons (NetFrame says so)
  if (watchable(view.id) && room?.host !== me && room?.seats.some((s) => s.id === me && s.watch))
    return (
      <Suspense fallback={<PageLoading lang={lang} />}>
        <Watch v={view} />
      </Suspense>
    );
  switch (view.id) {
    case "rogue":
      return <NetRogue v={view} onLeave={onLeave} />;
    case "truth":
      return <NetTruth v={view} onLeave={onLeave} />;
    case "undercover":
      return <NetUndercover v={view} onLeave={onLeave} />;
    case "draw":
      return <NetDraw v={view} onLeave={onLeave} />;
    case "king":
      return <NetKing v={view} onLeave={onLeave} />;
    case "prompts":
      return <NetPrompts v={view} onLeave={onLeave} />;
    case "dice":
      return <NetDice v={view} onLeave={onLeave} />;
    case "wheel":
      return <NetWheel v={view} onLeave={onLeave} />;
    case "superlatives":
      return <NetSuper v={view} onLeave={onLeave} />;
    case "drama":
      return <NetDrama v={view} onLeave={onLeave} />;
    case "punchline":
      return <NetPunch v={view} onLeave={onLeave} />;
    case "postit":
      return <NetPostit v={view} onLeave={onLeave} />;
    case "freeze":
      return <NetFreeze v={view} onLeave={onLeave} />;
    case "limbo":
      return <NetLimbo v={view} onLeave={onLeave} />;
    case "tune":
      return <NetTune v={view} onLeave={onLeave} />;
    case "euchre":
      return <NetEuchre v={view} onLeave={onLeave} />;
    case "trip":
      return <NetTrip v={view} onLeave={onLeave} />;
    case "hide":
      return <NetHide v={view} onLeave={onLeave} />;
    case "dj":
      return <NetDj v={view} onLeave={onLeave} />;
    case "lastcard":
      return (
        <Suspense fallback={<NetFrame title={GAME_BY_ID.lastcard.name} onLeave={onLeave}><Skeleton lang={lang} shape="block" height="calc(var(--tap) * 6)" slowText={lang === "zh" ? "网有点慢，马上就好" : "Slow connection, nearly there"} /></NetFrame>}>
          <NetLastCard v={view} onLeave={onLeave} />
        </Suspense>
      );
    case "straightface":
      return (
        <Suspense fallback={<NetFrame title={GAME_BY_ID.straightface.name} onLeave={onLeave}><Skeleton lang={lang} shape="block" height="calc(var(--tap) * 6)" slowText={lang === "zh" ? "网有点慢，马上就好" : "Slow connection, nearly there"} /></NetFrame>}>
          <NetStraightFace v={view} onLeave={onLeave} />
        </Suspense>
      );
  }
}
