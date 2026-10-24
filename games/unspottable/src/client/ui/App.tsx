import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { BLEND_COOLDOWN_MS } from "../../engine";
import { getLang, setLang, t, type Lang } from "../i18n";
import { createRoom, openRoomClient, roomExists, type ConnectionState, type RoomConnection } from "../net";
import type { AvatarView, ClientMsg, GameView, PlayerView, RoomView, Role, ServerMsg } from "../../room/protocol";

type Route = { kind: "home" } | { kind: "room"; code: string; role: Role };
type Theme = "system" | "light" | "dark";

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
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const connectionRef = useRef<RoomConnection | null>(null);
  const [refresh, setRefresh] = useState(0);
  const send = useCallback((message: ClientMsg) => connectionRef.current?.send(message), []);

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
    return <main class="room-shell">{top}<Lobby view={view} code={props.code} status={status} error={error} copied={copied} onCopy={copyTv} onStart={() => send({ t: "start" })} /></main>;
  }

  const game = view.game;
  if (!game) return <main class="room-shell">{top}<p class="status-message">{t("connecting")}</p></main>;

  return <main class={props.role === "screen" ? "tv-shell" : "room-shell"}>
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
}) {
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
        <p class="eyebrow">{t("arena")}</p>
        <h1>{t(props.game.phase === "over" ? "gameOver" : "targetScore", { n: props.game.scoreToWin })}</h1>
      </div>
      <div class="hud-right">
        <strong class="timer">{seconds}</strong>
        <span>{t("timeLeft", { n: seconds })}</span>
      </div>
    </header>
    <Arena avatars={props.game.avatars} />
    <div class="score-strip" aria-label={t("score")}>
      {props.view.players.map((player, index) => <div class="score-card" key={index}>
        <span class={"player-chip player-chip-" + (index % 4)} aria-hidden="true">{index + 1}</span>
        <span class="score-name">{player.name}</span>
        <strong>{player.score}</strong>
      </div>)}
    </div>
    {notice && <p class="event-toast" role="status">{notice}</p>}
    {props.role === "player" && props.game.phase === "playing" && <PlayerControls game={props.game} send={props.send} />}
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

function Arena(props: { avatars: AvatarView[] }) {
  return <div class="arena" role="img" aria-label={t("arena")}>
    <div class="arena-mark arena-mark-left"></div>
    <div class="arena-mark arena-mark-right"></div>
    <div class="arena-line"></div>
    {props.avatars.map((avatar, index) => <div
      key={index}
      class={"avatar avatar--tone-" + (index % 4) + " pose-" + avatar.pose + (avatar.isMine ? " is-mine" : "")}
      style={{
        left: avatar.x + "%",
        top: avatar.y / 58 * 100 + "%",
        transform: "translate(-50%, -50%) rotate(" + (avatar.facing * 180 / Math.PI) + "deg)"
      }}
      aria-hidden="true"
    >
      <span class="avatar__shadow"></span>
      <span class="avatar__legs"><i></i><i></i></span>
      <span class="avatar__body"><i class="avatar__arm"></i><i class="avatar__arm avatar__arm--far"></i></span>
      <span class="avatar__head"><i class="avatar__eye"></i></span>
      {avatar.isMine && <span class="you-marker">{t("player")}</span>}
    </div>)}
  </div>;
}

function PlayerControls(props: { game: GameView; send: (message: ClientMsg) => void }) {
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const vectorRef = useRef(vector);
  const heldKeys = useRef(new Set<string>());
  vectorRef.current = vector;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = vectorRef.current;
      if (Math.hypot(current.x, current.y) > 0.05) props.send({ t: "move", x: current.x, y: current.y });
    }, 70);
    return () => window.clearInterval(timer);
  }, [props.send]);

  const updatePointer = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    const rect = element.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    setVector({ x, y });
  };

  const release = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    setVector({ x: 0, y: 0 });
    props.send({ t: "move", x: 0, y: 0 });
  };

  const keyVector = () => {
    const keys = heldKeys.current;
    const x = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const y = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    setVector({ x, y });
  };

  const keyDown = (event: KeyboardEvent) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      heldKeys.current.add(key);
      keyVector();
    }
  };
  const keyUp = (event: KeyboardEvent) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    heldKeys.current.delete(key);
    keyVector();
  };

  const ready = Date.now() >= props.game.blendReadyAt;
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
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onBlur={() => { heldKeys.current.clear(); setVector({ x: 0, y: 0 }); props.send({ t: "move", x: 0, y: 0 }); }}
    >
      <span class="stick-ring"></span>
      <span class="stick-knob" style={{ transform: "translate(" + vector.x * 35 + "px, " + vector.y * 35 + "px)" }}></span>
    </div>
    <div class="action-buttons">
      <button class="btn punch-button" aria-label={t("punch")} onPointerDown={(event) => event.preventDefault()} onClick={() => props.send({ t: "punch" })}>
        <span class="punch-mark" aria-hidden="true"></span>{t("punch")}
      </button>
      <button class="btn blend-button" disabled={!ready} onClick={() => props.send({ t: "blend" })}>
        {t(ready ? "blendReady" : "cooldown")}
      </button>
    </div>
  </div>;
}