import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { BLEND_COOLDOWN_MS, PLAYER_ACCELERATION, PLAYER_BRAKING, SIMULATION_STEP_MS, steerVelocity, type ArenaId } from "../../engine";
import { getLang, setLang, t, type Key, type Lang } from "../i18n";
import { createRoom, openRoomClient, roomExists, type ConnectionState, type RoomConnection } from "../net";
import type { AvatarView, ClientMsg, GameView, PlayerView, RoomView, Role, ServerMsg } from "../../room/protocol";
import { Arena3D } from "./Arena3D";

type Route = { kind: "home" } | { kind: "room"; code: string; role: Role };
type Theme = "system" | "light" | "dark";

const ARENA_CHOICES: Array<{ id: ArenaId; name: Key; rule: Key }> = [
  { id: "plaza", name: "plaza", rule: "plazaRule" },
  { id: "metro", name: "metro", rule: "metroRule" },
  { id: "gallery", name: "gallery", rule: "galleryRule" }
];

function currentRoute(): Route {
  const tv = location.pathname.match(/^\/tv\/(\d{4})\/?$/);
  if (tv) return { kind: "room", code: tv[1], role: "screen" };
  const player = location.pathname.match(/^\/r\/(\d{4})\/?$/);
  if (player) return { kind: "room", code: player[1], role: "player" };
  return { kind: "home" };
}

function navigate(path: string): void {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}


function savedName(): string {
  try {
    return localStorage.getItem("unspottable.name") ?? "";
  } catch {
    return "";
  }
}

function saveName(value: string): void {
  try {
    localStorage.setItem("unspottable.name", value);
  } catch {
    // The room still works when storage is disabled.
  }
}

function applyTheme(theme: Theme, reduced: boolean): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reduced = reduced ? "1" : "0";
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [lang, setLangState] = useState<Lang>(getLang());
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem("unspottable.theme");
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  });
  const [reduced, setReduced] = useState<boolean>(() => {
    try {
      return localStorage.getItem("unspottable.reduced") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  useEffect(() => {
    setLang(lang);
    applyTheme(theme, reduced);
  }, [lang, theme, reduced]);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) document.documentElement.dataset.standalone = "1";
    else delete document.documentElement.dataset.standalone;
    return () => { delete document.documentElement.dataset.standalone; };
  }, []);

  const changeLang = (value: Lang) => {
    setLang(value);
    setLangState(value);
  };
  const changeTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("unspottable.theme", next); } catch { /* optional preference */ }
  };
  const changeReduced = () => {
    const next = !reduced;
    setReduced(next);
    try { localStorage.setItem("unspottable.reduced", next ? "1" : "0"); } catch { /* optional preference */ }
  };

  if (route.kind === "room") {
    return <RoomPage
      code={route.code}
      role={route.role}
      lang={lang}
      onLang={changeLang}
      theme={theme}
      onTheme={changeTheme}
      reduced={reduced}
      onReduced={changeReduced}
      onHome={() => navigate("/")}
    />;
  }

  return <HomePage
    lang={lang}
    onLang={changeLang}
    theme={theme}
    onTheme={changeTheme}
    reduced={reduced}
    onReduced={changeReduced}
    onEnter={(code) => navigate("/r/" + code)}
  />;
}

interface PreferencesProps {
  lang: Lang;
  onLang: (value: Lang) => void;
  theme: Theme;
  onTheme: () => void;
  reduced: boolean;
  onReduced: () => void;
}

function Preferences(props: PreferencesProps) {
  return <div class="preferences" aria-label={t("settings")}>
    <button class="btn quiet compact" onClick={() => props.onLang(props.lang === "zh" ? "en" : "zh")}>
      {t("languageSwitch")}
    </button>
    <button class="btn quiet compact" onClick={props.onTheme}>{t(props.theme === "dark" ? "light" : "dark")}</button>
    <button class="btn quiet compact" aria-pressed={props.reduced} onClick={props.onReduced}>{t("reduceMotion")}: {t(props.reduced ? "on" : "off")}</button>
  </div>;
}

interface HomeProps extends PreferencesProps {
  onEnter: (code: string) => void;
}

function HomePage(props: HomeProps) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) { setError(t("emptyName")); return; }
    setBusy(true);
    setError("");
    saveName(name.trim().slice(0, 18));
    try {
      const roomCode = await createRoom();
      props.onEnter(roomCode);
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!name.trim()) { setError(t("emptyName")); return; }
    if (!/^\d{4}$/.test(code)) { setError(t("invalidCode")); return; }
    setBusy(true);
    setError("");
    saveName(name.trim().slice(0, 18));
    try {
      if (!await roomExists(code)) { setError(t("noRoom")); return; }
      props.onEnter(code);
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  };

  return <main class="home">
    <Preferences {...props} />
    <header class="hero">
      <div class="hero-mark" aria-hidden="true">
        <span class="mark-head"></span><span class="mark-body"></span><span class="mark-arm"></span>
      </div>
      <p class="eyebrow">{t("titleMark")}</p>
      <h1>{t("title")}</h1>
      <p class="tagline">{t("tagline")}</p>
      <p class="subtitle">{t("subtitle")}</p>
    </header>
    <section class="home-card">
      <label class="field">
        <span>{t("name")}</span>
        <input value={name} maxLength={18} autoComplete="nickname" onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)} />
      </label>
      <button class="btn primary wide" disabled={busy} onClick={create}>{t("create")}</button>
      <div class="divider"><span></span><b>{t("join")}</b><span></span></div>
      <label class="field">
        <span>{t("code")}</span>
        <input value={code} inputMode="numeric" maxLength={4} autoComplete="one-time-code" onInput={(event) => setCode((event.currentTarget as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4))} />
      </label>
      <button class="btn wide" disabled={busy} onClick={join}>{t("go")}</button>
      {error && <p class="error status-message" role="alert">{error}</p>}
    </section>
    <section class="how-card">
      <h2>{t("help")}</h2>
      <p>{t("helpText")}</p>
      <div class="small-note"><span class="note-dot"></span>{t("tvHint")}</div>
    </section>
  </main>;
}

interface RoomPageProps extends PreferencesProps {
  code: string;
  role: Role;
  onHome: () => void;
}

function RoomPage(props: RoomPageProps) {
  const roomShellRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHelp, setFullscreenHelp] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const connectionRef = useRef<RoomConnection | null>(null);
  const [refresh, setRefresh] = useState(0);
  const send = useCallback((message: ClientMsg) => connectionRef.current?.send(message), []);

  useEffect(() => {
    const updateFullscreen = () => {
      const safariDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const activeElement = document.fullscreenElement ?? safariDocument.webkitFullscreenElement ?? null;
      setFullscreen(Boolean(roomShellRef.current && activeElement === roomShellRef.current));
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    document.addEventListener("webkitfullscreenchange", updateFullscreen);
    updateFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
      document.removeEventListener("webkitfullscreenchange", updateFullscreen);
    };
  }, []);

  useEffect(() => {
    const connection = openRoomClient(
      props.code,
      props.role,
      savedName() || t("player"),
      props.lang,
      (message: ServerMsg) => {
        if (message.t === "fatal") {
          setError(message.key === "full" ? t("full") : t("noRoom"));
          return;
        }
        if (message.t === "view") {
          setView(message.view);
          setReceivedAt(Date.now());
          setError("");
        }
      },
      setStatus
    );
    connectionRef.current = connection;
    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [props.code, props.role, props.lang]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);

  const copyTv = async () => {
    const link = location.origin + "/tv/" + props.code;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError(t("copiedError"));
    }
  };

  const toggleFullscreen = async () => {
    const shell = roomShellRef.current;
    const safariDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const activeElement = document.fullscreenElement ?? safariDocument.webkitFullscreenElement ?? null;
    if (activeElement) {
      const exit = document.exitFullscreen?.bind(document) ?? safariDocument.webkitExitFullscreen?.bind(document);
      try { await exit?.(); } catch { /* Safari also provides a native fullscreen exit gesture. */ }
      setFullscreen(false);
      return;
    }
    const safariShell = shell as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const request = shell?.requestFullscreen?.bind(shell) ?? safariShell?.webkitRequestFullscreen?.bind(safariShell);
    if (!shell || !request) {
      setFullscreenHelp(true);
      return;
    }
    try {
      const pendingFullscreen = request();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      if (typeof orientation?.lock === "function") void orientation.lock("landscape").catch(() => undefined);
      await pendingFullscreen;


      setFullscreen(true);
      setFullscreenHelp(false);
    } catch {
      setFullscreenHelp(true);
    }
  };

  const leave = () => {
    send({ t: "leave" });
    props.onHome();
  };

  const top = <div class="room-top">
    <a class="brand-link" href="/" onClick={(event) => { event.preventDefault(); leave(); }}>{t("title")}</a>
    <div class="room-tools">
      <Preferences {...props} />
      <button class="btn quiet compact" onClick={leave}>{t("leave")}</button>
    </div>
  </div>;

  if (!view) {
    return <main class="room-shell">{top}<section class="waiting-card">
      <div class="spinner" aria-hidden="true"></div>
      <p>{error || t(status === "offline" ? "offline" : "connecting")}</p>
      <strong class="room-code">{props.code}</strong>
    </section></main>;
  }

  if (props.role === "screen" && view.phase === "lobby") {
    return <main class="tv-shell">{top}<TvLobby view={view} code={props.code} copied={copied} onCopy={copyTv} /></main>;
  }

  if (view.phase === "lobby") {
    return <main class="room-shell">{top}<Lobby view={view} code={props.code} status={status} error={error} copied={copied} onCopy={copyTv} onVote={(arena) => send({ t: "vote", arena })} onStart={() => send({ t: "start" })} /></main>;
  }

  const game = view.game;
  if (!game) return <main class="room-shell">{top}<p class="status-message">{t("connecting")}</p></main>;

  return <main ref={roomShellRef} class="room-shell room-shell--playing">
    {top}
    <GameScreen
      view={view}
      game={game}
      role={props.role}
      status={status}
      now={Date.now()}
      receivedAt={receivedAt}
      refresh={refresh}
      send={send}
      onAgain={() => send({ t: "again" })}
      onCopy={copyTv}
      copied={copied}
      fullscreen={fullscreen}
      fullscreenHelp={fullscreenHelp}
      onFullscreen={() => void toggleFullscreen()}
      onLeave={leave}
    />
  </main>;
}

function Lobby(props: {
  view: RoomView;
  code: string;
  status: ConnectionState;
  error: string;
  copied: boolean;
  onCopy: () => void;
  onVote: (arena: ArenaId) => void;
  onStart: () => void;
}) {
  return <section class="lobby-grid">
    <div class="lobby-main">
      <p class="eyebrow">{t("lobby")}</p>
      <h1>{t("room")}</h1>
      <div class="room-code">{props.code}</div>
      <p class="muted">{t("by", { name: props.view.players.find((player) => player.host)?.name ?? t("player") })}</p>
      <div class="player-list">
        {props.view.players.map((player, index) => <div class="player-row" key={index}>
          <span class={"player-chip player-chip-" + (index % 4)} aria-hidden="true">{index + 1}</span>
          <span class="player-name">{player.name}{player.host ? <small>{t("host")}</small> : null}</span>
          <span class={player.online ? "presence online" : "presence"}>{t(player.online ? "online" : "offlinePlayer")}</span>
        </div>)}
        {!props.view.players.length && <p class="muted">{t("noPlayers")}</p>}
      </div>
      <section class="arena-vote-section" aria-label={t("chooseArena")}>
        <h2>{t("chooseArena")}</h2>
        <div class="arena-votes">
          {ARENA_CHOICES.map((choice) => <button
            class={"arena-vote" + (props.view.you.vote === choice.id ? " is-selected" : "")}
            aria-pressed={props.view.you.vote === choice.id}
            onClick={() => props.onVote(choice.id)}
            key={choice.id}
          >
            <strong>{t(choice.name)}</strong>
            <small>{t(choice.rule)}</small>
            <span>{t("voteCount", { n: props.view.arenaVotes[choice.id] })}</span>
          </button>)}
        </div>
      </section>
      {props.error && <p class="error status-message" role="alert">{props.error}</p>}
      <p class="hint">{props.status === "online" ? t("screenNote") : t("reconnecting")}</p>
      {props.view.you.host
        ? <button class="btn primary wide" disabled={props.view.players.length < 2} onClick={props.onStart}>{t("start")}</button>
        : <p class="wait-line">{t("waiting")}</p>}
      {props.view.players.length < 2 && <p class="hint">{t("needTwo")}</p>}
    </div>
    <aside class="lobby-side">
      <p class="eyebrow">{t("tvMode")}</p>
      <h2>{t("subtitle")}</h2>
      <p>{t("tvHint")}</p>
      <p class="small-note">{t("screenNote")}</p>
      <button class="btn wide" onClick={props.onCopy}>{t(props.copied ? "copied" : "copyLink")}</button>
      <a class="btn quiet wide" href={"/tv/" + props.code} target="_blank" rel="noreferrer">{t("openTv")}</a>
    </aside>
  </section>;
}

function TvLobby(props: { view: RoomView; code: string; copied: boolean; onCopy: () => void }) {
  return <section class="tv-lobby">
    <p class="eyebrow">{t("tvMode")}</p>
    <h1>{t("title")}</h1>
    <p class="tagline">{t("waiting")}</p>
    <div class="room-code tv-code">{props.code}</div>
    <div class="player-list tv-player-list">
      {props.view.players.map((player, index) => <div class="player-row" key={index}>
        <span class={"player-chip player-chip-" + (index % 4)} aria-hidden="true">{index + 1}</span>
        <span class="player-name">{player.name}</span>
        <span class={player.online ? "presence online" : "presence"}>{t(player.online ? "online" : "offlinePlayer")}</span>
      </div>)}
    </div>
    <p>{t("screenNote")}</p>
    <button class="btn" onClick={props.onCopy}>{t(props.copied ? "copied" : "copyLink")}</button>
  </section>;
}

function GameScreen(props: {
  view: RoomView;
  game: GameView;
  role: Role;
  status: ConnectionState;
  now: number;
  receivedAt: number;
  refresh: number;
  send: (message: ClientMsg) => void;
  onAgain: () => void;
  onCopy: () => void;
  copied: boolean;
  fullscreen: boolean;
  fullscreenHelp: boolean;
  onFullscreen: () => void;
  onLeave: () => void;
}) {
  const [localVector, setLocalVector] = useState({ x: 0, y: 0 });
  const remaining = Math.max(0, props.game.remainingMs - (props.now - props.receivedAt));
  const seconds = Math.ceil(remaining / 1_000);
  const latest = props.game.events[props.game.events.length - 1];
  const notice = latest?.byYou && latest.id > 0
    ? latest.t === "tag" ? t("hit")
      : latest.t === "foul" ? t("foul")
        : latest.t === "swing" ? t("swing")
          : ""
    : "";

  return <section class={props.role === "screen" ? "game-layout game-layout-tv" : "game-layout"}>
    <header class="game-hud">
      <div>
        <p class="eyebrow">{t("arena")} · {t(props.game.arena)}</p>
        <h1>{t(props.game.phase === "over" ? "gameOver" : "targetScore", { n: props.game.scoreToWin })}</h1>
        <p class="arena-rule">{t(props.game.arena === "metro" ? "metroRule" : props.game.arena === "gallery" ? "galleryRule" : "plazaRule")}</p>
      </div>
      <div class="hud-right">
        <strong class="timer">{seconds}</strong>
        <span>{t("timeLeft", { n: seconds })}</span>
        {props.role === "player" && <>
          <button class="btn leave-game-button" aria-label={t("leave")} onClick={props.onLeave}>
            <span aria-hidden="true">↩</span><span>{t("leave")}</span>
          </button>
          <button class="btn fullscreen-button" aria-label={t(props.fullscreen ? "exitFullscreen" : "enterFullscreen")} aria-pressed={props.fullscreen} onClick={props.onFullscreen}>
            <span aria-hidden="true">⛶</span><span>{t(props.fullscreen ? "exitFullscreen" : "enterFullscreen")}</span>
          </button>
        </>}
      </div>
    </header>
    <p class="orientation-hint">{t("rotateTip")}</p>
    {props.role === "player" && props.fullscreenHelp && <p class="fullscreen-help" role="status">{t("fullscreenHelp")}</p>}
    <Arena3D
      avatars={props.game.avatars}
      arena={props.game.arena}
      environmentalDrift={props.game.environmentalDrift}
      localVector={props.role === "player" ? localVector : { x: 0, y: 0 }}
      receivedAt={props.receivedAt}
      impactId={latest?.id ?? 0}
      impactType={latest?.t ?? "swing"}
      label={t("arena")}
      youLabel={t("player")}
      fallback={<ArenaFallback
        avatars={props.game.avatars}
        arena={props.game.arena}
        environmentalDrift={props.game.environmentalDrift}
        localVector={props.role === "player" ? localVector : { x: 0, y: 0 }}
        receivedAt={props.receivedAt}
        impactId={latest?.id ?? 0}
        impactType={latest?.t ?? "swing"}
      />}
    />
    <div class="score-strip" aria-label={t("score")}>
      {props.view.players.map((player, index) => <div class="score-card" key={index}>
        <span class={"player-chip player-chip-" + (index % 4)} aria-hidden="true">{index + 1}</span>
        <span class="score-name">{player.name}</span>
        <strong>{player.score}</strong>
      </div>)}
    </div>
    {notice && <p class="event-toast" role="status">{notice}</p>}
    {props.role === "player" && props.game.phase === "playing" && <PlayerControls game={props.game} send={props.send} onVector={setLocalVector} />}
    {props.role === "screen" && <div class="tv-footer">
      <span>{props.status === "online" ? t("screenJoined") : t("reconnecting")}</span>
      <button class="btn quiet compact" onClick={props.onCopy}>{t(props.copied ? "copied" : "copyLink")}</button>
    </div>}
    {props.game.phase === "over" && <div class="result-panel">
      <p class="eyebrow">{t("gameOver")}</p>
      <h2>{props.game.winnerName ? t("winner", { name: props.game.winnerName }) : t("draw")}</h2>
      {props.role === "player" && props.view.you.host && <button class="btn primary" onClick={props.onAgain}>{t("again")}</button>}
      {props.role === "screen" && <p>{t("waiting")}</p>}
    </div>}
  </section>;
}

interface VisualAvatar { x: number; y: number }

function ArenaFallback(props: {
  avatars: AvatarView[];
  arena: ArenaId;
  environmentalDrift: { x: number; y: number };
  localVector: { x: number; y: number };
  receivedAt: number;
  impactId: number;
  impactType: "tag" | "foul" | "swing" | "over";
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const avatarNodes = useRef<Array<HTMLDivElement | null>>([]);
  const avatarTargets = useRef(props.avatars);
  const vectorRef = useRef(props.localVector);
  const driftRef = useRef(props.environmentalDrift);
  const receivedAtRef = useRef(props.receivedAt);
  const visuals = useRef<VisualAvatar[]>([]);
  const [shaking, setShaking] = useState(false);
  avatarTargets.current = props.avatars;
  vectorRef.current = props.localVector;
  driftRef.current = props.environmentalDrift;
  receivedAtRef.current = props.receivedAt;

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const arena = arenaRef.current;
      if (!arena || document.hidden) return;
      const width = arena.clientWidth;
      const height = arena.clientHeight;
      const delta = previous ? Math.min(50, time - previous) : 16;
      previous = time;
      const reduced = document.documentElement.dataset.reduced === "1" || (document.documentElement.dataset.reduced !== "0" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const ease = reduced ? 1 : 1 - Math.exp(-delta / 44);
      const snapshot = avatarTargets.current;
      const vector = vectorRef.current;
      const predictionMs = Math.min(125, Math.max(0, Date.now() - receivedAtRef.current));
      const predictionSeconds = predictionMs / 1000;
      for (let index = 0; index < snapshot.length; index++) {
        const avatar = snapshot[index];
        const node = avatarNodes.current[index];
        if (!node) continue;
        let targetX = avatar.x;
        let targetY = avatar.y;
        if (avatar.isMine && predictionMs > 0) {
          const predicted = steerVelocity(
            avatar.velocity,
            { x: vector.x * avatar.maxSpeed + driftRef.current.x, y: vector.y * avatar.maxSpeed + driftRef.current.y },
            predictionSeconds,
            PLAYER_ACCELERATION,
            PLAYER_BRAKING
          );
          targetX += (avatar.velocity.x + predicted.x) * 0.5 * predictionSeconds;
          targetY += (avatar.velocity.y + predicted.y) * 0.5 * predictionSeconds;
        }
        targetX = Math.max(5, Math.min(95, targetX));
        targetY = Math.max(6, Math.min(52, targetY));
        const visual = visuals.current[index] ?? (visuals.current[index] = { x: targetX, y: targetY });
        visual.x += (targetX - visual.x) * ease;
        visual.y += (targetY - visual.y) * ease;
        node.style.transform = "translate3d(" + width * visual.x / 100 + "px, " + height * visual.y / 58 + "px, 0) translate(-50%, -50%) rotate(" + avatar.facing + "rad)";
        const depth = String(Math.round(avatar.y * 10));
        if (node.style.zIndex !== depth) node.style.zIndex = depth;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (props.impactId < 1 || props.impactType !== "tag") return;
    setShaking(false);
    const frame = requestAnimationFrame(() => setShaking(true));
    const timer = window.setTimeout(() => setShaking(false), 280);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [props.impactId, props.impactType]);

  return <div ref={arenaRef} class={"arena arena--" + props.arena + (shaking ? " arena--impact" : "")} role="img" aria-label={t("arena")}>
    {props.arena === "metro" && <div class="arena-belt" aria-hidden="true"><span>» » »</span><span>» » »</span><span>» » »</span></div>}
    {props.arena === "gallery" && <div class="arena-spotlight" aria-hidden="true"></div>}
    <div class="arena-mark arena-mark-left"></div>
    <div class="arena-mark arena-mark-right"></div>
    <div class="arena-line"></div>
    {props.avatars.map((avatar, index) => <div
      key={index}
      class={"avatar avatar--tone-" + (index % 4) + " pose-" + avatar.pose + (avatar.isMine ? " is-mine" : "")}
      ref={(node) => { avatarNodes.current[index] = node; }}
      aria-hidden="true"
    >
      <span class="avatar__shadow"></span>
      <span class="avatar__legs"><i></i><i></i></span>
      <span class="avatar__body"><i class="avatar__arm avatar__arm--far"></i><i class="avatar__arm"></i><i class="avatar__badge"></i></span>
      <span class="avatar__head"><i class="avatar__eye"></i><i class="avatar__visor"></i></span>
      {avatar.isMine && <span class="you-marker">{t("player")}</span>}
    </div>)}
  </div>;
}
function PlayerControls(props: { game: GameView; send: (message: ClientMsg) => void; onVector: (value: { x: number; y: number }) => void }) {
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const vectorRef = useRef(vector);
  const heldKeys = useRef(new Set<string>());
  const gamepadButtons = useRef({ punch: false, blend: false });
  const gamepadDriving = useRef(false);
  vectorRef.current = vector;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = vectorRef.current;
      if (Math.hypot(current.x, current.y) > 0.05) props.send({ t: "move", x: current.x, y: current.y });
    }, SIMULATION_STEP_MS);
    return () => window.clearInterval(timer);
  }, [props.send]);

  const updatePointer = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    const rect = element.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.hypot(x, y);
    if (length <= 0.08) { x = 0; y = 0; }
    else {
      const normalizedLength = Math.min(1, length);
      const remapped = (normalizedLength - 0.08) / 0.92;
      const response = remapped * 0.78 + remapped * remapped * 0.22;
      x = x / length * response;
      y = y / length * response;
    }
    const next = { x, y };
    setVector(next);
    props.onVector(next);
  };

  const release = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    setVector({ x: 0, y: 0 });
    props.onVector({ x: 0, y: 0 });
    props.send({ t: "move", x: 0, y: 0 });
  };

  useEffect(() => {
    const updateKeyboardVector = () => {
      const keys = heldKeys.current;
      const x = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      const y = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
      const next = { x, y };
      setVector(next);
      props.onVector(next);
    };
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const keyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const movement = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(key);
      if (movement) {
        event.preventDefault();
        heldKeys.current.add(key);
        updateKeyboardVector();
      } else if (!event.repeat && (key === "Shift" || key === " ") && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        if (key === "Shift") props.send({ t: "blend" });
        else props.send({ t: "punch" });
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      heldKeys.current.delete(key);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(key)) updateKeyboardVector();
    };
    const blur = () => {
      heldKeys.current.clear();
      const zero = { x: 0, y: 0 };
      setVector(zero);
      props.onVector(zero);
      props.send({ t: "move", x: 0, y: 0 });
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, [props.onVector, props.send]);

  useEffect(() => {
    if (!navigator.getGamepads) return;
    const deadzone = 0.18;
    const axis = (value: number) => {
      const magnitude = Math.abs(value);
      if (magnitude < deadzone) return 0;
      const remapped = (magnitude - deadzone) / (1 - deadzone);
      return Math.sign(value) * Math.pow(remapped, 1.35);
    };
    const timer = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
      if (!pad) {
        gamepadButtons.current = { punch: false, blend: false };
        if (gamepadDriving.current) {
          gamepadDriving.current = false;
          const zero = { x: 0, y: 0 };
          setVector(zero);
          props.onVector(zero);
          props.send({ t: "move", x: 0, y: 0 });
        }
        return;
      }
      const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      const dpadY = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      const x = Math.max(-1, Math.min(1, axis(pad.axes[0] ?? 0) + dpadX));
      const y = Math.max(-1, Math.min(1, axis(pad.axes[1] ?? 0) + dpadY));
      const punch = Boolean(pad.buttons[0]?.pressed);
      const blend = Boolean(pad.buttons[2]?.pressed);
      const active = Math.hypot(x, y) > 0 || punch || blend;
      if (active || gamepadDriving.current) {
        gamepadDriving.current = active;
        const next = { x, y };
        setVector(next);
        props.onVector(next);
      }
      if (punch && !gamepadButtons.current.punch) props.send({ t: "punch" });
      if (blend && !gamepadButtons.current.blend) props.send({ t: "blend" });
      gamepadButtons.current = { punch, blend };
    }, 50);
    return () => window.clearInterval(timer);
  }, [props.onVector, props.send]);

  const ready = Date.now() >= props.game.blendReadyAt;
  const punchReady = Date.now() >= props.game.punchReadyAt;
  return <div class="controls-row">
    <div
      class="joystick"
      role="group"
      aria-label={t("stick")}
      tabIndex={0}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePointer(event); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointer(event); }}
      onPointerUp={release}
      onPointerCancel={release}

    >
      <span class="stick-ring"></span>
      <span class="stick-knob" style={{ transform: "translate(" + vector.x * 35 + "px, " + vector.y * 35 + "px)" }}></span>
    </div>
    <div class="action-buttons">
      <button class="btn punch-button" aria-label={t("punch")} disabled={!punchReady} onPointerDown={(event) => { event.preventDefault(); props.send({ t: "punch" }); navigator.vibrate?.(24); }} onClick={(event) => { if (event.detail === 0) props.send({ t: "punch" }); }}>
        <span class="punch-mark" aria-hidden="true"></span>{t(punchReady ? "punch" : "cooldown")}
      </button>
      <button class="btn blend-button" disabled={!ready} onPointerDown={(event) => { event.preventDefault(); props.send({ t: "blend" }); }} onClick={(event) => { if (event.detail === 0) props.send({ t: "blend" }); }}>
        {t(ready ? "blendReady" : "cooldown")}
      </button>
      <p class="controls-hint">{t("controls")}</p>
    </div>
  </div>;
}

