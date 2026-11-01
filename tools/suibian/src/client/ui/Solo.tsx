// One person who doesn't know what to eat: five quick questions (mood, side of the menu, budget,
// where and how far, diet card), then three places at a time with the reasons they were picked.
import { useState } from "preact/hooks";
import { BASE } from "../../base";
import { BUDGETS, NO_LIMITS, SOLO_MOODS, SOLO_SIDES, type Budget, type Limits, type SoloMood, type SoloSide } from "../../engine";
import type { SoloCard, SoloResponse } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { api } from "../net";
import { prefs } from "../prefs";
import { toast, update, useApp } from "../store";
import { Btn, DemoBanner, LangToggle } from "./common";
import { DietCard } from "./DietCard";
import { PlaceCard } from "./PlaceCard";
import { WhereFields, useWhere } from "./Where";

const MOOD_EMOJI: Record<SoloMood, string> = { warm: "🍲", bold: "🌶️", light: "🥗", sweet: "🍰", any: "🎲" };
const SIDE_EMOJI: Record<SoloSide, string> = { chinese: "🥢", jk: "🍣", asia: "🍜", west: "🍝", any: "🎲" };
const STEPS = 5;

type Stage = { k: "ask"; step: number } | { k: "finding" } | { k: "picks"; cards: SoloCard[]; relaxed: boolean; batch: number } | { k: "chosen"; card: SoloCard };

export function Solo({ home }: { home: () => void }) {
  const { me } = useApp();
  const [stage, setStage] = useState<Stage>({ k: "ask", step: 0 });
  // Nothing is highlighted until it's chosen; an unanswered question counts as "any".
  const [mood, setMood] = useState<SoloMood | null>(null);
  const [side, setSide] = useState<SoloSide | null>(null);
  const [budget, setBudget] = useState<Budget>(me?.card?.budget ?? 0);
  const [err, setErr] = useState("");
  const where = useWhere(setErr);

  const ask = (step: number) => {
    setErr("");
    setStage({ k: "ask", step });
  };

  const find = async (limits: Limits) => {
    const center = where.center();
    if (!center) return setErr(t("noLocation"));
    prefs.start = { center, range: where.range };
    if (me?.user) {
      void api("/api/me/card", { method: "PUT", body: JSON.stringify(limits) });
      update({ me: { ...me, card: limits } });
    }
    setStage({ k: "finding" });
    const res = await api<SoloResponse>("/api/solo", {
      method: "POST",
      body: JSON.stringify({ center, range: where.range, answers: { mood: mood ?? "any", side: side ?? "any" }, limits, lang: prefs.lang }),
    });
    const d = res.data ?? {};
    if (res.ok && d.cards?.length) return setStage({ k: "picks", cards: d.cards, relaxed: !!d.relaxed, batch: 0 });
    const why = d.error === "quota" ? "quota" : d.error === "login" ? "soloLogin" : d.error === "nothingNearby" || d.error === "nothingFits" || d.error === "searchFailed" ? d.error : "offline";
    setErr(t(why as Key));
    setStage({ k: "ask", step: 3 });
  };

  const share = async (c: SoloCard) => {
    const text = t("soloShareText", { name: c.place.name, map: c.place.mapsUrl ?? "" });
    try {
      if (navigator.share) return await navigator.share({ text });
    } catch {
      return;
    }
    await navigator.clipboard?.writeText(text);
    toast(t("copied"));
  };

  return (
    <main class="page solo">
      <header class="bar">
        <a
          class="brand"
          href={`${BASE}/`}
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
        >
          🥢 {t("title")}
        </a>
        <LangToggle />
      </header>
      {me && <DemoBanner demo={me.demo} />}

      {stage.k === "ask" && (
        <>
          <p class="steps muted small" aria-live="polite">
            {stage.step + 1}/{STEPS}
          </p>
          {stage.step === 0 && (
            <Question title={t("soloQ1")}>
              {SOLO_MOODS.map((m) => (
                <Choice key={m} emoji={MOOD_EMOJI[m]} label={t(`mood_${m}` as Key)} hint={t(`mood_${m}_hint` as Key)} on={mood === m} pick={() => (setMood(m), ask(1))} />
              ))}
            </Question>
          )}
          {stage.step === 1 && (
            <Question title={t("soloQ2")}>
              {SOLO_SIDES.map((s) => (
                <Choice key={s} emoji={SIDE_EMOJI[s]} label={t(`side_${s}` as Key)} hint={t(`side_${s}_hint` as Key)} on={side === s} pick={() => (setSide(s), ask(2))} />
              ))}
            </Question>
          )}
          {stage.step === 2 && (
            <section class="card">
              <h2>{t("soloQ3")}</h2>
              <div class="seg">
                {BUDGETS.map((b) => (
                  <button key={b} type="button" aria-pressed={budget === b} onClick={() => (setBudget(b), ask(3))}>
                    {b === 0 ? t("budgetAny") : t("budgetUpTo", { n: b })}
                  </button>
                ))}
              </div>
            </section>
          )}
          {stage.step === 3 && (
            <section class="card">
              <h2>{t("soloQ4")}</h2>
              <WhereFields w={where} />
              <Btn kind="primary" wide disabled={where.waiting} onClick={() => ask(4)}>
                {t("soloNext")}
              </Btn>
            </section>
          )}
          {stage.step === 4 && (
            <>
              <h2 class="question">{t("soloQ5")}</h2>
              <DietCard initial={{ ...NO_LIMITS, ...(me?.card ?? {}), budget }} saved={!!me?.user} onDone={(l) => void find(l)} />
            </>
          )}
          {err && (
            <p class="error" role="alert">
              {err}
            </p>
          )}
          {stage.step > 0 && (
            <Btn kind="quiet" onClick={() => ask(stage.step - 1)}>
              ← {t("soloBack")}
            </Btn>
          )}
        </>
      )}

      {stage.k === "finding" && <p class="big center">{t("soloFinding")}</p>}

      {stage.k === "picks" && (
        <>
          <h2 class="question">{t("soloResults")}</h2>
          {stage.relaxed && <p class="warn small">{t("soloRelaxed")}</p>}
          <section class="places">
            {stage.cards.slice(stage.batch * 3, stage.batch * 3 + 3).map((c) => (
              <PlaceCard key={c.place.id} c={c} reasons={c.reasons}>
                <Btn kind="primary" wide onClick={() => setStage({ k: "chosen", card: c })}>
                  {t("soloThis")}
                </Btn>
              </PlaceCard>
            ))}
          </section>
          <p class="muted small center">{t("google")}</p>
          <div class="row">
            {stage.cards.length > (stage.batch + 1) * 3 ? (
              <Btn wide onClick={() => setStage({ ...stage, batch: stage.batch + 1 })}>
                {t("soloMore")}
              </Btn>
            ) : (
              <p class="muted small center">{t("soloNoMore")}</p>
            )}
            <Btn kind="quiet" wide onClick={() => ask(0)}>
              {t("soloRestart")}
            </Btn>
          </div>
        </>
      )}

      {stage.k === "chosen" && (
        <>
          <h2 class="question center">{t("soloChosen")}</h2>
          <PlaceCard c={stage.card} reasons={stage.card.reasons} />
          <p class="muted small center">{t("tellServer")}</p>
          <Btn kind="primary" wide onClick={() => void share(stage.card)}>
            {t("soloShare")}
          </Btn>
          <Btn kind="quiet" wide onClick={() => ask(0)}>
            {t("soloRestart")}
          </Btn>
        </>
      )}
    </main>
  );
}

function Question({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section>
      <h2 class="question">{title}</h2>
      <div class="choices">{children}</div>
    </section>
  );
}

function Choice({ emoji, label, hint, on, pick }: { emoji: string; label: string; hint: string; on: boolean; pick: () => void }) {
  return (
    <button type="button" class={`choice${on ? " on" : ""}`} aria-pressed={on} onClick={pick}>
      <span class="emoji" aria-hidden="true">
        {emoji}
      </span>
      <span class="label">{label}</span>
      <span class="hint">{hint}</span>
    </button>
  );
}
