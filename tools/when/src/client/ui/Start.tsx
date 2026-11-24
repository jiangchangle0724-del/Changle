// 几点开始, on the banner of the time that was set: the times the host is asking about, each to tap
// when it suits you, with how many it suits; and the host's sheet to choose those times.
import { User } from "lucide-preact";
import { useState } from "preact/hooks";
import { clock, leadingStart, startChoices, startTally, STARTS_MAX, STARTS_MIN } from "../../engine";
import type { Person } from "../../engine";
import { t } from "../i18n";
import { Sheet, useLang } from "./common";

/** `me`: this phone's row, which it takes to vote. The host sets the time most people tapped. */
export function StartPoll({
  times,
  people,
  me,
  host,
  onVote,
  onSet,
  onChange,
}: {
  times: number[];
  people: Person[];
  me: Person | undefined;
  host: boolean;
  onVote: (starts: number[]) => void;
  onSet: (at: number) => void;
  onChange: () => void;
}) {
  useLang();
  const tally = startTally(times, people);
  const lead = leadingStart(tally);
  const mine = me?.starts ?? [];
  return (
    <div class="starts">
      <p class="starts-q" id="starts-q">
        {t("startAsk")}
      </p>
      <div class="starts-times" role="group" aria-labelledby="starts-q">
        {tally.map(({ at, ids }) => {
          const on = mine.includes(at);
          return (
            <button
              key={at}
              type="button"
              aria-pressed={on}
              disabled={!me}
              aria-label={t("startCountLabel", { time: clock(at), n: ids.length })}
              onClick={() => onVote(on ? mine.filter((x) => x !== at) : [...mine, at])}
            >
              <b>{clock(at)}</b>
              {/* how many it suits, once anyone has said */}
              {ids.length > 0 && (
                <small>
                  <User size={12} strokeWidth={2.5} aria-hidden="true" focusable="false" />
                  {ids.length}
                </small>
              )}
            </button>
          );
        })}
      </div>
      {!me && <p class="starts-note">{t("startNeedName")}</p>}
      {host && (
        <div class="row set-host">
          <button type="button" class="btn btn-sm btn-on-gel" disabled={lead === null} onClick={() => lead !== null && onSet(lead)}>
            {lead === null ? t("startNoVotes") : t("startSet", { time: clock(lead) })}
          </button>
          <button type="button" class="link-btn on-gel" onClick={onChange}>
            {t("startChange")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The host chooses the times to ask about: the half hours the set time allows. */
export function StartSheet({ window, asked, onSend, onStop, onClose }: { window: [number, number]; asked: number[]; onSend: (times: number[]) => void; onStop: () => void; onClose: () => void }) {
  useLang();
  const choices = startChoices(window);
  // asking again: what was asked; asking first: the first three it allows
  const [picked, setPicked] = useState<number[]>(() => (asked.length ? asked.filter((at) => choices.includes(at)) : choices.slice(0, 3)));
  const ok = picked.length >= STARTS_MIN && picked.length <= STARTS_MAX;
  const toggle = (at: number) => setPicked((before) => (before.includes(at) ? before.filter((x) => x !== at) : [...before, at].sort((a, b) => a - b)));
  return (
    <Sheet
      title={t("startTitle")}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!ok} onClick={() => onSend(picked)}>
          {t("startSend")}
        </button>
      }
    >
      <p class="hint">{t("startSheetHint")}</p>
      <div class="quick starts-pick" role="group" aria-label={t("startTitle")}>
        {choices.map((at) => (
          <button key={at} type="button" aria-pressed={picked.includes(at)} onClick={() => toggle(at)}>
            {clock(at)}
          </button>
        ))}
      </div>
      <p class="hint" aria-live="polite">
        {t("startPicked", { n: picked.length })}
      </p>
      {asked.length > 0 && (
        <button type="button" class="link-btn" onClick={onStop}>
          {t("startStop")}
        </button>
      )}
    </Sheet>
  );
}
