// What a world event (engine/world.ts) did, in words: for the log, the 号外 card and the banner while
// it lasts. The two that strike a city say which, and what the meteor took.
import { GROUPS, groupAt, worldById, type GameEvent, type GameState, type WorldItem } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { getLang, groupName, money, spaceName, t, tx } from "../i18n";
import { seatName } from "./common";

type WorldEvent = Extract<GameEvent, { t: "world" }>;

const sep = () => (getLang() === "zh" ? "，" : "; ");

/** The city line of a meteor or a terror attack, and what the meteor took; for the others, what it does. */
export function worldLine(v: RoomView, e: WorldEvent): string {
  const w = worldById(e.id);
  if (!w) return "";
  if (e.id === "meteor" && e.at !== undefined) {
    const parts = [t("world_meteor_at", { city: spaceName(e.at) })];
    if (e.houses && e.owner !== undefined)
      parts.push(t(e.houses >= 5 ? "world_hotel" : "world_houses", { team: seatName(v, e.owner), n: e.houses, amount: money(e.refund ?? 0) }));
    return parts.join(sep());
  }
  if (e.id === "terror" && e.at !== undefined) {
    const g = groupAt(e.at);
    const parts = [t("world_terror_at", { city: spaceName(e.at) })];
    if (g !== null && GROUPS.some((x) => x.id === g)) parts.push(t("world_terror_region", { region: groupName(g) }));
    return parts.join(sep());
  }
  return tx(w.text);
}

/** The world event in force and the rounds it has left (counting this one). */
export function currentWorld(s: GameState): { item: WorldItem; at: number | null; left: number } | null {
  const w = s.world;
  if (!w) return null;
  const item = worldById(w.id);
  if (!item) return null;
  const round = Math.max(1, s.ps.filter((p) => !p.out).length);
  return { item, at: w.at, left: Math.max(1, Math.ceil((w.until - s.turns) / round)) };
}
