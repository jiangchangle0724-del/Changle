// Every place in range and budget, best first: the top as full cards with photos, then shorter
// cards that open with "More", ten more at a time, so a long list stays quick to scroll.
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import type { OccasionId } from "../../engine";
import type { CardView } from "../../room/protocol";
import { t } from "../i18n";
import { Btn } from "./common";
import { PlaceCard } from "./PlaceCard";

/** Shorter cards at first, and how many more each "show more" adds. */
const STEP = 10;

export function RankedList(p: {
  cards: CardView[];
  /** This phone's veto dims only the card it was used on. */
  veto?: string | null;
  /** How many full cards at the top. */
  top: number;
  /** What the meal is for (a card says when a place suits it). */
  occasion?: OccasionId;
  /** Places open then but over someone's budget (the count says so). */
  overBudget?: number;
  /** The buttons under each card (votes, "this one"); `full` for the top ones. */
  action: (c: CardView, full: boolean) => ComponentChildren;
  /** Shown once the whole list is on screen. */
  end?: ComponentChildren;
  /**
   * Round 2 (Steve, 2026-11-25): each phone can show the list nearest first instead of best match
   * first. Only this phone's order: the table's ranking and the votes don't change.
   */
  sortable?: boolean;
}) {
  const [shown, setShown] = useState(p.top + STEP);
  const [order, setOrder] = useState<"best" | "near">("best");
  const initial = useRef(new Map(p.cards.slice(0, shown).map((c, i) => [c.place.id, i])));
  const cards = order === "near" ? [...p.cards].sort((a, b) => a.meters - b.meters) : p.cards;
  const more = Math.min(STEP, cards.length - shown);
  return (
    <>
      {p.sortable && (
        <div class="seg sort" role="group" aria-label={t("sortBy")}>
          {(["best", "near"] as const).map((o) => (
            <button key={o} type="button" class="press" data-sort={o} aria-pressed={order === o} onClick={() => setOrder(o)}>
              {t(o === "best" ? "sortBest" : "sortNear")}
            </button>
          ))}
        </div>
      )}
      <div class="places">
        {cards.slice(0, shown).map((c, i) => (
          // Nearest first, the rank numbers would jump about: they're the best-match order.
          <PlaceCard key={c.place.id} c={c} ranked={order === "best"} compact={i >= p.top} occasion={p.occasion} vetoed={p.veto === c.place.id} arrival={initial.current.get(c.place.id) ?? -1}>
            {p.action(c, i < p.top)}
          </PlaceCard>
        ))}
      </div>
      <p class="muted small">
        {t("listCount", { n: p.cards.length })}
        {p.overBudget ? t("listOver", { n: p.overBudget }) : ""}
      </p>
      {more > 0 ? (
        <Btn wide onClick={() => setShown(shown + STEP)}>
          {t("showMore", { n: more })}
        </Btn>
      ) : (
        p.end
      )}
    </>
  );
}
