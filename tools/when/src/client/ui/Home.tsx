// The home page: make a gathering. A name, the days to ask about, and whether to ask by the half
// day or by the day. Nothing else: the link is ready in under a minute.
import { useMemo, useState } from "preact/hooks";
import { BASE } from "../../base";
import { addDays, dateLabel, dayLabel, MAX_DAYS, vancouverDay, weekday } from "../../engine";
import type { Day, Grain } from "../../engine";
import { adoptKey, api, ApiFail, newKey, recents, remember } from "../api";
import { t, type Key } from "../i18n";
import { TopBar, useLang } from "./common";

const WEEK_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEK_EN = ["M", "T", "W", "T", "F", "S", "S"];
/** Days shown at first, how many more each time, and the furthest. */
const SPAN_START = 14;
const SPAN_STEP = 14;
const SPAN_MAX = 56;

export function Home() {
  const lang = useLang();
  const today = useMemo(() => vancouverDay(Date.now()), []);
  const [title, setTitle] = useState("");
  const [span, setSpan] = useState(SPAN_START);
  const [picked, setPicked] = useState<Set<Day>>(() => new Set(Array.from({ length: SPAN_START }, (_, i) => addDays(today, i))));
  const [grain, setGrain] = useState<Grain>("periods");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  const recent = useMemo(() => recents(), []);

  // whole weeks, Monday first, from the week today is in to the week the last day is in
  const last = addDays(today, span - 1);
  const first = addDays(today, -((weekday(today) + 6) % 7));
  const cells: Day[] = [];
  for (let day = first; day <= addDays(last, (7 - weekday(last)) % 7); day = addDays(day, 1)) cells.push(day);

  const toggle = (day: Day) => {
    setProblem(null);
    setPicked((before) => {
      const next = new Set(before);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  async function make(event: Event) {
    event.preventDefault();
    if (busy) return;
    const name = title.trim();
    if (!name) return setProblem("needTitle");
    if (picked.size < 1) return setProblem("needDays");
    if (picked.size > MAX_DAYS) return setProblem("tooManyDays");
    setBusy(true);
    setProblem(null);
    try {
      const key = newKey();
      const made = await api.create({ title: name, days: [...picked].sort(), grain }, key);
      adoptKey(made.code, key);
      remember({ code: made.code, title: made.state.title, mine: true, at: Date.now() });
      try {
        // shown once on the gathering's page, then forgotten
        sessionStorage.setItem(`when.fresh.${made.code}`, made.adminCode);
      } catch {
        // private mode: the admin code can't be shown; the phone that made it stays the host
      }
      location.assign(`${BASE}/${made.code}`);
    } catch (error) {
      setProblem(error instanceof ApiFail && error.code === "limit" ? "makeLimit" : "makeFailed");
      setBusy(false);
    }
  }

  return (
    <div class="page">
      <TopBar />
      <div class="hero">
        <h1>
          <span>{lang === "zh" ? "约时间" : "When Works"}</span>
          <small lang={lang === "zh" ? "en" : "zh-CN"}>{lang === "zh" ? "When Works" : "约时间"}</small>
        </h1>
        <p>{t("homeLine")}</p>
      </div>

      <form class="panel" onSubmit={make} noValidate>
        <h2 class="panel-title">{t("newTitle")}</h2>

        <label class="field">
          <span class="field-label">{t("titleLabel")}</span>
          <input type="text" name="title" value={title} maxLength={40} placeholder={t("titlePlaceholder")} autocomplete="off" enterkeyhint="done" onInput={(event) => (setTitle(event.currentTarget.value), setProblem(null))} />
        </label>

        <div class="field">
          <span class="field-label" id="days-label">
            {t("daysLabel")}
          </span>
          <p class="hint">{t("daysHint")}</p>
          <div class="cal" role="group" aria-labelledby="days-label">
            {(lang === "zh" ? WEEK_ZH : WEEK_EN).map((name, i) => (
              <span class="cal-head" key={`h${i}`} aria-hidden="true">
                {name}
              </span>
            ))}
            {cells.map((day) => {
              const out = day < today || day > last;
              const on = picked.has(day);
              const date = Number(day.slice(8, 10));
              return out ? (
                <span class="cal-gap" key={day} />
              ) : (
                <button type="button" class="cal-day" key={day} aria-pressed={on} aria-label={dayLabel(day, lang)} onClick={() => toggle(day)}>
                  {(date === 1 || day === today) && <small>{lang === "zh" ? `${Number(day.slice(5, 7))}月` : dateLabel(day, "en").slice(0, 3)}</small>}
                  <b>{date}</b>
                </button>
              );
            })}
          </div>
          <div class="row-between">
            <span class="hint" aria-live="polite">
              {t("daysCount", { n: picked.size })}
            </span>
            {span < SPAN_MAX && (
              <button type="button" class="link-btn" onClick={() => setSpan(Math.min(SPAN_MAX, span + SPAN_STEP))}>
                {t("moreDays")}
              </button>
            )}
          </div>
        </div>

        <div class="field">
          <span class="field-label" id="grain-label">
            {t("grainLabel")}
          </span>
          <div class="choice" role="group" aria-labelledby="grain-label">
            <button type="button" aria-pressed={grain === "periods"} onClick={() => setGrain("periods")}>
              <b>{t("grainPeriods")}</b>
              <small>{t("grainPeriodsSub")}</small>
            </button>
            <button type="button" aria-pressed={grain === "day"} onClick={() => setGrain("day")}>
              <b>{t("grainDay")}</b>
              <small>{t("grainDaySub")}</small>
            </button>
          </div>
        </div>

        {problem && (
          <p class="problem" role="alert">
            {t(problem)}
          </p>
        )}
        <button type="submit" class="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? t("making") : t("make")}
        </button>
      </form>

      {recent.length > 0 && (
        <section class="panel">
          <h2 class="panel-title">{t("recentTitle")}</h2>
          <ul class="recent">
            {recent.map((r) => (
              <li key={r.code}>
                <a href={`${BASE}/${r.code}`}>
                  <span>{r.title}</span>
                  {r.mine && <small>{t("recentMine")}</small>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p class="foot">{t("footNote")}</p>
    </div>
  );
}
