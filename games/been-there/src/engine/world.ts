// 世界大动荡 · World upheaval, a switch in the lobby's 更多规则 that is on unless the host turns it off.
// Every 20 minutes of a game (once, at 8 minutes, in a 15-minute game) something happens to the whole
// world and touches every team: a financial crisis, a meteor, a terror attack, the AI revolution, a new
// invention, a travel boom. Bad ones and good ones, each once before any comes round again. What it
// does at once is done by `worldEvent` (play.ts); what lasts, lasts two rounds, and is looked up here
// by the rules (rent, buying, building, the salary). The room decides when one comes (room.ts).
import { groupAt } from "./board";
import { BOARD, type Text } from "./data";
import type { GameState } from "./state";

const t = (zh: string, en: string): Text => ({ zh, en });

export type WorldId = "crash" | "meteor" | "terror" | "ai" | "invention" | "boom";

/** How long what a world event does lasts, in rounds. */
export const WORLD_ROUNDS = 2;
/** The crisis takes this share of every team's cash (in tens of dollars). */
export const CRASH_SHARE = 0.15;
/** The AI revolution earns every team this much. */
export const AI_GIFT = 50;

export interface WorldItem {
  id: WorldId;
  /** Good news or bad, for the card's colour. */
  good: boolean;
  title: Text;
  /** What it does in the game. */
  text: Text;
}

export const WORLD: WorldItem[] = [
  {
    id: "crash",
    good: false,
    title: t("全球经济危机", "Global financial crisis"),
    text: t(
      "每队现金立刻缩水 15%（交给银行）；两轮内全场租金减半。",
      "Every team loses 15% of its cash to the bank at once; for two rounds all rent is halved.",
    ),
  },
  {
    id: "meteor",
    good: false,
    title: t("陨石坠落", "Meteor strike"),
    text: t(
      "陨石砸中一座城市：那里的房子全毁，保险赔一半房钱；两轮内那里是陨石坑，不收租，不能买，不能盖房。",
      "A meteor hits a city: its buildings are gone, insurance pays back half of what they cost; for two rounds it's a crater: no rent, no buying, no building.",
    ),
  },
  {
    id: "terror",
    good: false,
    title: t("恐怖袭击", "Terror attack"),
    text: t(
      "一座城市全城戒严两轮：不收租，不能买，不能盖房；游客也不敢去它的地区，那里的城市租金减半。",
      "A city is locked down for two rounds: no rent, no buying, no building; visitors keep away from its region, where rent is halved.",
    ),
  },
  {
    id: "ai",
    good: true,
    title: t("AI 革命", "The AI revolution"),
    text: t(
      "AI 帮每队赚了 $50；机器人接管工地，两轮内盖房半价。",
      "AI earns every team $50; robots take over the building sites: for two rounds building costs half.",
    ),
  },
  {
    id: "invention",
    good: true,
    title: t("新发明：超音速客机", "New invention: the supersonic airliner"),
    text: t("两轮内航线租金翻倍，经过出发领双倍。", "For two rounds airline rent doubles, and passing Departure pays double."),
  },
  {
    id: "boom",
    good: true,
    title: t("全球旅游热", "Global travel boom"),
    text: t("人人都想出门：两轮内全场租金加五成。", "Everyone wants to travel: for two rounds all rent goes up by half."),
  },
];

export const WORLD_IDS: WorldId[] = WORLD.map((w) => w.id);

const BY_ID: Record<string, WorldItem> = Object.fromEntries(WORLD.map((w) => [w.id, w]));

export const worldById = (id: string): WorldItem | undefined => BY_ID[id];

/** The world event in force, if any (missing in games from before them). */
export const worldNow = (s: GameState) => s.world ?? null;

/** Rent on a space is multiplied by this while a world event is in force (0: none at all). */
export function worldRent(s: GameState, at: number): number {
  const w = worldNow(s);
  if (!w) return 1;
  const sp = BOARD[at];
  switch (w.id) {
    case "crash":
      return 0.5;
    case "boom":
      return 1.5;
    case "invention":
      return sp.k === "route" ? 2 : 1;
    case "meteor":
      return at === w.at ? 0 : 1;
    case "terror":
      if (at === w.at) return 0;
      return sp.k === "city" && w.at !== null && groupAt(at) === groupAt(w.at) ? 0.5 : 1;
    default:
      return 1;
  }
}

/** The city a meteor turned into a crater, or the one locked down: nobody buys, builds or pays rent there. */
export function worldClosed(s: GameState, at: number): boolean {
  const w = worldNow(s);
  return !!w && (w.id === "meteor" || w.id === "terror") && w.at === at;
}

/** Building costs this share while the AI revolution lasts. */
export const worldBuild = (s: GameState) => (worldNow(s)?.id === "ai" ? 0.5 : 1);

/** Passing Departure pays this many times the salary while the supersonic airliner is new. */
export const worldSalary = (s: GameState) => (worldNow(s)?.id === "invention" ? 2 : 1);
