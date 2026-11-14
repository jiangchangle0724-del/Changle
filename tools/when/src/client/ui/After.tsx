// Once the time is set, everyone's page asks what's next: tell the group (the result, ready to
// paste, in Chinese and in English), choose where to eat (随便, changle.ca/eat), or pick a game
// (开席, the site's home page). In this first version only the host goes to 随便 to open a table,
// so one gathering doesn't end up with several; everyone else waits for the table's link.
// 随便 doesn't read what the link carries yet, so the page says what to pick there.
import { useState } from "preact/hooks";
import { addDays, counted, dayLabel, EAT_DAYS_AHEAD, eatLink, eatWhen, mealLabel, reason, resultText, vancouverDay, whenLabel } from "../../engine";
import type { EventState, Lang, Person, Tally } from "../../engine";
import { t } from "../i18n";
import { CopyButton, IconPicture, inWeChat, useLang } from "./common";
import { PictureSheet, resultPicture } from "./Picture";

export function After({ state, tally, people, host, link }: { state: EventState; tally: Tally; people: Person[]; host: boolean; link: string }) {
  const lang = useLang();
  const [picture, setPicture] = useState(false);
  if (!state.settled) return null;
  const { day, part, from, to } = state.settled;
  const when = eatWhen(day, vancouverDay(Date.now()));
  // who can come at the time that was set (the tally passed in counts them for it)
  const { yes, maybe } = counted(tally);
  const coming = yes.length + maybe.length;
  // a time set to the minute: the meal starts when it does
  const eat = eatLink({ code: state.code, day, part, from, coming });
  const words = (inLang: Lang) => resultText({ title: state.title, day, part, from, to, tally, people, url: link }, inLang);
  const other: Lang = lang === "zh" ? "en" : "zh";

  return (
    <section class="panel after">
      <h2 class="panel-title">{t("afterTitle")}</h2>

      <div class="after-block">
        <h3>{t("afterTell")}</h3>
        <div class="row">
          <CopyButton text={words(lang)} label={t(lang === "zh" ? "copyZh" : "copyEn")} kind="primary" />
          <CopyButton text={words(other)} label={t(other === "zh" ? "copyZh" : "copyEn")} />
          <button type="button" class="btn btn-quiet" onClick={() => setPicture(true)}>
            <IconPicture />
            {t("picResult")}
          </button>
        </div>
      </div>

      {when !== "past" && (
        <div class="after-block">
          <h3>{t("afterEat")}</h3>
          {!host ? (
            <p class="hint">{t("eatWait")}</p>
          ) : when === "later" ? (
            <>
              <button type="button" class="btn btn-quiet" disabled>
                {t("eatLater")}
              </button>
              <p class="hint">{t("eatLaterNote", { day: dayLabel(addDays(day, -EAT_DAYS_AHEAD), lang) })}</p>
            </>
          ) : (
            <>
              <a class="btn btn-quiet" href={eat}>
                {t("eatGo")}
              </a>
              <p class="hint">{t("eatPick", { when: dayLabel(day, lang), time: mealLabel(part, lang, from) })}</p>
              {inWeChat() && (
                <>
                  <p class="note">{t("eatWeChat")}</p>
                  <CopyButton text={`${location.origin}${eat}`} label={t("eatCopy")} />
                </>
              )}
            </>
          )}
        </div>
      )}

      <div class="after-block">
        <h3>{t("afterPlay")}</h3>
        <a class="btn btn-quiet" href="/">
          {t("playGo")}
        </a>
        <p class="hint">{t("playNote")}</p>
      </div>

      {picture && (
        <PictureSheet
          picture={resultPicture(state, tally, people, link, lang)}
          title={t("picResult")}
          alt={t("picAltResult", { title: state.title, when: whenLabel(day, part, lang, from, to), who: reason(tally, people, lang) })}
          file={`when-${state.code}-result.jpg`}
          onClose={() => setPicture(false)}
        />
      )}
    </section>
  );
}
