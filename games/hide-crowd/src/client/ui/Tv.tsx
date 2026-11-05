// The big screen (a TV, a computer, or a phone mirrored to a TV): the whole crowd, large, and around
// it the clock, the scores and the round's arena. It never marks who is a player: it is sent no such
// thing (src/room/room.ts). Laid out on a 1920 x 1080 stage that scales to the screen; the arena
// itself is drawn at the screen's own size underneath.
import qrcode from "qrcode-generator";
import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { RoomView } from "../../room/protocol";
import { BASE, joinUrl, onChangle } from "../base";
import { other, t } from "../i18n";
import { Arena, preloadArena } from "./Arena";
import { ArenaFallback } from "./ArenaFallback";
import { ArenaVote, ARENA_RULE, penaltyLine, PlayerChips } from "./Lobby";
import { PenaltyStamp } from "./Penalty";
import { Scoreboard, useClock } from "./Play";
import { ResultTable, resultTitle } from "./Result";

const STAGE_W = 1920;
const STAGE_H = 1080;

/** The 1920 x 1080 stage, scaled to fit the screen and centred. */
function Stage({ children, class: extra = "" }: { children: ComponentChildren; class?: string }) {
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setK(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div class={`tv-stage ${extra}`} style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${k})` }}>
      {children}
    </div>
  );
}

export function Qr({ text }: { text: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col + 2} ${row + 2}h1v1h-1z`;
    return { d, size: count + 4 };
  }, [text]);
  return (
    <svg class="qr" viewBox={`0 0 ${path.size} ${path.size}`} role="img" aria-label={text} shape-rendering="crispEdges">
      <rect width={path.size} height={path.size} class="qr-paper" />
      <path d={path.d} class="qr-ink" />
    </svg>
  );
}

function TvBrand() {
  return (
    <div class="tv-brand">
      <span class="tv-brand-name">{t("title")}</span>
      <span class="tv-brand-sub">{other("title")}</span>
    </div>
  );
}

function TvLobby({ view, table }: { view: RoomView; table: string | null }) {
  useEffect(() => {
    if (!location.search.includes("flat=1")) void preloadArena().catch(() => undefined);
  }, []);
  const link = joinUrl(view.code, table);
  const host = onChangle() ? "changle.ca" : location.host;
  return (
    <Stage class="tv-lobby">
      <div class="tv-lobby-main">
        <h1 class="tv-title">
          <span>{t("title")}</span>
          <span>{other("title")}</span>
        </h1>
        <p class="tv-tagline">{t("tagline")}</p>
        <ArenaVote view={view} big />
        <ol class="tv-steps">
          <li>{t("tvStep1")}</li>
          <li>{t("tvStep2")}</li>
          <li>{t(!view.settings.penalties ? "tvStep3Off" : view.settings.custom ? "tvStep3Custom" : "tvStep3")}</li>
        </ol>
      </div>
      <aside class="tv-lobby-side">
        <div class="tv-join">
          <Qr text={link} />
          <div class="tv-join-text">
            <strong>{t("scanToJoin")}</strong>
            <span>{t(table ? "orEnter" : "orRoom", { host })}</span>
            <b class="code tv-code">{table ?? view.code}</b>
          </div>
        </div>
        <section class="tv-panel">
          <h2 class="section-title">
            {t("players")} <span class="tabular count">{view.players.length}</span>
          </h2>
          {view.players.length ? <PlayerChips view={view} /> : <p class="hint">{t("joinPhones")}</p>}
        </section>
        <section class="tv-panel">
          <p class="panel-line">
            <span class="panel-label">{t("penalty")}</span>
            {penaltyLine(view)}
          </p>
        </section>
        <p class="tv-wait" role="status">
          {t("waitHost")}
        </p>
      </aside>
    </Stage>
  );
}

function TvRound({ view, receivedAt }: { view: RoomView; receivedAt: number }) {
  const game = view.game!;
  const remaining = useClock(game, receivedAt);
  const seconds = Math.ceil(remaining / 1_000);
  const latest = game.events[game.events.length - 1];
  // the penalty takes the screen first, then the results
  const [stampDone, setStampDone] = useState(false);
  const round = view.result?.round ?? 0;
  useEffect(() => {
    setStampDone(false);
    if (!view.result?.penalty) return;
    const timer = window.setTimeout(() => setStampDone(true), 7_000);
    return () => window.clearTimeout(timer);
  }, [round, !!view.result?.penalty]);
  const arenaProps = {
    avatars: game.avatars,
    arena: game.arena,
    drift: game.drift,
    localVector: { x: 0, y: 0 },
    maxSpeed: 0,
    receivedAt,
    impactId: latest?.id ?? 0,
    impactType: latest?.t ?? "swing"
  } as const;
  const over = game.phase === "over" && view.result;
  return (
    <>
      <div class="tv-arena">
        <Arena {...arenaProps} label={t(game.arena)} youLabel="" fallback={<ArenaFallback {...arenaProps} />} />
      </div>
      <Stage class="tv-hud">
        <div class="tv-hud-left">
          <TvBrand />
          <div class="tv-arena-name">
            <strong>{t(game.arena)}</strong>
            <span>{t(ARENA_RULE[game.arena])}</span>
          </div>
        </div>
        <div class={`tv-clock tabular${seconds <= 10 && game.phase === "playing" ? " is-last" : ""}`} role="timer" aria-label={t("secondsLeft", { n: seconds })}>
          <b>{game.phase === "playing" ? seconds : 0}</b>
          <span>{t("firstTo", { n: game.scoreToWin })}</span>
        </div>
        <div class="tv-hud-right">
          <Scoreboard view={view} target={game.scoreToWin} />
        </div>
        {game.phase === "playing" && <p class="tv-hint">{t("nobodyMarked")}</p>}
        {over && (
          <div class="tv-over">
            {view.result!.penalty && !stampDone ? (
              <PenaltyStamp penalty={view.result!.penalty} custom={view.settings.custom} tv />
            ) : (
              <section class="tv-result">
                <p class="result-round">{t("roundOver", { n: view.result!.round })}</p>
                <h2 class="tv-result-title">{resultTitle(view)}</h2>
                <ResultTable view={view} />
                <p class="tv-wait">{t("nextWhenReady")}</p>
              </section>
            )}
          </div>
        )}
      </Stage>
    </>
  );
}

export function TvPage({ view, receivedAt, table, notice }: { view: RoomView | null; receivedAt: number; table: string | null; notice: string | null }) {
  useEffect(() => {
    document.documentElement.classList.add("is-tv");
    return () => document.documentElement.classList.remove("is-tv");
  }, []);
  if (notice || !view)
    return (
      <main class="tv">
        <Stage class="tv-notice">
          <TvBrand />
          <p class="tv-notice-text" role="status">
            {notice ?? t("connecting")}
          </p>
        </Stage>
      </main>
    );
  return (
    <main class={`tv is-${view.phase}`} data-phase={view.phase}>
      {view.game ? <TvRound view={view} receivedAt={receivedAt} /> : <TvLobby view={view} table={table} />}
    </main>
  );
}

/** The big screen's own address, for a link that opens it on another device. */
export const tvHref = (code: string, table: string | null) => `${BASE}/tv/${code}${table ? `?table=${table}` : ""}`;
