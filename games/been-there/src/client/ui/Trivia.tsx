// The waiting players' quiz (抢答): while one team takes its turn, the others race to answer a question
// about one of the cities. First right answer wins; a wrong answer locks that team out.
// When it closes, everyone sees the answer, the real fact it comes from and a link to the source.
import { CITIES } from "../../engine";
import { TRIVIA_PRIZE, type RoomView } from "../../room/protocol";
import { CityGlyph } from "../art/icons";
import { CODE } from "../art/stamps";
import { money, t, tx } from "../i18n";
import { send } from "../store";
import { Countdown, SeatChip, hostOf, seatName } from "./common";

export function Trivia({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game!;
  const q = g.trivia;
  if (!q) return null;
  const city = CITIES.find((c) => c.id === q.city);
  const seat = q.answerFor;
  const can = q.open && seat !== null && !big;
  return (
    <section class={`trivia${big ? " big" : ""}${q.open ? "" : " closed"}`} aria-live="polite" key={q.id}>
      <p class="pass-strip">
        <span>{t("stripTrivia")}</span>
        <span>{CODE[q.city] ?? ""}</span>
      </p>
      <p class="trivia-about">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <CityGlyph id={q.city} />
        </svg>
        <span>{t("triviaAbout", { city: city ? tx(city.name) : q.city })}</span>
        {q.open && <Countdown until={q.endsAt} />}
      </p>
      <p class="trivia-q">{tx(q.q)}</p>
      <ol class="trivia-options">
        {q.options.map((o, i) => (
          <li key={i} class={q.correct === i ? "right" : undefined}>
            <button
              type="button"
              class={`trivia-opt${q.correct === i ? " right" : ""}${q.mine === i ? " picked" : ""}`}
              disabled={!can}
              onClick={() => seat !== null && send({ t: "trivia", id: q.id, choice: i, seat })}
            >
              <b>{"ABC"[i]}</b>
              <span>{tx(o)}</span>
            </button>
          </li>
        ))}
      </ol>
      {q.open ? (
        <p class="trivia-status">
          {q.answered.map((x) => (
            <span key={x} class="trivia-out">
              <SeatChip v={v} seat={x} small /> ✗
            </span>
          ))}
          <span class="muted">
            {q.mine !== null && !can
              ? t("triviaLocked")
              : can && v.you.seats.length > 1
                ? t("triviaAs", { team: seatName(v, seat!) })
                : t("triviaPrize", { amount: money(TRIVIA_PRIZE) })}
          </span>
        </p>
      ) : (
        <>
          <p class="trivia-result">
            {q.winner !== null ? t("triviaWinner", { team: seatName(v, q.winner), amount: money(TRIVIA_PRIZE) }) : t("triviaNoWinner")}
          </p>
          {q.fact && (
            <p class="trivia-fact">
              {tx(q.fact)}{" "}
              {q.source && (
                <a href={q.source} target="_blank" rel="noopener noreferrer">
                  {t("triviaSource")} · {hostOf(q.source)}
                </a>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
