// Every place in range and budget, best first: the top as full cards with photos, then shorter
// cards that open with "More", ten more at a time, so a long list stays quick to scroll.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { OccasionId } from "../../engine";
import type { CardView } from "../../room/protocol";
import { t } from "../i18n";
import { Btn } from "./common";
import { PlaceCard } from "./PlaceCard";

/** Shorter cards at first, and how many more each "show more" adds. */
const STEP = 10;

export function RankedList(p: {
  cards: CardView[];
  /** How many full cards at the top. */
  top: number;
  /** What the meal is for (a card says when a place suits it). */
  occasion?: OccasionId;
  /** The buttons under each card (votes, "this one"); `full` for the top ones. */
  action: (c: CardView, full: boolean) => ComponentChildren;
  /** Shown once the whole list is on screen. */
  end?: ComponentChildren;
}) {
  const [shown, setShown] = useState(p.top + STEP);
  const more = Math.min(STEP, p.cards.length - shown);
  return (
    <>
      <p class="muted small">{t("listCount", { n: p.cards.length })}</p>
      <div class="places">
        {p.cards.slice(0, shown).map((c, i) => (
          <PlaceCard key={c.place.id} c={c} ranked compact={i >= p.top} occasion={p.occasion}>
            {p.action(c, i < p.top)}
          </PlaceCard>
        ))}
      </div>
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
