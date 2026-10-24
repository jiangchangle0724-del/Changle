// My diet card: allergies (two levels), halal, vegetarian, budget.
import { useState } from "preact/hooks";
import { ALLERGENS, BUDGETS, NO_LIMITS, type AllergenId, type Limits } from "../../engine";
import { t, tx } from "../i18n";
import { Btn } from "./common";

const next = { none: "avoid", avoid: "severe", severe: "none" } as const;

export function DietCard({ initial, onDone, saved }: { initial: Limits | null; onDone: (l: Limits) => void; saved?: boolean }) {
  const [l, setL] = useState<Limits>(initial ?? NO_LIMITS);
  const cycle = (a: AllergenId) => {
    const now = l.allergies[a] ?? "none";
    const allergies = { ...l.allergies };
    const to = next[now];
    if (to === "none") delete allergies[a];
    else allergies[a] = to;
    setL({ ...l, allergies });
  };
  const empty = !Object.keys(l.allergies).length && !l.halal && !l.vegetarian && !l.budget;
  return (
    <section class="diet">
      <h2>{t("dietCard")}</h2>
      <p class="muted small">{t("dietPrivate")}</p>
      <h3>{t("allergies")}</h3>
      <p class="muted small">{t("levelHint")}</p>
      <div class="chips">
        {(Object.keys(ALLERGENS) as AllergenId[]).map((a) => {
          const level = l.allergies[a] ?? "none";
          return (
            <button key={a} type="button" class={`chip ${level}`} data-allergen={a} aria-pressed={level !== "none"} onClick={() => cycle(a)}>
              {tx(ALLERGENS[a])}
              {level !== "none" && <small> · {t(level === "severe" ? "levelSevere" : "levelAvoid")}</small>}
            </button>
          );
        })}
      </div>
      <div class="toggles">
        <label class="check">
          <input type="checkbox" checked={l.halal} onChange={(e) => setL({ ...l, halal: (e.target as HTMLInputElement).checked })} />
          {t("halal")}
        </label>
        <label class="check">
          <input type="checkbox" checked={l.vegetarian} onChange={(e) => setL({ ...l, vegetarian: (e.target as HTMLInputElement).checked })} />
          {t("vegetarian")}
        </label>
      </div>
      <h3>{t("budget")}</h3>
      <div class="seg">
        {BUDGETS.map((b) => (
          <button key={b} type="button" aria-pressed={l.budget === b} onClick={() => setL({ ...l, budget: b })}>
            {b ? `$${b}` : t("budgetAny")}
          </button>
        ))}
      </div>
      <Btn kind="primary" wide onClick={() => onDone(l)}>
        {empty ? t("nothingToAvoid") : t("saveCard")}
      </Btn>
      {saved && <p class="muted small center">{t("dietSaved")}</p>}
    </section>
  );
}
