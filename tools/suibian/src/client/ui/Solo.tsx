// One person who doesn't know what to eat: six quick questions (when, mood, side of the menu,
// budget, where and how far, diet card), then every place in range and budget, ranked, with the reasons.
import { useState } from "preact/hooks";
import { BASE } from "../../base";
import { BUDGETS, NO_LIMITS, SOLO_MOODS, SOLO_SIDES, SOLO_TOP, type Budget, type Limits, type SoloMood, type SoloSide } from "../../engine";
import type { CardView, SoloResponse } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { api } from "../net";
import { prefs } from "../prefs";
import { toast, update, useApp } from "../store";
import { Btn, DemoBanner, LangToggle } from "./common";
import { DietCard } from "./DietCard";
import { PlaceCard } from "./PlaceCard";
import { RankedList } from "./RankedList";
import { WhenPicker } from "./WhenPicker";
import { WhereFields, useWhere } from "./Where";
import { whenLabel } from "../when";

const MOOD_EMOJI: Record<SoloMood, string> = { warm: "🍲", bold: "🌶️", light: "🥗", sweet: "🍰", any: "🎲" };
const SIDE_EMOJI: Record<SoloSide, string> = { chinese: "🥢", jk: "🍣", asia: "🍜", west: "🍝", any: "🎲" };
const STEPS = 6;

type Stage =
  | { k: "ask"; step: number }
  | { k: "finding" }
  | { k: "picks"; cards: CardView[]; at?: number }
  | { k: "chosen"; card: CardView; at?: number };

export function Solo({ home }: { home: () => void }) {
  const { me } = useApp();
  const [stage, setStage] = useState<Stage>({ k: "ask", step: 0 });
  // Nothing is highlighted until it's chosen; an unanswered question counts as "any".
  const [at, setAt] = useState<number | null>(null);
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
      // Save allergies and the rest for next time, but not today's budget: that was this search's
      // answer, and the saved one is what tables start from.
      const saved = { ...limits, budget: me.card?.budget ?? 0 };
      void api("/api/me/card", { method: "PUT", body: JSON.stringify(saved) });
      update({ me: { ...me, card: saved } });
    }
    setStage({ k: "finding" });
    const res = await api<SoloResponse>("/api/solo", {
      method: "POST",
      body: JSON.stringify({ center, range: where.range, answers: { mood: mood ?? "any", side: side ?? "any" }, limits, lang: prefs.lang, at }),
    });
    const d = res.data ?? {};
    if (res.ok && d.cards?.length) return setStage({ k: "picks", cards: d.cards, at: d.at });
    const why = d.error === "quota" ? "quota" : d.error === "login" ? "soloLogin" : d.error === "nothingNearby" || d.error === "nothingFits" || d.error === "searchFailed" ? d.error : "offline";
    setErr(t(why as Key));
    setStage({ k: "ask", step: 4 });
  };

  /** Remember the pick on the account, so the home page asks how it was (and it can be rated). */
  const choose = (c: CardView, planned?: number) => {
    setStage({ k: "chosen", card: c, at: planned });
    if (!me?.user) return;
    void api("/api/me/last", { method: "POST", body: JSON.stringify({ place: c.place.id, name: c.place.name }) });
    update({ me: { ...me, last: { place: c.place.id, name: c.place.name, at: Date.now() } } });
  };

  const share = async (c: CardView, planned?: number) => {
    const vars = { name: c.place.name, map: c.place.mapsUrl ?? "" };
    const text = planned ? t("soloShareTextAt", { ...vars, when: whenLabel(planned) }) : t("soloShareText", vars);
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
            <section class="card">
              <h2>{t("soloQ0")}</h2>
              <p class="muted small">{t("whenHint")}</p>
              <WhenPicker value={at} onChange={setAt} />
              <Btn kind="primary" wide onClick={() => ask(1)}>
                {t("soloNext")}
              </Btn>
            </section>
          )}
          {stage.step === 1 && (
            <Question title={t("soloQ1")}>
              {SOLO_MOODS.map((m) => (
                <Choice key={m} emoji={MOOD_EMOJI[m]} label={t(`mood_${m}` as Key)} hint={t(`mood_${m}_hint` as Key)} on={mood === m} pick={() => (setMood(m), ask(2))} />
              ))}
            </Question>
          )}
          {stage.step === 2 && (
            <Question title={t("soloQ2")}>
              {SOLO_SIDES.map((s) => (
                <Choice key={s} emoji={SIDE_EMOJI[s]} label={t(`side_${s}` as Key)} hint={t(`side_${s}_hint` as Key)} on={side === s} pick={() => (setSide(s), ask(3))} />
              ))}
            </Question>
          )}
          {stage.step === 3 && (
            <section class="card">
              <h2>{t("soloQ3")}</h2>
              <div class="seg">
                {BUDGETS.map((b) => (
                  <button key={b} type="button" aria-pressed={budget === b} onClick={() => (setBudget(b), ask(4))}>
                    {b === 0 ? t("budgetAny") : t("budgetUpTo", { n: b })}
                  </button>
                ))}
              </div>
            </section>
          )}
          {stage.step === 4 && (
            <section class="card">
              <h2>{t("soloQ4")}</h2>
              <WhereFields w={where} />
              <Btn kind="primary" wide disabled={where.waiting} onClick={() => ask(5)}>
                {t("soloNext")}
              </Btn>
            </section>
          )}
          {stage.step === 5 && (
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
          {stage.at && <p class="planned small">{t("plannedFor", { when: whenLabel(stage.at) })}</p>}
          <RankedList
            cards={stage.cards}
            top={SOLO_TOP}
            action={(c, full) => (
              <Btn kind={full ? "primary" : undefined} wide onClick={() => choose(c, stage.at)}>
                {t("soloThis")}
              </Btn>
            )}
            end={<p class="muted small center">{t(where.range === "any" ? "soloNoMoreAny" : "soloNoMore")}</p>}
          />
          <p class="muted small center">{t("google")}</p>
          <Btn kind="quiet" wide onClick={() => ask(0)}>
            {t("soloRestart")}
          </Btn>
        </>
      )}

      {stage.k === "chosen" && (
        <>
          <h2 class="question center">{stage.at ? t("soloChosenAt", { when: whenLabel(stage.at) }) : t("soloChosen")}</h2>
          <PlaceCard c={stage.card} />
          <p class="muted small center">{t("tellServer")}</p>
          <Btn kind="primary" wide onClick={() => void share(stage.card, stage.at)}>
            {t("soloShare")}
          </Btn>
          {me?.user && (
            <a class="btn wide" href={`${BASE}/rate`}>
              {t("rateAfter")}
            </a>
          )}
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
