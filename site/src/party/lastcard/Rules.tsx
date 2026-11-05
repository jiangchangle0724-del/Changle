import { cardOf, COLOR_NAME, LC_COLORS } from "../../shared/lastcard/cards";
import { usePenaltyText, useStore } from "../../store";
import { CardArt, Mark } from "./Card";
import { rulesOf } from "./words";

/** The rules, short, and the four colours with their shapes (so they read apart without colour too). */
export function LcRules({ stack }: { stack: boolean | null }) {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const lines = rulesOf(stack, custom);
  return (
    <>
      <p className="lc-legend">
        {LC_COLORS.map((c) => (
          <span key={c} className={`lc-legend-item is-${c}`}>
            <Mark c={c} ink />
            {zh ? COLOR_NAME[c].zh : COLOR_NAME[c].en}
          </span>
        ))}
      </p>
      <ul className="lc-rules">
        {(zh ? lines.zh : lines.en).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** A fan of three of the game's cards: the picture on its first screens. */
export function Fan({ className = "" }: { className?: string }) {
  return (
    <div className={`lc-fan ${className}`} aria-hidden="true">
      <CardArt id={cardOf("r", "7")} />
      <CardArt id={cardOf(null, "wild")} />
      <CardArt id={cardOf("b", "d2")} />
    </div>
  );
}
