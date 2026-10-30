import type { GameId } from "../../protocol";
import type { GameDef } from "../api";
import { dice } from "./dice";
import { draw } from "./draw";
import { euchre } from "./euchre";
import { freeze } from "./freeze";
import { king } from "./king";
import { limbo } from "./limbo";
import { postit } from "./postit";
import { prompts } from "./prompts";
import { punchline } from "./punchline";
import { rogue } from "./rogue";
import { superlatives } from "./superlatives";
import { truth } from "./truth";
import { trip } from "./trip";
import { tune } from "./tune";
import { undercover } from "./undercover";
import { wheel } from "./wheel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<GameId, GameDef<any>> = { truth, rogue, trip, superlatives, king, postit, limbo, prompts, euchre, dice, freeze, wheel, undercover, tune, punchline, draw };
