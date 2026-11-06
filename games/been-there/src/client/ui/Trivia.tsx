// The waiting players' quiz (抢答): about every eight minutes, when a team lands on a city, the others
// race to answer a question about that city. First right answer wins; a wrong answer locks that team
// out; 这题不答 passes on it at no cost. When it closes, everyone it was for sees the answer, a fact
// (你知道吗) and its source.
//
// On a phone it pops up at the top of the screen, in the same place every time, over everything but a
// party forfeit (QuizPop): the question, its three answers and 这题不答; once answered, a slim bar with
// what the team picked (its own move is back in sight); at the end, the answer and the fact. Only a
// phone that can answer gets answers to tap. A phone
// it isn't for (the team on turn when it came up, spectators) reads it in its play window, and the big
// screen shows it at the head of the column of what's happening now (TriviaCard).
import { useEffect, useRef, useState } from "preact/hooks";
import { CITIES } from "../../engine";
import { TRIVIA_PRIZE, TRIVIA_WRONG, type RoomView, type TriviaView } from "../../room/protocol";
import { CityGlyph } from "../art/icons";
import { CODE } from "../art/stamps";
import { BUZZ, buzz } from "../controls";
import { money, t, tx } from "../i18n";
import { rememberTrivia } from "../prefs";
import { send } from "../store";
import { Countdown, SeatChip, hostOf, seatName } from "./common";

type PopState = "ask" | "locked" | "reveal";

/** What the pop-up shows on this phone, if anything: the question to answer, the team's answer in, or the answer out. */
function popState(q: TriviaView | null): PopState | null {
  if (!q || q.skipped) return null;
  if (q.open) return q.answerFor !== null ? "ask" : q.mine !== null ? "locked" : null;
  return q.forYou ? "reveal" : null;
}

/**
 * Whether `key` has stayed the same for a moment. A question that has just popped up takes no taps
 * until then: a tap meant for what was there before can't answer it.
 */
function useSettled(key: unknown, ms = 350) {
  const [settled, setSettled] = useState<unknown>(undefined);
  useEffect(() => {
    const id = setTimeout(() => setSettled(key), ms);
    return () => clearTimeout(id);
  }, [key]);
  return settled === key;
}

/** The phone's pop-up. */
export function QuizPop({ v }: { v: RoomView }) {
  const q = v.game?.trivia ?? null;
  const state = popState(q);
  // A question this phone put away (closed after answering, or 这题不答).
  const [closed, setClosed] = useState(0);
  // (per question and team: in the one-phone demo the same phone answers for one team after another)
  const asking = state === "ask" ? `${q!.id}:${q!.answerFor}` : "";
  const settled = useSettled(asking);
  const sent = useRef("");
  // The phone remembers every question it has been asked: a later game starts with ones it hasn't seen.
  useEffect(() => {
    if (q) rememberTrivia(q.key);
  }, [q?.key]);
  if (!q || !state || closed === q.id) return null;
  const city = CITIES.find((c) => c.id === q.city);
  const team = q.answerFor;
  const answer = (choice: number) => {
    if (team === null || sent.current === asking) return;
    sent.current = asking;
    buzz(BUZZ.tap);
    send({ t: "trivia", id: q.id, choice, seat: team });
  };
  const skip = () => {
    setClosed(q.id);
    send({ t: "trivia-skip", id: q.id });
  };
  return (
    <section
      class={`quizpop trivia ${state}${q.open ? "" : " closed"}${settled || state !== "ask" ? "" : " settling"}`}
      role="dialog"
      aria-label={t("stripTrivia")}
      aria-live="polite"
      data-id={q.id}
      data-state={state}
      data-mine={q.mine ?? ""}
      key={q.id}
    >
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
        {state !== "ask" && (
          <button type="button" class="quizpop-x" aria-label={t("close")} onClick={() => setClosed(q.id)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            </svg>
          </button>
        )}
      </p>
      {state !== "locked" && <p class="trivia-q">{tx(q.q)}</p>}
      {state === "ask" && (
        <ol class="trivia-options">
          {q.options.map((o, i) => (
            <li key={i}>
              <button type="button" class="trivia-opt" onClick={() => answer(i)}>
                <b>{"ABC"[i]}</b>
                <span>{tx(o)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {state === "reveal" && <Options q={q} />}
      {state === "ask" && (
        <div class="quizpop-foot">
          <span class="muted">
            {v.you.seats.length > 1 ? t("triviaAs", { team: seatName(v, team!) }) : t("triviaPrize", { amount: money(TRIVIA_PRIZE), fine: money(TRIVIA_WRONG) })}
          </span>
          <button type="button" class="btn ghost quizpop-skip" onClick={skip}>
            {t("triviaSkip")}
          </button>
        </div>
      )}
      {state === "locked" && <Status v={v} q={q} picked />}
      {state === "reveal" && <Reveal v={v} q={q} />}
    </section>
  );
}

/**
 * The question to read, not to answer: on the big screen, and on a phone it isn't for (in its play
 * window). It has no buttons, so there's nothing to tap that wouldn't answer.
 */
export function TriviaCard({ v, big }: { v: RoomView; big?: boolean }) {
  const q = v.game?.trivia ?? null;
  if (!q || (!big && (q.forYou || q.skipped))) return null;
  const city = CITIES.find((c) => c.id === q.city);
  return (
    <section class={`trivia${big ? " big" : " watch"}${q.open ? "" : " closed"}`} aria-live="polite" key={q.id}>
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
      <Options q={q} />
      {q.open ? <Status v={v} q={q} watching={!big} /> : <Reveal v={v} q={q} />}
    </section>
  );
}

/** The three answers as text: the team's pick struck through, the right one marked once it's out. */
function Options({ q }: { q: TriviaView }) {
  return (
    <ol class="trivia-options">
      {q.options.map((o, i) => {
        const cls = `${q.correct === i ? " right" : ""}${q.mine === i ? " picked" : ""}`;
        return (
          <li key={i} class={cls.trim() || undefined}>
            <span class={`trivia-opt${cls}`}>
              <b>{"ABC"[i]}</b>
              <span>{tx(o)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** While it's open: who has answered (wrong, so far), and where this phone stands. */
function Status({ v, q, watching, picked }: { v: RoomView; q: TriviaView; watching?: boolean; picked?: boolean }) {
  const mine = q.mine !== null ? `${"ABC"[q.mine]} ${tx(q.options[q.mine])}` : "";
  return (
    <p class="trivia-status">
      {picked && q.mine !== null && <span class="trivia-picked">{t("triviaPicked", { choice: mine })}</span>}
      {q.answered.map((x) => (
        <span key={x} class="trivia-out">
          <SeatChip v={v} seat={x} small /> ✗
        </span>
      ))}
      {!picked && (
        <span class="muted">{watching ? t("triviaForOthers") : q.mine !== null ? t("triviaLocked") : t("triviaPrize", { amount: money(TRIVIA_PRIZE), fine: money(TRIVIA_WRONG) })}</span>
      )}
    </p>
  );
}

/** Once it's closed: who got it, and the fact, with its source. */
function Reveal({ v, q }: { v: RoomView; q: TriviaView }) {
  return (
    <>
      <p class="trivia-result">{q.winner !== null ? t("triviaWinner", { team: seatName(v, q.winner), amount: money(TRIVIA_PRIZE) }) : t("triviaNoWinner")}</p>
      {q.fact && (
        <p class="trivia-fact">
          <b>{t("triviaFact")}</b>
          <span>
            {tx(q.fact)}{" "}
            {q.source && (
              <a href={q.source} target="_blank" rel="noopener noreferrer">
                {t("triviaSource")} · {hostOf(q.source)}
              </a>
            )}
          </span>
        </p>
      )}
    </>
  );
}
