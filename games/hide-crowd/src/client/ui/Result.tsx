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
import { Awards, useLotCall } from "./roundFx";

/** When a row's points start to fill (after the row comes in), and how long each point takes. */
const COUNT_AFTER_MS = 150;
const COUNT_STEP_MS = 90;
/** A row comes in this long after the one above it (the CSS staggers by --i the same way: half of --dur-exit). */
const ROW_STEP_MS = 75;
const ROWS_FROM_MS = 200;

export function resultTitle(view: RoomView): string {
  const result = view.result;
  if (!result) return "";
  // a knockout: this phone's lot (through, out, champion), or on the big screen what the stage did
  const knockout = result.knockout;
  if (knockout) {
    if (knockout.you === "champion") return t("koYouChampion");
    if (knockout.done) return knockout.champion ? t("koChampion", { name: knockout.champion }) : t("koNoChampion");
    if (knockout.you === "through") return t("koYouThrough");
    if (knockout.you === "out") return t("koYouOut");
    return t("koThrough", { n: knockout.through });
  }
  // the last place of a match: the match's winner
  const match = result.match;
  if (match?.done) {
    if (match.youWon) return t("matchYouWin");
    if (match.winner) return t("matchWins", { name: match.winner });
    return view.players.some((player) => (player.total ?? 0) > 0) ? t("matchDraw") : t("noScore");
  }
  if (result.youWon) return t("youWin");
  if (result.winner) return t("wins", { name: result.winner });
  return view.players.some((player) => player.inRound && player.score > 0) ? t("draw") : t("noScore");
}

/**
 * The round's players, best first: most tags, then least spotted, then the order they joined in. In
 * a match, the most points so far first, and everyone who has played in it (they may have left).
 */
export function ranked(players: readonly PlayerView[], match = false, knockout = false): PlayerView[] {
  // (a knockout's stage: in the order it ended, ties already decided)
  if (knockout) return players.filter((player) => player.rank !== undefined).sort((a, b) => a.rank! - b.rank!);
  return players
    .map((player, order) => ({ player, order }))
    .filter(({ player }) => player.inRound || (match && (player.total ?? 0) > 0))
    .sort((a, b) => (match ? (b.player.total ?? 0) - (a.player.total ?? 0) : 0) || b.player.score - a.player.score || a.player.tagged - b.player.tagged || a.order - b.order)
    .map(({ player }) => player);
}

/** Above the result: which round this was (in a match, which of its places), or practice's. */
export function resultLabel(view: RoomView, practice = false): string {
  const result = view.result;
  if (!result) return "";
  if (result.knockout) return result.knockout.final ? t("koFinalOver") : t("koStageOver", { i: result.knockout.stage });
  if (result.match) return t("matchPlaceOver", { i: result.match.index, n: result.match.of });
  return t(practice ? "practiceOver" : "roundOver", { n: result.round });
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
  const match = props.view.result?.match ?? null;
  const knockout = props.view.result?.knockout ?? null;
  const players = ranked(props.view.players, !!match, !!knockout);
  // (a knockout's stage has no target: as many pips as points)
  const target = props.view.game?.scoreToWin ?? (knockout ? 0 : SCORE_TO_WIN);
  // (a crown for the round's winner, or once a match is over, the match's, or a knockout's champion; none in a draw)
  const crowned = knockout?.done ? knockout.champion : match?.done ? match.winner : props.view.result?.winner ?? null;
  return (
    <table class="result-table">
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">{t("players")}</span>
          </th>
          <th scope="col">{t("tags")}</th>
          <th scope="col">{t("spottedCol")}</th>
          {match && <th scope="col">{t("matchTotal")}</th>}
        </tr>
      </thead>
      <tbody>
        {players.map((player, index) => {
          const first = !!crowned && player.name === crowned;
          // (equal scores share a place; a knockout's places are all decided)
          const place = knockout ? player.rank ?? index + 1 : players.findIndex((other) => (match ? other.total === player.total : other.score === player.score)) + 1;
          // a knockout: through or out, stamped on; the champion's stamp once it's won; a line under the last through
          const stamp = !knockout ? null : knockout.done && first ? "koStampChampion" : player.through && !knockout.final ? "koStampThrough" : "koStampOut";
          const cut = !!knockout && !knockout.final && index === knockout.through - 1 && index < players.length - 1;
          return (
            <tr key={index} class={`${player.you ? "is-you" : ""}${first ? " is-winner" : ""}${cut ? " is-cut" : ""}`} style={`--i: ${index}`}>
              <th scope="row">
                <span class="result-place" aria-hidden="true">
                  {first ? <Icon name="crown" size={18} /> : place}
                </span>
                <span class="result-name">{player.name}</span>
                {stamp && <span class={`result-stamp ${stamp === "koStampOut" ? "is-out" : "is-through"}`}>{t(stamp)}</span>}
              </th>
              <td>
                <Count to={player.score} delay={ROWS_FROM_MS + index * ROW_STEP_MS + COUNT_AFTER_MS} now={!!props.now} target={target} />
              </td>
              <td class="tabular">{player.tagged}</td>
              {match && <td class="tabular result-total">{player.total ?? 0}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Where the match or the knockout goes next (and with how many, a knockout's), if it goes on. */
export function NextLine(props: { view: RoomView }) {
  const result = props.view.result;
  const knockout = result?.knockout;
  if (knockout?.next) {
    const vars = { place: t(knockout.next), n: knockout.nextPlayers };
    return <p class="result-next">{t(knockout.nextPlayers <= 3 ? "koNextFinal" : "koNext", vars)}</p>;
  }
  if (result?.match?.next) return <p class="result-next">{t("matchNext", { place: t(result.match.next) })}</p>;
  return null;
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
  // (a knockout: this phone's lot, said as the results come up)
  useLotCall(view, false);
  if (!result) return null;
  const online = view.players.filter((player) => player.online).length;
  const mine = result.mine;
  const match = result.match ?? null;
  const knockout = result.knockout ?? null;
  // (the last place of a match, or a knockout's final: their titles instead of the round's; between a
  // knockout's stages, none: who's through is the news)
  const awards = knockout ? (knockout.done ? knockout.awards : []) : match?.done ? match.awards : result.awards ?? [];
  const side = awards.length > 0 || !!(mine && (mine.by.length || mine.got.length));
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
          <p class="result-round">{resultLabel(view, props.practice)}</p>
          <h2 id="result-title" class="result-title">
            {resultTitle(view)}
          </h2>
          <ResultTable view={view} now={now} />
        </div>
        <div class="result-side">
          {mine && <Mine mine={mine} />}
          <Awards
            awards={awards}
            label={knockout?.done ? "koTitles" : match?.done ? "matchTitles" : "awards"}
            quest={knockout?.done || match?.done ? null : props.view.game?.arena ?? null}
          />
          <NextLine view={view} />
          <div class="result-actions">
            {view.you.host ? (
              <>
                <button type="button" class="btn btn-primary btn-lg btn-block" disabled={online < 2} onClick={() => send({ t: "start" })}>
                  {t(knockout ? (knockout.done ? "koAgain" : knockout.nextPlayers <= 3 ? "koFinalGo" : "koNextGo") : match ? (match.done ? "matchAgain" : "matchNextGo") : "again")}
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
