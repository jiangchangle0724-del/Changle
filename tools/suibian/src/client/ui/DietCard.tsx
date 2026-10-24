// My diet card: allergies (two levels), anything else typed in, halal, vegetarian, budget.
import { useState } from "preact/hooks";
import { ALLERGENS, BUDGETS, MAX_CUSTOM, MAX_CUSTOM_LENGTH, NO_LIMITS, type AllergenId, type AllergyLevel, type Limits } from "../../engine";
import { CUSTOM_SUGGESTIONS, getLang, t, tx } from "../i18n";
import { Btn } from "./common";

const next = { none: "avoid", avoid: "severe", severe: "none" } as const;

export function DietCard({ initial, onDone, saved }: { initial: Limits | null; onDone: (l: Limits) => void; saved?: boolean }) {
  const [l, setL] = useState<Limits>(initial ? { ...NO_LIMITS, ...initial, custom: initial.custom ?? [] } : NO_LIMITS);
  const [typed, setTyped] = useState("");
  const cycle = (a: AllergenId) => {
    const allergies = { ...l.allergies };
    const to = next[l.allergies[a] ?? "none"];
    if (to === "none") delete allergies[a];
    else allergies[a] = to;
    setL({ ...l, allergies });
  };
  const has = (name: string) => l.custom.some((c) => c.name.toLowerCase() === name.toLowerCase());
  const add = (raw: string) => {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_LENGTH);
    if (name && !has(name) && l.custom.length < MAX_CUSTOM) setL({ ...l, custom: [...l.custom, { name, level: "avoid" }] });
    setTyped("");
  };
  const cycleCustom = (name: string) => {
    const custom = l.custom
      .map((c) => (c.name === name ? { ...c, level: next[c.level] as AllergyLevel | "none" } : c))
      .filter((c): c is { name: string; level: AllergyLevel } => c.level !== "none");
    setL({ ...l, custom });
  };
  const empty = !Object.keys(l.allergies).length && !l.custom.length && !l.halal && !l.vegetarian && !l.budget;
  const levelText = (level: AllergyLevel) => t(level === "severe" ? "levelSevere" : "levelAvoid");
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
              {level !== "none" && <small> · {levelText(level)}</small>}
            </button>
          );
        })}
      </div>

      <h3>{t("custom")}</h3>
      <p class="muted small">{t("customHint")}</p>
      {l.custom.length > 0 && (
        <div class="chips">
          {l.custom.map((c) => (
            <button key={c.name} type="button" class={`chip ${c.level}`} data-custom={c.name} aria-pressed="true" onClick={() => cycleCustom(c.name)}>
              {c.name}
              <small> · {levelText(c.level)}</small>
            </button>
          ))}
        </div>
      )}
      {l.custom.length < MAX_CUSTOM && (
        <>
          <form
            class="joinrow"
            onSubmit={(e) => {
              e.preventDefault();
              add(typed);
            }}
          >
            <input
              value={typed}
              maxLength={MAX_CUSTOM_LENGTH}
              placeholder={t("customPlaceholder")}
              aria-label={t("custom")}
              onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
            />
            <Btn disabled={!typed.trim()} onClick={() => add(typed)}>
              {t("customAdd")}
            </Btn>
          </form>
          <div class="chips">
            {CUSTOM_SUGGESTIONS[getLang()]
              .filter((s) => !has(s))
              .map((s) => (
                <button key={s} type="button" class="chip suggest" onClick={() => add(s)}>
                  + {s}
                </button>
              ))}
          </div>
        </>
      )}

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
