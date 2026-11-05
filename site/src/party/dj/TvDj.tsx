import { Disc3, Flame as FlameIcon, Loader2, Play, Snowflake } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lyriaUrl } from "../../online/config";
import { useRoom, useRoomEvent, useTicker } from "../../online/RoomContext";
import { SeatFace } from "../../online/People";
import { playersOf } from "../../online/players";
import { ENERGY, heatLean } from "../../shared/dj/curve";
import { decodePiece } from "../../shared/dj/songwire";
import { SONG_SENT, type DjPhase } from "../../shared/dj/types";
import type { DjView } from "../../shared/protocol";
import { useStore } from "../../store";
import { joinLink, useQr, Wordmark } from "../../tv/parts";
import { Floor, useFloorLoop, type Flame } from "./Floor";
import { Countdown, DeckBoard, DropParty, HintLine, mixerShows, PadChips, usePadEvents } from "./deck/TvDeck";
import { LocalPanel } from "./local/LocalPanel";
import { FloorGrid, NightCurve, phaseName, useHeardPhase, useHeat } from "./parts";
import { RecapLines } from "./RecapLines";
import { useBooth } from "./useBooth";
import { primeVoice, useAnnounce } from "./announce";
import { useWakeLock } from "../sensors";
import { Coach } from "./Coach";
import { TubePlayer } from "./TubePlayer";
import { danceShare } from "../../shared/dj/dance";
import "../../styles/dj.css";

/**
 * 打碟 · DJ Booth on the big screen, which is also the speaker: the one device the music comes
 * out of. A tap starts the sound; from then the stand-in DJ plays the night's phase, the lights
 * follow the kick, everyone at the table dances on the beat, and every 🔥 shows whose it was.
 */
export default function TvDj({ v }: { v: DjView }) {
  const { room, code, g, now, nameOf } = useRoom();
  const { lang, sound } = useStore();
  const zh = lang === "zh";
  // at one of the owner's tables this screen may stream Lyria (the private test)
  const sid = room?.you ?? "";
  const lyria = useMemo(() => (v.lab && sid ? { url: lyriaUrl(code, sid), key: `${code}:${sid}` } : null), [v.lab, sid, code]);
  const booth = useBooth({
    phase: v.phase,
    mix: v.mix,
    muted: !sound,
    onReport: (r) => g("stats", r),
    lyria,
    deck: v.deck,
    now,
    onGrid: (grid) => g("grid", grid),
    onDecks: (decks) => g("decks", decks),
    roomSource: v.source,
    onEnding: (id) => g("ending", { id }),
  });
  // where the music should come from: the host's songs when they want them and there are some,
  // else whichever DJ plays (the stand-in, or Lyria at one of the owner's tables)
  const want = v.mine && booth.crate.length ? "local" : booth.source === "local" ? "fake" : booth.source;
  // songs the host sends from their phone (songwire.ts): put back together here, listened to like
  // this computer's own, and the phone told how it went
  const { onBytes } = useRoom();
  const take = booth.takeSongPiece;
  useEffect(
    () =>
      onBytes((data) => {
        const piece = decodePiece(data);
        if (piece) take(piece, (by, id, r) => g("song", { by, id, code: SONG_SENT.indexOf(r) }));
      }),
    [onBytes, take, g],
  );
  // the host's songs on this computer, by name, for the room (said again until it has them all)
  const crateN = useRef(v.crateN);
  crateN.current = v.crateN;
  const crateKey = booth.crate.map((s) => s.id).join(",");
  useEffect(() => {
    const list = booth.crate;
    // (none on this computer, the page opened again or the host cleared them: the room's names
    // for them go too, they couldn't be played, and the host's phone sees none)
    if (!list.length && crateN.current === 0) return;
    const send = () => g("crate", { songs: list.map((s) => [s.id, s.title, s.artist, Math.round(s.beat.bpm * 10) / 10, Math.round(s.seconds)]) });
    send();
    const id = window.setInterval(() => {
      if (crateN.current !== list.length) send();
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crateKey, g]);
  const { speaker, dj } = booth;
  // the beginner deck: every pad pressed at the table plays here, on the next beat
  const chips = usePadEvents(booth.pad);

  // the music starts here: the room's set begins when this screen says it's playing (said again
  // every few seconds until the room has heard it: a message can be lost on a dropping connection)
  useEffect(() => {
    if (booth.status !== "on" || v.phase !== "wait") return;
    g("live", { source: want });
    const id = window.setInterval(() => g("live", { source: want }), 3000);
    return () => window.clearInterval(id);
  }, [booth.status, want, v.phase, v.set, g]);
  // and when its music changes hands mid-set (Lyria took over, or the stand-in came back), said
  // again every few seconds until the room has it
  useEffect(() => {
    if (booth.status !== "on" || v.phase === "wait" || v.phase === "end" || want === v.source) return;
    g("src", { source: want });
    const id = window.setInterval(() => g("src", { source: want }), 3000);
    return () => window.clearInterval(id);
  }, [booth.status, want, v.phase, v.source, g]);
  // local runs: what the checks read (scripts/dj_lyria_check.py)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __djBooth: unknown }).__djBooth = {
      stats: () => speaker?.stats() ?? null,
      level: () => speaker?.level() ?? 0,
      source: booth.source,
      beat: () => dj.beat(),
      // the section the speakers sound now (the stand-in's: with its song's track number)
      heard: () => dj.heardSection(),
      // what the deck played, with audio times, and the audio time now: the checks line them up with the beat
      deck: () => ({ log: booth.driver?.log ?? [], now: speaker?.ctx.currentTime ?? 0, beatAt: (b: number) => (dj.beatFrame(b) === null ? null : speaker?.timeOfFrame(dj.beatFrame(b)!)) }),
    };
  }, [speaker, booth.source, booth.driver, dj]);

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
  // the lights and the dancers follow the music the speakers are playing, which reaches a new
  // stretch of the night on the phrase after the host's tap
  const heard = useHeardPhase(dj, booth.status === "on");
  const stage: DjPhase = v.phase === "end" || v.phase === "wait" ? v.phase : (heard ?? v.phase);
  useFloorLoop(root, clock, ENERGY[stage].density, fires);
  // 跟着跳: the coach dances on the same clock, at the speaker's tempo
  const bpmNow = useRef(125);
  bpmNow.current = v.deck?.grid?.bpm ?? 125;
  const coachClock = useMemo(() => ({ ...clock, bpm: () => bpmNow.current }), [clock]);

  // the player's state, for the buffering note
  const [state, setState] = useState("waiting");
  useEffect(() => {
    if (!speaker) return;
    return speaker.onTick((t) => setState(t.state));
  }, [speaker]);

  useTicker(v.phase !== "wait" && v.phase !== "end", 5000);
  const seats = room?.seats ?? [];
  // the dance floor is the players' (a seat that just watches doesn't dance); the join card counts everyone in the room
  const dancers = playersOf(seats);
  const h = useHeat(v);
  const heat = h.minute;
  const fans = h.top
    .map((pid) => ({ seat: seats.find((s) => s.id === pid), n: h.total(pid) }))
    .filter((f) => f.seat && f.n > 0)
    .slice(0, 3);
  const live = booth.status === "on";
  const silent = live && (v.phase === "wait" || state !== "playing") && v.phase !== "end";
  const tonight = Object.values(v.total).reduce((a, b) => a + b, 0);
  // ❄️ this minute, and the DJ reading the floor (读场: Lyria leans its energy with it)
  const chills = v.colds.filter((c) => now() - c.at < 60_000).length;
  const lean = heatLean(v.fires, v.colds, now());
  const reads = v.source === "lyria" && Math.abs(lean) >= 0.2 ? (lean > 0 ? (zh ? "DJ 读到了：大家很嗨，加劲" : "The DJ reads the floor: hot, pushing on") : zh ? "DJ 读到了：有点冷，收一收" : "The DJ reads the floor: cold, easing off") : null;
  // 跟着跳: who's dancing now (a bar sent in the last four), how well, and who's keeping it up
  const grid = v.deck?.grid;
  const barNow = grid ? grid.bar + Math.floor((now() - grid.at) / (240_000 / grid.bpm)) : -1;
  const dancing = { n: 0, floor: {} as Record<string, { share: number; hot: boolean }> };
  for (const [pid, d] of Object.entries(v.dance ?? {})) {
    if (barNow - d.bar > 4) continue;
    dancing.n++;
    dancing.floor[pid] = { share: danceShare(d), hot: d.streak >= 2 };
  }
  // 真歌时间: the DJ gives way to a whole song from YouTube over the two bars after its drop, and
  // comes back when it's over
  const songAt = v.deck?.song?.at ?? 0;
  useEffect(() => {
    if (!speaker) return;
    if (songAt) speaker.giveWay(true, Math.max(0.5, (songAt - now()) / 1000));
    else speaker.giveWay(false, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaker, songAt]);
  // 报幕: who the song coming in is from, as its countdown starts
  useAnnounce(v, speaker, nameOf, zh, live && v.voice !== false);

  // the moment the music itself reaches a new stretch of the night (not the host's tap, which can
  // come up to a phrase earlier): its name, big, on the beat it lands
  const [banner, setBanner] = useState<{ phase: DjPhase; n: number } | null>(null);
  const lastHeard = useRef<DjPhase | null>(null);
  useEffect(() => {
    if (!heard || heard === lastHeard.current) return;
    lastHeard.current = heard;
    setBanner((b) => ({ phase: heard, n: (b?.n ?? 0) + 1 }));
  }, [heard]);
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 2800);
    return () => window.clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    // a new set announces its warm-up again
    if (v.phase === "wait" || v.phase === "end") lastHeard.current = null;
  }, [v.phase]);

  return (
    <div className={`dj-stage is-${stage} ${live ? "is-live" : ""}`} ref={root}>
      <div className="dj-sky" aria-hidden="true" />
      <div className="dj-beams" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} style={{ ["--k" as string]: k }} />
        ))}
      </div>
      <FloorGrid />

      <header className="dj-head">
        <Wordmark />
        <span className="dj-title">
          <Disc3 size={30} strokeWidth={2} />
          <span>{zh ? "打碟" : "DJ Booth"}</span>
          <small>{zh ? "DJ Booth" : "打碟"}</small>
        </span>
      </header>

      {/* (a rooms server a moment behind the site, mid-deploy, sends no deck yet) */}
      {v.deck && <DeckBoard v={v} clip={booth.clipOn} />}
      <JoinCard code={code} big={!seats.length} />

      <Floor seats={dancers} flames={flames} host={room?.host} dance={dancing.floor} />
      {live && v.phase !== "end" && !v.deck?.song && <Coach clock={coachClock} zh={zh} combo={v.combo ?? 0} dancers={dancing.n} />}
      {live && <TubePlayer v={v} zh={zh} nameOf={nameOf} now={now} done={(id) => g("songdone", { id })} />}
      {!dancers.length && <p className="dj-empty">{zh ? "舞池空着，扫码上来" : "The floor's empty. Scan in."}</p>}

      {banner && <DropBanner key={banner.n} phase={banner.phase} />}
      <PadChips chips={chips} lines={(v.deck?.up ? 1 : 0) + (v.deck?.now ? 1 : 0) + (mixerShows(v.deck?.mixer) ? 1 : 0)} />
      {v.deck && <Countdown v={v} />}
      {v.deck && <DropParty v={v} />}
      {live && v.deck && <HintLine v={v} />}

      <footer className="dj-foot">
        <NightCurve v={v} now={now()} />
        <div className="dj-heat">
          <span className="dj-heat-n tabular">
            <FlameIcon size={30} strokeWidth={2.4} />
            {v.phase === "end" ? tonight : heat}
          </span>
          {v.phase !== "end" && chills > 0 && (
            <span className="dj-heat-n is-cold tabular">
              <Snowflake size={26} strokeWidth={2.4} />
              {chills}
            </span>
          )}
          <span className="dj-heat-label">
            {v.phase === "end" ? (zh ? "今晚的 🔥" : "🔥 tonight") : zh ? "这一分钟" : "this minute"}
            {reads && <span className="dj-heat-read">{reads}</span>}
          </span>
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
      <KeepAwake on={live && v.phase !== "end"} />

      {silent && live && v.phase !== "wait" && (
        <div className="dj-buffer" role="status">
          <Loader2 size={20} className="dj-spin" />
          {state === "buffering" ? (zh ? "缓冲中…" : "Buffering…") : zh ? "DJ 正在调音…" : "The DJ is warming up…"}
        </div>
      )}

      {v.phase === "end" && <EndCard v={v} />}

      <LocalPanel booth={booth} v={v} />
      {!live && (
        <StartCard
          status={booth.status}
          midSet={v.phase !== "wait" && v.phase !== "end"}
          onStart={() => {
            primeVoice();
            booth.start();
          }}
        />
      )}
      {live && booth.stopped && (
        <button
          type="button"
          className="dj-wake"
          onClick={() => {
            primeVoice();
            booth.wake();
          }}
        >
          <Play size={30} strokeWidth={2.6} />
          {zh ? "声音停了，点一下接着放" : "The sound stopped. Tap to carry on"}
        </button>
      )}
    </div>
  );
}

const DROP_LINES: Record<DjPhase, { zh: string; en: string }> = {
  wait: { zh: "", en: "" },
  warm: { zh: "先热热身", en: "Ease into it" },
  build: { zh: "往上走", en: "Here it comes" },
  peak: { zh: "全场跳起来", en: "Everybody up" },
  cool: { zh: "慢慢放下来", en: "Bring it home" },
  end: { zh: "", en: "" },
};

/** The name of the stretch the music has just reached, across the floor for a moment. */
function DropBanner({ phase }: { phase: DjPhase }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className={`dj-drop is-${phase}`} role="status">
      <span className="dj-drop-name">{phaseName(phase, zh)}</span>
      <span className="dj-drop-line">{zh ? DROP_LINES[phase].zh : DROP_LINES[phase].en}</span>
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

/**
 * The screen stays on while it's the speaker: a tablet or a TV that dims and goes to sleep stops the
 * music, and often reloads the page when it wakes (Steve on Nov 2: "Dj这个我经常闪退", on a TV or
 * tablet's own browser). Where the browser can't be asked to (an older tablet or TV), a tiny silent
 * video playing keeps it awake instead.
 */
function KeepAwake({ on }: { on: boolean }) {
  useWakeLock(on);
  const asks = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = vid.current;
    if (!el || !on) return;
    void el.play().catch(() => {});
    return () => el.pause();
  }, [on]);
  if (asks) return null;
  return <video ref={vid} className="dj-awake" src="/media/awake.mp4" muted loop playsInline aria-hidden="true" />;
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

/** The set is over: the night's recap (今晚回顾). */
function EndCard({ v }: { v: DjView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dj-end" role="status">
      <h2 className="dj-end-title">{phaseName("end", zh)}</h2>
      <span className="dj-end-kicker">{zh ? "今晚回顾" : "Tonight's recap"}</span>
      <RecapLines v={v} zh={zh} line="dj-end-line" note="dj-end-note" />
      <p className="dj-end-note">{zh ? "主人在手机上可以再来一场" : "The host can start another set from their phone"}</p>
    </div>
  );
}
