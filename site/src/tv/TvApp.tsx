import { Crown, Smartphone, Volume2, VolumeX } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GAME_BY_ID, type GameId } from "../games/registry";
import { gsap, reduced } from "../lib/anim";
import { holdBackground, startGroove } from "../lib/music";
import { sfx, unlockAudio } from "../lib/sfx";
import { isCode, newCode } from "../online/config";
import { SeatFace } from "../online/People";
import { NetGame } from "../online/games/NetGame";
import { playersOf } from "../online/players";
import { RoomProvider, useRoom } from "../online/RoomContext";
import { useWakeLock } from "../party/sensors";
import { cameBackFromEnd, markWent, tripUrl, wentTo } from "../party/trip/link";
import { ONLINE_GAMES, ONLINE_MIN, type GameView, type RoomView, type SeatView, type TripView } from "../shared/protocol";
import { TablePenalty, useStore } from "../store";
import { TvHide } from "../party/hide/TvHide";
import "../styles/tv.css";
import { useCodeField } from "../online/codeField";
import { TvCorner, TvPenalties, TvReactions, useScreenFx } from "./moments";
import { joinLink, siteHost, useQr, Wordmark } from "./parts";
import { hasTvView, TvView } from "./views";
import { Fit } from "./Frame";
import { TvLoadingStage } from "./TvLoading";
import "./states.css";
// the DJ booth brings the speaker (its own sound chain and music): only DJ tables load it
const TvDj = lazy(() => import("../party/dj/TvDj"));

/**
 * changle.ca/tv: a TV or a computer becomes the table's big screen. It opens a table (or shows
 * one that is already going), puts the code and a QR up for the phones, and then shows the game.
 * A game with a big-screen view of its own (views.tsx: Punchline's whole show, Superlatives,
 * Undercover, Name That Tune, Drama Queens) plays it here; every other game shows here too,
 * large, as the table sees it. Nobody at the screen can touch the game. A phone that only
 * watches shows the same views (Watch.tsx).
 */
export function TvApp({ code: given, game }: { code?: string; game?: GameId }) {
  const [table, setTable] = useState(() => ({ code: given && isCode(given) ? given : newCode(), create: !given || !isCode(given), n: 0 }));
  // the big screen brings its own music: the lounge loop stays off while it is up
  useEffect(() => holdBackground(), []);
  // and it never dims or sleeps in the middle of a game
  useWakeLock(true);
  useEffect(() => {
    document.documentElement.classList.add("tv-mode");
    return () => document.documentElement.classList.remove("tv-mode");
  }, []);
  return (
    <RoomProvider key={`${table.code}:${table.n}`} code={table.code} name="" create={table.create} screen game={table.create ? game : undefined}>
      <TvScreen
        create={table.create}
        onFresh={() => setTable((t) => ({ code: newCode(), create: true, n: t.n + 1 }))}
        onJoin={(code) => setTable((t) => ({ code, create: false, n: t.n + 1 }))}
        onAgain={() => setTable((t) => ({ ...t, create: false, n: t.n + 1 }))}
      />
    </RoomProvider>
  );
}

function TvScreen({ create, onFresh, onJoin, onAgain }: { create: boolean; onFresh: () => void; onJoin: (code: string) => void; onAgain: () => void }) {
  const { room, stopped, code, status } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const gate = useSoundGate();
  const audio = gate.armed && sound;
  // a game with a view of its own sounds its moments here too (a card dealt, a reveal, the win)
  const own = hasTvView(room?.game?.id);
  useScreenFx(audio && own);

  // a fresh code that turned out to be taken: quietly try another
  useEffect(() => {
    if (stopped?.kind === "error" && stopped.code === "exists" && create) onFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopped]);
  // once the table is up, a reload of this page comes back to the same table
  const up = !!room;
  useEffect(() => {
    if (up) window.history.replaceState(window.history.state, "", `/tv/${code}`);
  }, [up, code]);

  let body: ReactNode;
  if (stopped?.kind === "error" && (stopped.code === "paused" || stopped.code === "banned"))
    body = <TvNotice title={stopped.code === "paused" ? (zh ? "changle 暂停中" : "changle is closed for now") : (zh ? "这台设备已被停用" : "This device has been blocked")}>
      <p>{stopped.code === "paused" ? (zh ? "站长在整理，过一会儿再来。" : "The owner is tidying up. Come back in a while.") : (zh ? "有问题请联系站长。" : "Ask the site's owner if you think this is a mistake.")}</p>
    </TvNotice>;
  else if (stopped?.kind === "error" && !(stopped.code === "exists" && create))
    body = (
      <TvNotice title={stopped.code === "no-room" ? (zh ? `没有 ${code} 这张桌，可能已经散了` : `Table ${code} isn't open, or it has ended`) : zh ? "连不上这张桌" : "Can't reach this table"}>
        <button type="button" className="tv-btn tv-btn-main" onClick={onFresh}>
          {zh ? "开一张新桌" : "Open a new table"}
        </button>
        <JoinForm onJoin={onJoin} />
      </TvNotice>
    );
  else if (stopped?.kind === "replaced")
    body = (
      <TvNotice title={zh ? "这张桌换到另一个窗口显示了" : "This table moved to another window"}>
        <button type="button" className="tv-btn tv-btn-main" onClick={onAgain}>
          {zh ? "在这里显示" : "Show it here"}
        </button>
      </TvNotice>
    );
  else if (!room) body = <TvLoadingStage />;
  else if (room.game && own) body = <TvView v={room.game} sound={audio} fallback={<TvNotice title={zh ? GAME_BY_ID[room.game.id].name.zh : GAME_BY_ID[room.game.id].name.en} spinning />} />;
  else if (room.game?.id === "trip") body = <TvTrip v={room.game} table={code} />;
  else if (room.game?.id === "hide") body = <TvHide v={room.game} table={code} Notice={TvNotice} />;
  else if (room.game?.id === "dj")
    body = (
      <Suspense fallback={<TvNotice title={zh ? "正在打开 DJ 台…" : "Opening the DJ booth…"} spinning />}>
        <TvDj v={room.game} />
      </Suspense>
    );
  else if (room.game) body = <TvGame room={room} v={room.game} />;
  else if (room.playing) body = <TvNowPlaying room={room} id={room.playing} />;
  else body = <TvLobby room={room} audio={gate.armed} onJoin={onJoin} />;

  return (
    <Fit outside={<TvTurn />}>
      <TablePenalty value={room?.penalty ?? ""}>
        {body}
        {status === "reconnecting" && <div className="tv-reconnecting" role="status">{zh ? "网断了，正在重连" : "Connection lost. Reconnecting"}</div>}
        {room?.playing && room.playing !== "dj" && <TvCorner code={code} />}
        {room && <TvReactions />}
        {room && <TvPenalties room={room} sound={audio} />}
        {/* the DJ booth asks for its own tap (it starts the speaker) */}
        <TvControls gate={gate} game={!!room?.playing} noGate={room?.playing === "dj"} />
      </TablePenalty>
    </Fit>
  );
}

/* ------------------------------------------------------------------ the 1600x900 canvas, scaled to the screen */

/**
 * A phone or a tablet held upright (someone mirroring it to a TV) fits the 16:9 stage into its
 * width, small, with the rest of the screen empty: a word in that empty space to turn it sideways.
 * The style shows it only on an upright touch screen; a TV or a computer never sees it.
 */
function TvTurn() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="tv-turn">
      <Smartphone className="tv-turn-icon" size={24} strokeWidth={2} aria-hidden="true" />
      <span className="tv-turn-text">
        <strong>{zh ? "横过来拿，画面才够大" : "Hold it sideways for the full picture"}</strong>
        <small>{zh ? "锁了屏幕方向的话，先解开" : "If rotation is locked, unlock it first"}</small>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ sound: a TV needs one click first */

type Gate = { armed: boolean; sound: boolean; setSound: (on: boolean) => void };

function useSoundGate(): Gate {
  const [armed, setArmed] = useState(false);
  const { sound, setSound } = useStore();
  useEffect(() => {
    const arm = () => {
      unlockAudio();
      setArmed(true);
    };
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  // M mutes, as everywhere on a computer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "m" || e.key === "M") setSound(!sound);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sound, setSound]);
  return { armed, sound, setSound };
}

function TvControls({ gate, game, noGate }: { gate: Gate; game: boolean; noGate?: boolean }) {
  const { lang, setLang } = useStore();
  const zh = lang === "zh";
  // during a game the buttons sit low in a corner and fade out until the mouse moves
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!game) return;
    let id = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setIdle(true), 2600);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [game]);
  return (
    <>
      <div className={`tv-controls ${game ? "is-game" : ""} ${game && idle ? "is-idle" : ""}`}>
        <button type="button" className="tv-ctl" onClick={() => setLang(zh ? "en" : "zh")} aria-label={zh ? "Switch to English" : "切换到中文"}>
          {zh ? "EN" : "中"}
        </button>
        <button type="button" className="tv-ctl" onClick={() => gate.setSound(!gate.sound)} aria-label={gate.sound ? (zh ? "静音（M）" : "Mute (M)") : zh ? "打开声音（M）" : "Sound on (M)"}>
          {gate.sound ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>
      {!gate.armed && gate.sound && !noGate && (
        <div className="tv-gate" role="status">
          <Volume2 size={22} />
          {zh ? "点一下屏幕，打开声音" : "Click anywhere to turn the sound on"}
          <span className="tv-gate-key">{zh ? "按 M 静音" : "M mutes"}</span>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ pieces */


/**
 * 到此一游 plays on its own big-screen page at changle.ca/trip: the TV goes there by itself once the
 * host has opened the game, and comes back here when the game's last screen sends it back.
 */
function TvTrip({ v, table }: { v: TripView; table: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [state, setState] = useState<"going" | "back" | "over">("going");
  useEffect(() => {
    if (!v.code) return;
    if (cameBackFromEnd(v.code)) return setState("over");
    if (wentTo(v.code, true)) return setState("back");
    markWent(v.code, true);
    window.location.assign(tripUrl(v.code, table, true));
  }, [v.code, table]);
  if (!v.code) return <TvNotice title={zh ? "到此一游：等主人在手机上开局" : "Been There, Bought That: the host opens the game on their phone"} spinning />;
  if (state === "going") return <TvNotice title={zh ? "正在打开到此一游…" : "Opening Been There, Bought That…"} spinning />;
  if (state === "over") return <TvNotice title={zh ? "这局玩完了，等主人回到大厅" : "That trip is over. The host takes everyone back to the lobby"} />;
  return (
    <TvNotice title={zh ? "到此一游还在进行" : "The trip is still on"}>
      <button
        type="button"
        className="tv-btn tv-btn-main"
        onClick={() => {
          markWent(v.code!, true);
          window.location.assign(tripUrl(v.code!, table, true));
        }}
      >
        {zh ? "回到这局" : "Back to the game"}
      </button>
    </TvNotice>
  );
}

function TvNotice({ title, spinning, children }: { title: string; spinning?: boolean; children?: ReactNode }) {
  return (
    <div className="tv-notice">
      <Wordmark />
      {spinning && <span className="tv-spinner" aria-hidden="true" />}
      <h1 className="tv-notice-title">{title}</h1>
      {children && <div className="tv-notice-actions">{children}</div>}
    </div>
  );
}

function JoinForm({ onJoin }: { onJoin: (code: string) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const { code: v, field } = useCodeField();
  return (
    <form
      className="tv-join"
      onSubmit={(e) => {
        e.preventDefault();
        if (isCode(v)) onJoin(v);
      }}
    >
      <label htmlFor="tv-join-code">{zh ? "已经开了桌？输入桌号" : "Table already open? Enter its code"}</label>
      <div className="tv-join-row">
        <input id="tv-join-code" {...field} placeholder="ABCD" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4} inputMode="text" style={{ textTransform: "uppercase" }} />
        <button type="submit" className="tv-btn" disabled={!isCode(v)}>
          {zh ? "显示这桌" : "Show it"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ the lobby */

function TvLobby({ room, audio, onJoin }: { room: RoomView; audio: boolean; onJoin: (code: string) => void }) {
  const { code } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const qr = useQr(joinLink(code));
  const gid = ONLINE_GAMES[room.front] ?? "punchline";
  const meta = GAME_BY_ID[gid];
  const Icon = meta.icon;
  // (a seat that just watches isn't one of the players the game needs)
  const need = Math.max(0, ONLINE_MIN[gid] - playersOf(room.seats).length);
  const [joining, setJoining] = useState(false);
  useGroove(audio && sound, "lounge", 0.5);

  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced() || !card.current) return;
    gsap.fromTo(card.current, { rotateX: -70, opacity: 0, y: 20 }, { rotateX: 0, opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" });
  }, [gid]);

  return (
    <div className="tv-lobby" style={{ ["--gel" as string]: meta.gel } as React.CSSProperties}>
      <div className="tv-glow" aria-hidden="true" />
      <header className="tv-head">
        <Wordmark />
      </header>
      <section className="tv-join-panel">
        <h1 className="tv-call">{zh ? "拿出手机，扫码入座" : "Grab your phone and scan to sit down"}</h1>
        <div className="tv-join-body">
          <div className="tv-qr">{qr ? <div dangerouslySetInnerHTML={{ __html: qr }} /> : <p className="tv-qr-fallback">{zh ? `扫不了就输入桌号 ${code}` : `Can't scan? Enter table ${code}`}</p>}</div>
          <div className="tv-code-block">
            <span className="tv-code-label">{zh ? "桌号" : "Table code"}</span>
            <span className="tv-code tabular" aria-label={code.split("").join(" ")}>
              {code}
            </span>
            <span className="tv-code-help">{zh ? `或者在手机上打开 ${siteHost()}，输入桌号` : `Or open ${siteHost()} on your phone and enter the code`}</span>
          </div>
        </div>
        <p className="tv-host-note">
          {room.seats.length
            ? zh
              ? "主持人在手机上转桌选游戏，选好就开始"
              : "The host spins the table on their phone to pick a game"
            : zh
              ? "第一个坐下的人当主持人"
              : "The first person to sit down hosts"}
        </p>
      </section>

      <aside className="tv-seats">
        <h2 className="tv-seats-title tabular">{zh ? `已入座 ${room.seats.length} 人` : `${room.seats.length} seated`}</h2>
        <ul className="tv-seat-list">
          {room.seats.map((s) => (
            <SeatChip key={s.id} seat={s} host={s.id === room.host} sound={audio && sound} />
          ))}
        </ul>
        {!room.seats.length && <p className="tv-seats-empty">{zh ? "还没有人，扫左边的码" : "Nobody yet. Scan the code."}</p>}
      </aside>

      <footer className="tv-front">
        <div className="tv-front-card" ref={card}>
          <span className="tv-front-icon">
            <Icon size={46} strokeWidth={1.8} />
          </span>
          <span className="tv-front-text">
            <span className="tv-front-kicker">{zh ? "桌上转到" : "On the table"}</span>
            <span className="tv-front-name">{zh ? meta.name.zh : meta.name.en}</span>
            <span className="tv-front-other">{zh ? meta.name.en : meta.name.zh}</span>
          </span>
          <span className="tv-front-need">{need > 0 ? (zh ? `还差 ${need} 人` : `${need} more to start`) : zh ? "人够了，等主持人开始" : "Ready when the host is"}</span>
        </div>
        {gid === "dj" ? (
          <span className="tv-front-note">{zh ? "打碟的音乐从这块屏幕出来，手机按 🔥" : "The DJ booth's music comes out of this screen; the phones press 🔥"}</span>
        ) : gid === "punchline" ? null : hasTvView(gid) ? (
          <span className="tv-front-note">{zh ? "这个游戏在大屏幕上有自己的画面，大家用手机玩" : "This one has its own show on the big screen. Everyone plays on their phone."}</span>
        ) : gid === "trip" ? (
          <span className="tv-front-note">{zh ? "到此一游在大屏幕上有自己的页面，开始以后这块屏幕自己过去" : "Been There, Bought That has its own big-screen page. This screen goes there when it starts."}</span>
        ) : gid === "hide" ? (
          <span className="tv-front-note">{zh ? "藏在人群里在大屏幕上有自己的页面，开始以后这块屏幕自己过去" : "Hide in the Crowd has its own big-screen page. This screen goes there when it starts."}</span>
        ) : (
          <span className="tv-front-note">{zh ? "这个游戏在手机上玩，大屏幕上是它的手机画面和座位" : "This one plays on the phones. The big screen shows the phone screen and the seats."}</span>
        )}
        {!room.seats.length &&
          (joining ? (
            <JoinForm onJoin={onJoin} />
          ) : (
            <button type="button" className="tv-link" onClick={() => setJoining(true)}>
              {zh ? "已经开了桌？" : "Table already open?"}
            </button>
          ))}
      </footer>
    </div>
  );
}

function SeatChip({ seat, host, sound }: { seat: SeatView; host: boolean; sound: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    if (sound) sfx.pop();
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { scale: 0.3, opacity: 0, y: 24 }, { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: "back.out(2.2)" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <li className={`tv-seat ${seat.on ? "" : "is-away"}`} ref={ref}>
      <span className="tv-seat-face">
        <SeatFace seat={seat} size={64} />
        {host && (
          <span className="tv-seat-crown" aria-label="host">
            <Crown size={18} strokeWidth={2.6} />
          </span>
        )}
      </span>
      <span className="tv-seat-name">{seat.name}</span>
    </li>
  );
}

function useGroove(on: boolean, id: "lounge" | "funk" | "disco", volume: number) {
  useEffect(() => {
    if (!on) return;
    const h = startGroove(id, { volume });
    return () => h?.stop(0.8);
  }, [on, id, volume]);
}

/* ------------------------------------------------------------------ the games */

/**
 * A game without a big-screen view of its own yet: the game itself in the middle (the same screen
 * the phones show, drawn for someone with no seat, so no secrets and nothing to press), the table
 * down the side.
 */
function TvGame({ room, v }: { room: RoomView; v: GameView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const meta = GAME_BY_ID[v.id];
  const Icon = meta.icon;
  return (
    <div className="tv-game" style={{ ["--gel" as string]: meta.gel } as React.CSSProperties}>
      <div className="tv-glow" aria-hidden="true" />
      <header className="tv-head tv-game-head">
        <Wordmark />
        <span className="tv-game-title">
          <Icon size={30} strokeWidth={2} />
          <span>{zh ? meta.name.zh : meta.name.en}</span>
          <small>{zh ? meta.name.en : meta.name.zh}</small>
        </span>
      </header>
      <div className="tv-game-main">
        <div className="tv-game-phone">
          <NetGame view={v} onLeave={() => {}} />
        </div>
        <aside className="tv-game-side">
          <h2 className="tv-seats-title tabular">{zh ? `${room.seats.filter((s) => !s.watch).length} 人在玩` : `${room.seats.filter((s) => !s.watch).length} playing`}</h2>
          <ul className="tv-game-seats">
            {room.seats.filter((s) => !s.watch).map((s) => (
              <li key={s.id} className={s.on ? "" : "is-away"}>
                <SeatFace seat={s} size={44} />
                <span>{s.name}</span>
                {s.id === room.host && <Crown size={14} strokeWidth={2.6} className="tv-game-crown" />}
              </li>
            ))}
          </ul>
          <p className="tv-game-note">{zh ? "这里只看，操作在各自的手机上" : "Watch here; everyone plays on their own phone"}</p>
        </aside>
      </div>
    </div>
  );
}

function TvNowPlaying({ room, id }: { room: RoomView; id: GameId }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const meta = GAME_BY_ID[id];
  const Icon = meta.icon;
  return (
    <div className="tv-now" style={{ ["--gel" as string]: meta.gel } as React.CSSProperties}>
      <div className="tv-glow" aria-hidden="true" />
      <header className="tv-head">
        <Wordmark />
      </header>
      <div className="tv-now-card">
        <span className="tv-now-icon">
          <Icon size={120} strokeWidth={1.5} />
        </span>
        <h1 className="tv-now-name">{zh ? meta.name.zh : meta.name.en}</h1>
        <p className="tv-now-other">{zh ? meta.name.en : meta.name.zh}</p>
        <p className="tv-now-sub">{zh ? "这一局在手机上玩，看自己的手机" : "This one plays on your phones"}</p>
        <ul className="tv-now-seats">
          {room.seats.map((s) => (
            <li key={s.id} className={s.on ? "" : "is-away"}>
              <SeatFace seat={s} size={56} />
              <span>{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
