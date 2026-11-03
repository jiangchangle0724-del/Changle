// A room, on a phone or a big screen: the line to the server, then the lobby, the round, the
// penalty and the result. Back buttons lead to the changle.ca table the game came from; when the
// host takes everyone back, every page follows by itself.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, Lang, Role, RoomView, ServerMsg } from "../../room/protocol";
import { backToTable, BASE, onChangle, screenUrl, tableFrom } from "../base";
import { t } from "../i18n";
import { openRoomClient, type ConnectionState, type RoomConnection } from "../net";
import { openPractice } from "../practice";
import { identity, savedName } from "../prefs";
import { IconButton, Rules, Sheet, TopBar } from "./chrome";
import { Lobby } from "./Lobby";
import { Menu } from "./Menu";
import { PenaltyStamp } from "./Penalty";
import { Play } from "./Play";
import { Result } from "./Result";
import { TvPage } from "./Tv";

export interface Session {
  view: RoomView | null;
  status: ConnectionState;
  fatal: "noRoom" | "full" | "identity" | null;
  receivedAt: number;
  /** server clock minus this device's */
  offset: number;
  send: (message: ClientMsg) => void;
}

function useSession(open: (onMessage: (message: ServerMsg) => void, onStatus: (status: ConnectionState) => void) => RoomConnection, key: string): Session {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [fatal, setFatal] = useState<Session["fatal"]>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const offset = useRef(0);
  const connection = useRef<RoomConnection | null>(null);
  useEffect(() => {
    const samples: number[] = [];
    const conn = open(
      (message) => {
        if (message.t === "fatal") return setFatal(message.key);
        if (message.t !== "view") return;
        const now = Date.now();
        // the quickest of the last few frames is the truest measure of the server's clock
        samples.push(message.view.now - now);
        if (samples.length > 20) samples.shift();
        offset.current = Math.max(...samples);
        setView(message.view);
        setReceivedAt(now);
        // (for the browser tests and anyone curious: what this page was last told)
        (window as unknown as { __hide?: RoomView }).__hide = message.view;
      },
      setStatus
    );
    connection.current = conn;
    return () => {
      conn.close();
      connection.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const send = useCallback((message: ClientMsg) => connection.current?.send(message), []);
  return { view, status, fatal, receivedAt, offset: offset.current, send };
}

export function useRoomSession(code: string, role: Role, lang: Lang): Session {
  return useSession(
    (onMessage, onStatus) => openRoomClient(code, role, identity(role === "screen"), role === "screen" ? "TV" : savedName() || t("you"), lang, onMessage, onStatus),
    `${code}:${role}`
  );
}

export function usePracticeSession(lang: Lang): Session {
  return useSession((onMessage, onStatus) => openPractice(lang, savedName() || t("you"), onMessage, onStatus), "practice");
}

/** Full screen for the game (Android, iPads, computers); an iPhone gets told about the Home Screen. */
function useFullscreen() {
  const [on, setOn] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const update = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setOn(Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);
  const toggle = async () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      try {
        await (document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document))?.();
      } catch {
        // the phone's own gesture also leaves full screen
      }
      return;
    }
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
    if (!request) return setHelp(true);
    try {
      await request();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      if (typeof orientation?.lock === "function") void orientation.lock("landscape").catch(() => undefined);
      setHelp(false);
    } catch {
      setHelp(true);
    }
  };
  return { on, help, toggle: () => void toggle() };
}

/** Keep the screen awake while a round is on (and on a big screen, always). */
function useWakeLock(want: boolean) {
  useEffect(() => {
    if (!want || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let live = true;
    const ask = async () => {
      try {
        const next = await (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (live) lock = next;
        else void next.release();
      } catch {
        // not allowed now (a hidden page): asked again when it comes back
      }
    };
    const again = () => document.visibilityState === "visible" && void ask();
    void ask();
    document.addEventListener("visibilitychange", again);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, [want]);
}

export interface PageProps {
  lang: Lang;
  onLang: (lang: Lang) => void;
  reduced: boolean;
  onReduced: (on: boolean) => void;
}

/** The phone's or the big screen's page for one room. */
export function RoomPage(props: PageProps & { code: string; role: Role }) {
  const session = useRoomSession(props.code, props.role, props.lang);
  const { view } = session;
  const table = tableFrom(view);
  useWakeLock(props.role === "screen" || view?.phase === "playing");

  // the host took everyone back to the table: go there too (or, on a computer by itself, home)
  useEffect(() => {
    if (!view?.ended) return;
    const timer = window.setTimeout(() => {
      if (table) backToTable(table, { screen: props.role === "screen", over: props.code });
      else location.assign(`${BASE}/`);
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [view?.ended]);

  const fatalText = session.fatal ? t(session.fatal) : view?.ended ? t(props.role === "screen" ? "wentBack" : "ended") : null;
  if (props.role === "screen") return <TvPage view={view} receivedAt={session.receivedAt} table={table} notice={fatalText ?? (session.status === "offline" && !view ? t("reconnecting") : null)} />;
  return <PhoneRoom {...props} session={session} table={table} fatalText={fatalText} />;
}

export function PracticePage(props: PageProps) {
  const session = usePracticeSession(props.lang);
  useWakeLock(session.view?.phase === "playing");
  return <PhoneRoom {...props} code="0000" role="player" session={session} table={null} fatalText={null} practice />;
}

function PhoneRoom(props: PageProps & { code: string; role: Role; session: Session; table: string | null; fatalText: string | null; practice?: boolean }) {
  const { session, table } = props;
  const { view, send } = session;
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [stampSeen, setStampSeen] = useState(0);
  const fullscreen = useFullscreen();

  const leave = () => {
    // (practice came from the game's card on changle.ca: back to it, not to the page that sent us here)
    if (props.practice) return location.assign(onChangle() ? "/g/hide-in-the-crowd" : `${BASE}/`);
    if (view?.you.host && table && !view.ended) return setConfirmEnd(true);
    send({ t: "leave" });
    if (table) backToTable(table);
    else location.assign(`${BASE}/`);
  };
  const endForEveryone = () => {
    setConfirmEnd(false);
    send({ t: "end" });
    // the room says so to everyone; this phone goes now
    window.setTimeout(() => (table ? backToTable(table, { over: props.code }) : location.assign(`${BASE}/`)), 250);
  };

  const custom = view?.settings.custom ?? "";
  const top = (
    <TopBar
      onBack={leave}
      backLabel={t(table ? "backToTable" : "back")}
      right={
        <>
          <IconButton icon="help" label={t("rulesTitle")} onClick={() => setRules(true)} />
          <IconButton icon="more" label={t("menu")} onClick={() => setMenu(true)} />
        </>
      }
    />
  );
  const sheets = (
    <>
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        lang={props.lang}
        onLang={props.onLang}
        reduced={props.reduced}
        onReduced={props.onReduced}
        fullscreen={fullscreen}
        screenHref={view && !props.practice ? screenUrl(view.code, table) : null}
        custom={custom}
      />
      <Sheet open={rules} title={t("rulesTitle")} onClose={() => setRules(false)}>
        <Rules custom={custom} />
      </Sheet>
      <Sheet open={confirmEnd} title={t("endTitle")} onClose={() => setConfirmEnd(false)}>
        <p class="sheet-text">{t("endBody")}</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-quiet" onClick={() => setConfirmEnd(false)}>
            {t("stay")}
          </button>
          <button type="button" class="btn btn-primary" onClick={endForEveryone}>
            {t("endYes")}
          </button>
        </div>
      </Sheet>
    </>
  );

  if (props.fatalText || !view)
    return (
      <main class="page">
        {top}
        <div class="page-body notice-body">
          {!props.fatalText && <span class="spinner" aria-hidden="true" />}
          <p class="notice-text" role="status">
            {props.fatalText ?? t(session.status === "offline" ? "reconnecting" : "connecting")}
          </p>
          {props.fatalText && table && !view?.ended && (
            <button type="button" class="btn btn-primary btn-lg" onClick={() => backToTable(table)}>
              {t("backToTable")}
            </button>
          )}
        </div>
        {sheets}
      </main>
    );

  if (view.phase === "lobby" || !view.game)
    return (
      <main class="page has-dock">
        {top}
        {session.status === "offline" && (
          <p class="conn-banner" role="status">
            {t("reconnecting")}
          </p>
        )}
        <Lobby view={view} table={table} send={send} />
        {sheets}
      </main>
    );

  const result = view.result;
  const stamp = view.phase === "over" && result?.penalty && stampSeen !== result.round;
  return (
    <main class="room-play">
      <Play view={view} game={view.game} receivedAt={session.receivedAt} serverOffset={session.offset} send={send} onMenu={() => setMenu(true)} fullscreen={fullscreen}>
        {session.status === "offline" && (
          <p class="conn-banner is-floating" role="status">
            {t("reconnecting")}
          </p>
        )}
        {view.phase === "over" && !stamp && <Result view={view} send={send} onTable={props.practice ? undefined : table ? leave : undefined} practice={props.practice} />}
      </Play>
      {stamp && result?.penalty && <PenaltyStamp penalty={result.penalty} custom={custom} onDone={() => setStampSeen(result.round)} />}
      {sheets}
    </main>
  );
}
