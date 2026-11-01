import { Disc3, Flame as FlameIcon, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoom, useRoomEvent, useTicker } from "../../online/RoomContext";
import { SeatFace } from "../../online/People";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { joinLink, useQr, Wordmark } from "../../tv/parts";
import { Floor, useFloorLoop, type Flame } from "./Floor";
import { NightCurve, NowPlaying, phaseName } from "./parts";
import { useBooth } from "./useBooth";
import "../../styles/dj.css";

/**
 * 打碟 · DJ Booth on the big screen, which is also the speaker: the one device the music comes
 * out of. A tap starts the sound; from then the stand-in DJ plays the night's phase, the lights
 * follow the kick, everyone at the table dances on the beat, and every 🔥 shows whose it was.
 */
export default function TvDj({ v }: { v: DjView }) {
  const { room, code, g, now } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  const booth = useBooth({ phase: v.phase, muted: !sound, onReport: (r) => g("stats", r) });
  const { speaker, dj } = booth;

  // the music starts here: the room's set begins when this screen says it's playing
  useEffect(() => {
    if (booth.status === "on" && v.phase === "wait") g("live", { source: "fake" });
  }, [booth.status, v.phase, v.set, g]);

  const fires = useRef(new Map<string, number>());
  const [flames, setFlames] = useState<Flame[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "fx" || e.fx !== "fire" || !e.pid) return;
    fires.current.set(e.pid, performance.now());
    const id = ++seq.current;
    setFlames((list) => [...list.slice(-14), { id, pid: e.pid! }]);
    window.setTimeout(() => setFlames((list) => list.filter((f) => f.id !== id)), 1800);
  });

  const root = useRef<HTMLDivElement>(null);
  const clock = useMemo(
    () => ({
      beat: () => (speaker && speaker.stats().state === "playing" ? dj.beat() : NaN),
      energy: () => speaker?.energy() ?? 0,
    }),
    [speaker, dj],
  );
  useFloorLoop(root, clock, v.energy, fires);

  // the player's state, for the buffering note
  const [state, setState] = useState("waiting");
  useEffect(() => {
    if (!speaker) return;
    return speaker.onTick((t) => setState(t.state));
  }, [speaker]);

  useTicker(v.phase !== "wait" && v.phase !== "end", 5000);
  const seats = room?.seats ?? [];
  const heat = v.fires.filter((f) => now() - f.at < 60_000).length;
  const fans = Object.entries(v.total)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pid, n]) => ({ seat: seats.find((s) => s.id === pid), n }))
    .filter((f) => f.seat);
  const live = booth.status === "on";
  const silent = live && (v.phase === "wait" || state !== "playing") && v.phase !== "end";

  return (
    <div className={`dj-stage is-${v.phase} ${live ? "is-live" : ""}`} ref={root}>
      <div className="dj-sky" aria-hidden="true" />
      <div className="dj-beams" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} style={{ ["--k" as string]: k }} />
        ))}
      </div>
      <div className="dj-plane" aria-hidden="true" />

      <header className="dj-head">
        <Wordmark />
        <span className="dj-title">
          <Disc3 size={30} strokeWidth={2} />
          <span>{zh ? "打碟" : "DJ Booth"}</span>
          <small>{zh ? "DJ Booth" : "打碟"}</small>
        </span>
      </header>

      <Deck v={v} />
      <JoinCard code={code} big={!seats.length} />

      <Floor seats={seats} flames={flames} host={room?.host} />
      {!seats.length && <p className="dj-empty">{zh ? "舞池空着，扫码上来" : "The floor's empty. Scan in."}</p>}

      <footer className="dj-foot">
        <NightCurve v={v} now={now()} />
        <div className="dj-heat">
          <span className="dj-heat-n tabular">
            <FlameIcon size={30} strokeWidth={2.4} />
            {heat}
          </span>
          <span className="dj-heat-label">{zh ? "这一分钟的 🔥" : "🔥 this minute"}</span>
          {fans.length > 0 && (
            <span className="dj-fans">
              {fans.map((f) => (
                <span key={f.seat!.id} className="dj-fan">
                  <SeatFace seat={f.seat!} size={30} />
                  <span className="tabular">{f.n}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </footer>

      <div className="dj-flash" aria-hidden="true" />

      {silent && live && v.phase !== "wait" && (
        <div className="dj-buffer" role="status">
          <Loader2 size={20} className="dj-spin" />
          {state === "buffering" ? (zh ? "缓冲中…" : "Buffering…") : zh ? "DJ 正在调音…" : "The DJ is warming up…"}
        </div>
      )}

      {v.phase === "end" && <EndCard v={v} />}

      {!live && <StartCard status={booth.status} midSet={v.phase !== "wait" && v.phase !== "end"} onStart={booth.start} />}
      {live && booth.stopped && (
        <button type="button" className="dj-wake" onClick={booth.wake}>
          <Play size={30} strokeWidth={2.6} />
          {zh ? "声音停了，点一下接着放" : "The sound stopped. Tap to carry on"}
        </button>
      )}
    </div>
  );
}

/** The booth itself, top and centre: two records turning while the music plays, a level meter, what's on. */
function Deck({ v }: { v: DjView }) {
  return (
    <div className="dj-deck">
      <span className="dj-record" aria-hidden="true" />
      <div className="dj-deck-mid">
        <NowPlaying v={v} />
        <span className="dj-meter" aria-hidden="true">
          {Array.from({ length: 14 }, (_, k) => (
            <i key={k} style={{ ["--k" as string]: k }} />
          ))}
        </span>
      </div>
      <span className="dj-record is-right" aria-hidden="true" />
    </div>
  );
}

function JoinCard({ code, big }: { code: string; big: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const qr = useQr(joinLink(code), "#0e0c22");
  return (
    <div className={`dj-join ${big ? "is-big" : ""}`}>
      <span className="dj-join-qr">{qr && <span dangerouslySetInnerHTML={{ __html: qr }} />}</span>
      <span className="dj-join-text">
        <span className="dj-join-label">{big ? (zh ? "拿出手机，扫码进舞池" : "Scan to get on the floor") : zh ? "扫码加入" : "Scan to join"}</span>
        <span className="dj-join-code tabular">{code}</span>
      </span>
    </div>
  );
}

/** Before any sound: one tap turns this screen into the speaker. */
function StartCard({ status, midSet, onStart }: { status: string; midSet: boolean; onStart: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dj-start">
      <div className="dj-start-card">
        <h1 className="dj-start-title">{zh ? "这台设备当音箱" : "This screen is the speaker"}</h1>
        <p className="dj-start-text">
          {zh
            ? "接上电视或音响，点下面的按钮开始放歌。手机都不出声，声音只从这里出来。放歌的时候别锁屏，也别关这个页面。"
            : "Hook it up to the TV or a sound system and press the button. The phones stay quiet: the music only comes out of here. Keep the screen on and this page open while it plays."}
        </p>
        <button type="button" className="tv-btn tv-btn-main dj-start-btn" onClick={onStart} disabled={status === "starting"}>
          {status === "starting" ? <Loader2 size={30} className="dj-spin" /> : <Play size={30} strokeWidth={2.6} />}
          {midSet ? (zh ? "接着放" : "Keep the music going") : zh ? "开始派对" : "Start the party"}
        </button>
        {status === "error" && <p className="dj-start-error">{zh ? "这个浏览器放不了，换 Safari 或 Chrome 试试。" : "This browser can't play it. Try Safari or Chrome."}</p>}
      </div>
    </div>
  );
}

/** The set is over: what the night came to. */
function EndCard({ v }: { v: DjView }) {
  const { room } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const seats = room?.seats ?? [];
  const mins = v.liveAt ? Math.max(1, Math.round((v.phaseAt - v.liveAt) / 60_000)) : 0;
  const total = Object.values(v.total).reduce((a, b) => a + b, 0);
  const top = Object.entries(v.total)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pid]) => seats.find((s) => s.id === pid)?.name)
    .filter(Boolean);
  return (
    <div className="dj-end" role="status">
      <h2 className="dj-end-title">{phaseName("end", zh)}</h2>
      <p className="dj-end-line tabular">
        {zh ? `放了 ${mins} 分钟，🔥 一共 ${total} 次` : `${mins} minutes of music, ${total} 🔥 in all`}
      </p>
      {top.length > 0 && <p className="dj-end-line">{zh ? `最嗨：${top.join("、")}` : `Most fired up: ${top.join(", ")}`}</p>}
      <p className="dj-end-note">{zh ? "主人在手机上可以再来一场" : "The host can start another set from their phone"}</p>
    </div>
  );
}
