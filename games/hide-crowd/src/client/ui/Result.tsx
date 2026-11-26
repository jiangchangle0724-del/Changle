// The end of a round on a phone: who won, everyone's tags and how often they were spotted, who
// spotted you and whom you spotted, and the host's Play again (the same place) or Pick another arena
// (back to the lobby, or practice's picker). (The penalty stamp comes first, see Room.tsx.)
//
// It plays in quickly (Steve, 2026-11-25: a quick animated results page): the title pops, the rows
// come in best first and fill their points one by one, the titles stamp on, all in about a second
// and a half. A tap on it shows everything at once; with reduced motion it's all there from the start.
import { useEffect, useState } from "preact/hooks";
import { SCORE_TO_WIN } from "../../engine";
import type { ClientMsg, PlayerView, RoomView, TallyView } from "../../room/protocol";
import { reducedNow } from "../prefs";
import { t } from "../i18n";
import { Icon } from "./chrome";
import { Awards } from "./roundFx";

/** When a row's points start to fill (after the row comes in), and how long each point takes. */
const COUNT_AFTER_MS = 150;
const COUNT_STEP_MS = 90;
/** A row comes in this long after the one above it (the CSS staggers by --i the same way: half of --dur-exit). */
const ROW_STEP_MS = 75;
const ROWS_FROM_MS = 200;

export function resultTitle(view: RoomView): string {
  const result = view.result;
  if (!result) return "";
  if (result.youWon) return t("youWin");
  if (result.winner) return t("wins", { name: result.winner });
  return view.players.some((player) => player.inRound && player.score > 0) ? t("draw") : t("noScore");
}

/** The round's players, best first: most tags, then least spotted, then the order they joined in. */
export function ranked(players: readonly PlayerView[]): PlayerView[] {
  return players
    .map((player, order) => ({ player, order }))
    .filter(({ player }) => player.inRound)
    .sort((a, b) => b.player.score - a.player.score || a.player.tagged - b.player.tagged || a.order - b.order)
    .map(({ player }) => player);
}

/** A number that counts up from nothing, a point at a time, once its row is in (at once when `now`). */
function Count(props: { to: number; delay: number; now: boolean; target: number }) {
  const instant = props.now || reducedNow();
  const [shown, setShown] = useState(instant ? props.to : 0);
  useEffect(() => {
    if (instant) {
      setShown(props.to);
      return;
    }
    let timer = 0;
    const step = (n: number) => {
      setShown(n);
      if (n < props.to) timer = window.setTimeout(() => step(n + 1), COUNT_STEP_MS);
    };
    if (props.to > 0) timer = window.setTimeout(() => step(1), props.delay);
    return () => window.clearTimeout(timer);
  }, [props.to, instant]);
  return (
    <span class="result-count">
      <span class="score-pips" aria-hidden="true">
        {Array.from({ length: Math.max(props.target, props.to) }, (_, pip) => (
          <i key={pip} class={pip < shown ? "is-on" : ""} />
        ))}
      </span>
      {/* (keyed by the number: each new point pops in) */}
      <b key={shown} class="tabular">
        {shown}
      </b>
    </span>
  );
}

export function ResultTable(props: { view: RoomView; now?: boolean }) {
  const players = ranked(props.view.players);
  const target = props.view.game?.scoreToWin ?? SCORE_TO_WIN;
  // (a crown for the winner; a draw has none)
  const winner = !!props.view.result?.winner;
  return (
    <table class="result-table">
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">{t("players")}</span>
          </th>
          <th scope="col">{t("tags")}</th>
          <th scope="col">{t("spottedCol")}</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player, index) => {
          const first = winner && index === 0;
          // (equal scores share a place)
          const place = players.findIndex((other) => other.score === player.score) + 1;
          return (
            <tr key={index} class={`${player.you ? "is-you" : ""}${first ? " is-winner" : ""}`} style={`--i: ${index}`}>
              <th scope="row">
                <span class="result-place" aria-hidden="true">
                  {first ? <Icon name="crown" size={18} /> : place}
                </span>
                <span class="result-name">{player.name}</span>
              </th>
              <td>
                <Count to={player.score} delay={ROWS_FROM_MS + index * ROW_STEP_MS + COUNT_AFTER_MS} now={!!props.now} target={target} />
              </td>
              <td class="tabular">{player.tagged}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A phone's own round in tags: who spotted them and whom they spotted (names, and how often when more than once). */
function Mine(props: { mine: { by: TallyView[]; got: TallyView[] } }) {
  const lines = [
    { label: t("mineBy"), list: props.mine.by, bad: true },
    { label: t("mineGot"), list: props.mine.got, bad: false }
  ].filter((line) => line.list.length > 0);
  if (!lines.length) return null;
  return (
    <dl class="result-mine">
      {lines.map((line) => (
        <div key={line.label} class={line.bad ? "is-by" : "is-got"}>
          <dt>{line.label}</dt>
          <dd>
            {line.list.map((item) => (
              <span key={item.name} class="result-who">
                {item.name}
                {item.n > 1 && <small class="tabular">{t("times", { n: item.n })}</small>}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Result(props: { view: RoomView; send: (message: ClientMsg) => void; onTable?: () => void; practice?: boolean }) {
  const { view, send } = props;
  const result = view.result;
  // a tap on the results (not on a button) shows it all at once
  const [now, setNow] = useState(false);
  useEffect(() => setNow(false), [result?.round]);
  if (!result) return null;
  const online = view.players.filter((player) => player.online).length;
  const mine = result.mine;
  const side = (result.awards ?? []).length > 0 || !!(mine && (mine.by.length || mine.got.length));
  return (
    <div class="result-layer">
      <section
        class={`result${side ? " has-awards" : ""}${now ? " is-now" : ""}`}
        aria-labelledby="result-title"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) setNow(true);
        }}
      >
        <div class="result-main">
          <p class="result-round">{t(props.practice ? "practiceOver" : "roundOver", { n: result.round })}</p>
          <h2 id="result-title" class="result-title">
            {resultTitle(view)}
          </h2>
          <ResultTable view={view} now={now} />
        </div>
        <div class="result-side">
          {mine && <Mine mine={mine} />}
          <Awards awards={result.awards ?? []} />
          <div class="result-actions">
            {view.you.host ? (
              <>
                <button type="button" class="btn btn-primary btn-lg btn-block" disabled={online < 2} onClick={() => send({ t: "start" })}>
                  {t("again")}
                </button>
                <button type="button" class="btn btn-quiet btn-block" onClick={() => send({ t: "lobby" })}>
                  {t("otherArena")}
                </button>
              </>
            ) : (
              <p class="dock-wait" role="status">
                {t("waitNext")}
              </p>
            )}
            {props.onTable && (
              <button type="button" class="btn btn-ghost btn-block" onClick={props.onTable}>
                {t("backToTable")}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
