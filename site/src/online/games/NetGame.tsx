import type { GameView } from "../../shared/protocol";
import { NetDice } from "./NetDice";
import { NetDraw } from "./NetDraw";
import { NetKing } from "./NetKing";
import { NetPrompts } from "./NetPrompts";
import { NetRogue } from "./NetRogue";
import { NetTruth } from "./NetTruth";
import { NetUndercover } from "./NetUndercover";
import { NetWheel } from "./NetWheel";
import { NetSuper } from "../../party/superlatives/NetSuper";
import { NetPunch } from "../../party/punchline/NetPunch";
import { NetPostit } from "../../party/postit/NetPostit";
import { NetFreeze } from "../../party/freeze/NetFreeze";
import { NetLimbo } from "../../party/limbo/NetLimbo";
import { NetTune } from "../../party/tune/NetTune";
import { NetEuchre } from "../../party/euchre/NetEuchre";
import { NetTrip } from "../../party/trip/NetTrip";

/** The game the server says is on, rendered for this phone. */
export function NetGame({ view, onLeave }: { view: GameView; onLeave: () => void }) {
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
  }
}
