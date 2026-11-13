// 世界大动荡 on the screens (engine/world.ts; the room brings one every 20 minutes). When one comes,
// every screen shows a 号外 card for a moment with its sound (the big screen's, or the phones' when
// there's none), and the board plays its effect on the map (art/RoundBoard.tsx). While it lasts, a
// banner says what it does and how many rounds it has left: in a phone's play window, at the head of
// the big screen's side; and the city a meteor hit, or the one locked down, wears a tag on the board.
import { useEffect, useRef, useState } from "preact/hooks";
import { worldById, type GameEvent, type WorldId } from "../../engine";
import { TIMING, type RoomView } from "../../room/protocol";
import { money, t, tx } from "../i18n";
import { sfx } from "../sound";
import { currentWorld, worldLine } from "./worldText";

type WorldEvent = Extract<GameEvent, { t: "world" }>;

/** A world event that has just come: feed id and event. */
export interface WorldMoment {
  id: number;
  e: WorldEvent;
}

/**
 * The world event that has just come, for `ms` (null after, or when dismissed). Only what comes while
 * this screen is up: one in the feed when it first drew is old news (its banner still says it's on).
 */
export function useWorldMoment(v: RoomView, ms: number): [WorldMoment | null, () => void] {
  const [now, setNow] = useState<WorldMoment | null>(null);
  const seen = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lastId = v.feed.length ? v.feed[v.feed.length - 1].id : 0;
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const from = seen.current;
    seen.current = Math.max(from ?? 0, lastId);
    if (from === null) return;
    const fresh = v.feed.filter((f) => f.id > from && f.t === "game" && f.e.t === "world" && f.e.on).at(-1);
    if (!fresh || fresh.t !== "game" || fresh.e.t !== "world") return;
    setNow({ id: fresh.id, e: fresh.e });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNow(null), ms);
  }, [lastId]);
  return [now, () => setNow(null)];
}

/** The event's picture, drawn in the travel posters' inks: a falling chart, a meteor, a cordon, a chip, a jet, a sun. */
export function WorldIcon({ id }: { id: WorldId }) {
  const common = { class: `world-icon wi-${id}`, viewBox: "0 0 64 64", "aria-hidden": "true" as const };
  switch (id) {
    case "crash":
      return (
        <svg {...common}>
          <path d="M8 54h48M8 54V10" class="wi-axis" />
          <path d="M10 16l10 8 8-4 9 14 7-3 12 17" class="wi-line" />
          <path d="M49 46l7 2-1-7" class="wi-line" />
        </svg>
      );
    case "meteor":
      return (
        <svg {...common}>
          <path d="M58 6L30 30M52 4L26 24M60 14L34 36" class="wi-tail" />
          <circle cx="22" cy="40" r="12" class="wi-rock" />
          <path d="M4 58c8-5 28-5 36 0" class="wi-axis" />
        </svg>
      );
    case "terror":
      return (
        <svg {...common}>
          <path d="M6 44L58 30M6 52L58 38" class="wi-tape" />
          <path d="M14 42l4 8M26 39l4 8M38 36l4 8M50 33l4 8" class="wi-axis" />
          <circle cx="32" cy="16" r="7" class="wi-lamp" />
        </svg>
      );
    case "ai":
      return (
        <svg {...common}>
          <rect x="18" y="18" width="28" height="28" rx="4" class="wi-chip" />
          <path d="M24 18v-8M32 18v-8M40 18v-8M24 46v8M32 46v8M40 46v8M18 24h-8M18 32h-8M18 40h-8M46 24h8M46 32h8M46 40h8" class="wi-axis" />
          <text x="32" y="37" class="wi-text">AI</text>
        </svg>
      );
    case "invention":
      return (
        <svg {...common}>
          <path d="M6 46c14-2 30-12 48-30" class="wi-trail" />
          <path d="M54 16l4-6-10 3-14 8-9-2-3 2 8 5-4 5-5-1-2 2 6 3 3 6 2-2-1-5 5-4 5 8 2-3-2-9z" class="wi-jet" />
        </svg>
      );
    case "boom":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="10" class="wi-sun" />
          <path d="M32 6v10M32 48v10M6 32h10M48 32h10M13 13l7 7M44 44l7 7M51 13l-7 7M20 44l-7 7" class="wi-rays" />
        </svg>
      );
  }
}

/** The card comes this long after the event, once the board has played it (styles.css .world-card's delay). */
export const WORLD_CARD_AT = 1_200;

/** The 号外 card when a world event comes: what happened, what it does for two rounds. Tap to put it away. */
export function WorldCard({ v, big }: { v: RoomView; big?: boolean }) {
  const [now, dismiss] = useWorldMoment(v, TIMING.worldCard);
  const played = useRef(0);
  // (the big screen's sound, or each phone's when there's no big screen in the room)
  const loud = big || !v.members.some((m) => m.role === "screen" && m.online);
  useEffect(() => {
    if (!now || played.current === now.id) return;
    played.current = now.id;
    if (loud) sfx.world(now.e.id);
  }, [now?.id]);
  if (!now || !v.game) return null;
  const item = worldById(now.e.id);
  if (!item) return null;
  const line = worldLine(v, now.e);
  const rule = tx(item.text);
  const mine = v.you.seats[0];
  const lost = now.e.lost && mine !== undefined ? now.e.lost[mine] : 0;
  return (
    <aside
      class={`world-card k-${item.id}${item.good ? " good" : " bad"}${big ? " big" : ""}`}
      role="status"
      aria-live="polite"
      key={now.id}
      onClick={big ? undefined : dismiss}
    >
      <p class="world-strip">
        <span>{t("worldBreaking")}</span>
        <span>{t("worldStrip")}</span>
      </p>
      <div class="world-body">
        <WorldIcon id={item.id} />
        <div class="world-words">
          <h2>{tx(item.title)}</h2>
          {line !== rule && <p class="world-line">{line}</p>}
          <p class="world-rule">{rule}</p>
          {lost > 0 && <p class="world-line">{t("world_crashYou", { amount: money(lost) })}</p>}
        </div>
      </div>
      {!big && (
        <button type="button" class="world-ok" onClick={dismiss}>
          {t("worldClose")}
        </button>
      )}
    </aside>
  );
}

/** While a world event lasts: what it is, what it does, how long it has left. */
export function WorldBanner({ v, big }: { v: RoomView; big?: boolean }) {
  const now = v.game ? currentWorld(v.game.s) : null;
  if (!now) return null;
  const { item, left } = now;
  return (
    <article class={`world-banner k-${item.id}${item.good ? " good" : " bad"}${big ? " big" : ""}`} key={item.id}>
      <p class="pass-strip">
        <span>{t("worldStrip")}</span>
        <span>{left > 1 ? t("newsLeft", { n: left }) : t("newsLast")}</span>
      </p>
      <div class="world-banner-body">
        <WorldIcon id={item.id} />
        <div>
          <h3>{tx(item.title)}</h3>
          <p class="world-rule">{worldBannerLine(v)}</p>
        </div>
      </div>
    </article>
  );
}

/** What the one in force does now: the city it struck for the two that strike one, else its rule. */
function worldBannerLine(v: RoomView): string {
  const w = v.game!.s.world!;
  const item = worldById(w.id)!;
  if ((w.id === "meteor" || w.id === "terror") && w.at !== null) {
    const e: WorldEvent = { t: "world", id: w.id, on: true, at: w.at };
    return `${worldLine(v, e)}${t("worldUntil")}`;
  }
  return tx(item.text);
}
