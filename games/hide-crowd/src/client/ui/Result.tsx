// The end of a round on a phone: who won, everyone's tags and how often they were spotted, and the
// host's Play again. (The penalty stamp comes first, see Room.tsx.)
import type { ClientMsg, RoomView } from "../../room/protocol";
import { t } from "../i18n";
import { Awards } from "./roundFx";

export function resultTitle(view: RoomView): string {
  const result = view.result;
  if (!result) return "";
  if (result.youWon) return t("youWin");
  if (result.winner) return t("wins", { name: result.winner });
  return view.players.some((player) => player.inRound && player.score > 0) ? t("draw") : t("noScore");
}

export function ResultTable(props: { view: RoomView }) {
  const players = props.view.players.filter((player) => player.inRound);
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
        {players.map((player, index) => (
          <tr key={index} class={player.you ? "is-you" : ""}>
            <th scope="row">{player.name}</th>
            <td class="tabular">{player.score}</td>
            <td class="tabular">{player.tagged}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Result(props: { view: RoomView; send: (message: ClientMsg) => void; onTable?: () => void; practice?: boolean }) {
  const { view, send } = props;
  const result = view.result;
  if (!result) return null;
  const online = view.players.filter((player) => player.online).length;
  return (
    <div class="result-layer">
      <section class={`result${(result.awards ?? []).length ? " has-awards" : ""}`} aria-labelledby="result-title">
        <div class="result-main">
          <p class="result-round">{t(props.practice ? "practiceOver" : "roundOver", { n: result.round })}</p>
          <h2 id="result-title" class="result-title">
            {resultTitle(view)}
          </h2>
          <ResultTable view={view} />
        </div>
        <div class="result-side">
          <Awards awards={result.awards ?? []} />
          <div class="result-actions">
            {view.you.host ? (
              <>
                <button type="button" class="btn btn-primary btn-lg btn-block" disabled={online < 2} onClick={() => send({ t: "start" })}>
                  {t("again")}
                </button>
                {!props.practice && (
                  <button type="button" class="btn btn-quiet btn-block" onClick={() => send({ t: "lobby" })}>
                    {t("otherArena")}
                  </button>
                )}
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
