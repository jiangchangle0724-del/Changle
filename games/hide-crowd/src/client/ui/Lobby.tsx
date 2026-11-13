// The phone before a round: who's here, the arena vote, the penalty switch (the host's), the big
// screen, and the host's Start under the thumb.
import { useEffect } from "preact/hooks";
import { ARENAS, MIN_PLAYERS, type ArenaId } from "../../engine";
import type { ClientMsg, RoomView } from "../../room/protocol";
import { BASE, screenUrl } from "../base";
import { t } from "../i18n";
import { preloadArena } from "./Arena";
import { Icon, Switch } from "./chrome";
import { HomeTip } from "./HomeScreen";

export const ARENA_THUMBS: Record<ArenaId, string> = {
  plaza: `${BASE}/art/thumb-plaza.webp`,
  metro: `${BASE}/art/thumb-metro.webp`,
  gallery: `${BASE}/art/thumb-gallery.webp`,
  market: `${BASE}/art/thumb-market.webp`
};

export const ARENA_RULE: Record<ArenaId, "plazaRule" | "metroRule" | "galleryRule" | "marketRule"> = {
  plaza: "plazaRule",
  metro: "metroRule",
  gallery: "galleryRule",
  market: "marketRule"
};

export function ArenaVote(props: { view: RoomView; onVote?: (arena: ArenaId) => void; big?: boolean }) {
  const { view } = props;
  const anyVotes = ARENAS.some((arena) => view.arenaVotes[arena] > 0);
  return (
    <section class={`arena-vote${props.big ? " is-big" : ""}`} aria-label={t("pickArena")}>
      <h2 class="section-title">{t("pickArena")}</h2>
      <div class="arena-options">
        {ARENAS.map((arena) => {
          const mine = view.you.vote === arena;
          const votes = view.arenaVotes[arena];
          const body = (
            <>
              <img class="arena-thumb" src={ARENA_THUMBS[arena]} alt="" width={160} height={90} loading="lazy" decoding="async" />
              <span class="arena-text">
                <strong>{t(arena)}</strong>
                <small>{t(ARENA_RULE[arena])}</small>
              </span>
              <span class={`arena-votes tabular${votes ? " has-votes" : ""}`}>{votes ? t("votes", { n: votes }) : ""}</span>
            </>
          );
          return props.onVote ? (
            <button type="button" key={arena} class={`arena-option${mine ? " is-mine" : ""}`} aria-pressed={mine} onClick={() => props.onVote?.(arena)}>
              {body}
            </button>
          ) : (
            <div key={arena} class={`arena-option${votes ? " is-voted" : ""}`}>
              {body}
            </div>
          );
        })}
      </div>
      {!anyVotes && <p class="hint">{t("noVotes")}</p>}
    </section>
  );
}

export function PlayerChips(props: { view: RoomView; showScores?: boolean }) {
  return (
    <ul class="chips" aria-label={t("players")}>
      {props.view.players.map((player, index) => (
        <li key={index} class={`chip${player.online ? "" : " is-away"}${player.you ? " is-you" : ""}`}>
          <span class="chip-name">{player.name}</span>
          {player.host && <span class="chip-tag">{t("host")}</span>}
          {player.you && <span class="chip-tag">{t("you")}</span>}
          {!player.online && <span class="chip-tag">{t("away")}</span>}
          {props.view.phase !== "lobby" && !player.inRound && player.online && <span class="chip-tag">{t("nextRound")}</span>}
        </li>
      ))}
    </ul>
  );
}

export function penaltyLine(view: RoomView): string {
  if (!view.settings.penalties) return t("penaltyOff");
  return view.settings.custom ? t("penaltyOnCustom", { text: view.settings.custom }) : t("penaltyOn");
}

export function Lobby(props: { view: RoomView; table: string | null; send: (message: ClientMsg) => void; onHomeGuide?: () => void }) {
  const { view, table, send } = props;
  useEffect(() => {
    if (!location.search.includes("flat=1")) void preloadArena().catch(() => undefined);
  }, []);
  const online = view.players.filter((player) => player.online).length;
  const need = Math.max(0, MIN_PLAYERS - online);
  return (
    <>
      <div class="page-body lobby">
        <p class="lobby-code">
          <span>{t(table ? "table" : "room")}</span>
          <b class="code">{table ?? view.code}</b>
        </p>
        {props.onHomeGuide && <HomeTip onShow={props.onHomeGuide} />}
        <ArenaVote view={view} onVote={(arena) => send({ t: "vote", arena })} />
        <section class="panel">
          <h2 class="section-title">
            {t("players")} <span class="tabular count">{view.players.length}</span>
          </h2>
          <PlayerChips view={view} />
        </section>
        <section class="panel">
          {view.you.host ? (
            <Switch label={t("penaltySwitch")} hint={penaltyLine(view)} on={view.settings.penalties} onChange={(on) => send({ t: "penalties", on })} />
          ) : (
            <p class="panel-line">
              <span class="panel-label">{t("penalty")}</span>
              {penaltyLine(view)}
            </p>
          )}
        </section>
        <section class="panel screen-panel">
          <span class="panel-icon">
            <Icon name="tv" />
          </span>
          <div>
            <h2 class="section-title">{t("bigScreen")}</h2>
            <p class="panel-line">
              {view.screens > 0
                ? t("screensOn", { n: view.screens })
                : table
                  ? t("screenHowTable", { host: location.host, table })
                  : t("screenHowRoom")}
            </p>
            {!table && view.screens === 0 && (
              <a class="link" href={screenUrl(view.code, table)} target="_blank" rel="noopener">
                {location.host}
                {screenUrl(view.code, table)}
              </a>
            )}
          </div>
        </section>
      </div>
      <div class="dock">
        {view.you.host ? (
          <button type="button" class="btn btn-primary btn-lg btn-block" disabled={need > 0} onClick={() => send({ t: "start" })}>
            {need > 0 ? (
              t("needMore", { n: need })
            ) : (
              <>
                <Icon name="play" />
                {t("start")}
              </>
            )}
          </button>
        ) : (
          <p class="dock-wait" role="status">
            {t("waitHost")}
          </p>
        )}
      </div>
    </>
  );
}
