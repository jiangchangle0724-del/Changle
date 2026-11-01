import { Disc3, Play, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { reduced } from "../../lib/anim";
import { holdBackground } from "../../lib/music";
import { mixFor, FAKE_MIX } from "../../shared/dj/curve";
import { SET_PHASES, type DjPhase } from "../../shared/dj/types";
import type { SeatView } from "../../shared/protocol";
import { useStore } from "../../store";
import { Floor, useFloorLoop } from "./Floor";
import { mixLine, phaseName, useHeardPhase } from "./parts";
import { useBooth } from "./useBooth";
import "../../styles/dj.css";

const DANCERS: SeatView[] = ["Amy", "Ben", "Cat", "Dev", "Eli"].map((name, i) => ({ id: `demo${i}`, name, on: true }));

/**
 * changle.ca/dj/test: the speaker on its own, no table needed. Press start and you should hear the
 * stand-in DJ; the numbers show how the playing is going (a phone or a Mac, Safari or Chrome).
 * Works on a branch preview too, where the rooms server doesn't know the booth yet.
 */
export function DjTestPage() {
  // the speaker is the only music here: the lounge loop stays off
  useEffect(() => holdBackground(), []);
  const { lang, setLang } = useStore();
  const zh = lang === "zh";
  const [phase, setPhase] = useState<DjPhase>("wait");
  const [muted, setMuted] = useState(false);
  const booth = useBooth({ phase, muted });
  const { speaker, dj } = booth;


  const root = useRef<HTMLDivElement>(null);
  const fires = useRef(new Map<string, number>());
  const clock = useMemo(
    () => ({
      beat: () => (speaker && speaker.stats().state === "playing" ? dj.beat() : NaN),
      energy: () => speaker?.energy() ?? 0,
    }),
    [speaker, dj],
  );
  // the lights follow what the speakers play (a new stretch lands on the phrase after the tap)
  const heard = useHeardPhase(dj, !!speaker);
  const stage: DjPhase = phase === "end" || phase === "wait" ? phase : (heard ?? phase);
  useFloorLoop(root, clock, mixFor(stage, FAKE_MIX).density, fires);

  // the numbers, four times a second
  const [, bump] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const st = speaker?.stats();
  const played = startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0;
  const beats = speaker ? dj.beat() : 0;
  const energy = speaker ? speaker.energy() : 0;

  // for the browser checks: what the page hears
  useEffect(() => {
    (window as unknown as { __djTest: unknown }).__djTest = {
      stats: () => speaker?.stats() ?? null,
      beat: () => (speaker ? dj.beat() : 0),
      energy: () => (speaker ? speaker.energy() : 0),
      phase: () => phase,
      ready: () => dj.ready,
    };
  }, [speaker, dj, phase]);

  const start = () => {
    booth.start();
    startedAt.current = performance.now();
    setPhase("warm");
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const stateName = !st ? (zh ? "没开" : "off") : st.state === "playing" ? (zh ? "在放" : "playing") : st.state === "buffering" ? (zh ? "缓冲中" : "buffering") : zh ? "准备中" : "getting ready";

  return (
    <div className={`djt is-${phase}`}>
      <header className="djt-head">
        <span className="djt-title">
          <Disc3 size={24} />
          {zh ? "打碟 · 音箱测试" : "DJ Booth · speaker test"}
        </span>
        <button type="button" className="djt-lang" onClick={() => setLang(zh ? "en" : "zh")}>
          {zh ? "EN" : "中"}
        </button>
      </header>

      <div className={`djt-stage dj-stage is-live is-${stage}`} ref={root}>
        <div className="dj-sky" aria-hidden="true" />
        <div className="dj-beams" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} style={{ ["--k" as string]: k }} />
          ))}
        </div>
        <div className="dj-plane" aria-hidden="true" />
        <Floor seats={DANCERS} flames={[]} />
        <div className="dj-flash" aria-hidden="true" />
      </div>

      <main className="djt-body">
        {booth.status !== "on" ? (
          <section className="djt-intro">
            <p>
              {zh
                ? "这一页只测声音，不用开桌。点下面的按钮，应该马上听到浩室音乐，人跟着拍子跳。iPhone 的静音键打开也应该有声。"
                : "This page only checks the sound; no table needed. Press the button and you should hear house music within a second or two, with the dancers on the beat. An iPhone should play it with the silent switch on, too."}
            </p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start} disabled={booth.status === "starting"}>
              <Play size={20} />
              {zh ? "开始派对" : "Start the party"}
            </button>
            {booth.status === "error" && <p className="djt-error">{zh ? "这个浏览器放不了。" : "This browser can't play it."}</p>}
            <p className="hint">{booth.prepared ? (zh ? "音乐已经准备好" : "The music is ready") : zh ? "正在准备音乐…" : "Getting the music ready…"}</p>
          </section>
        ) : (
          <>
            <section className="djt-phases" aria-label={zh ? "今晚的阶段" : "The night"}>
              <div className="seg" role="group">
                {SET_PHASES.map((p) => (
                  <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)}>
                    {phaseName(p, zh)}
                  </button>
                ))}
                <button type="button" aria-pressed={phase === "end"} onClick={() => setPhase("end")}>
                  {zh ? "结束" : "End"}
                </button>
              </div>
              <p className="hint">{zh ? "换阶段要等这一段 8 小节放完（最多 15 秒），像 DJ 一样在乐句上换。" : "A new stretch starts when the current 8 bars end (15 seconds at most), on the phrase, as a DJ would."}</p>
            </section>

            <dl className="djt-stats">
              <div>
                <dt>{zh ? "状态" : "State"}</dt>
                <dd className={`djt-state is-${st?.state ?? "off"}`}>{stateName}</dd>
              </div>
              <div>
                <dt>{zh ? "正在放" : "Playing now"}</dt>
                <dd>{heard ? phaseName(heard, zh) : "—"}</dd>
              </div>
              <div>
                <dt>{zh ? "缓冲" : "Buffered"}</dt>
                <dd className="tabular">{(st?.buffered ?? 0).toFixed(1)} s</dd>
              </div>
              <div>
                <dt>{zh ? "卡顿" : "Stalls"}</dt>
                <dd className="tabular">{st?.stalls ?? 0}</dd>
              </div>
              <div>
                <dt>{zh ? "放了" : "Playing for"}</dt>
                <dd className="tabular">{fmt(played)}</dd>
              </div>
              <div>
                <dt>{zh ? "小节 · 拍" : "Bar · beat"}</dt>
                <dd className="tabular">{beats > 0 ? `${Math.floor(beats / 4) + 1} · ${(Math.floor(beats) % 4) + 1}` : "—"}</dd>
              </div>
              <div>
                <dt>{zh ? "采样率 · 延迟" : "Rate · latency"}</dt>
                <dd className="tabular">
                  {(st?.rate ?? 0) / 1000} kHz · {Math.round((st?.latency ?? 0) * 1000)} ms
                </dd>
              </div>
              <div className="djt-meter-row">
                <dt>{zh ? "低频" : "Low end"}</dt>
                <dd>
                  <span className="djt-meter" style={{ ["--e" as string]: reduced() ? 0 : energy }} />
                </dd>
              </div>
            </dl>
            <p className="djt-mix">{mixLine(mixFor(phase, FAKE_MIX), zh)}</p>
            {booth.stopped && (
              <button type="button" className="btn btn-primary btn-block" onClick={booth.wake}>
                <Play size={18} />
                {zh ? "声音停了，点一下接着放" : "The sound stopped. Tap to carry on"}
              </button>
            )}

            <div className="djt-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                {muted ? (zh ? "打开声音" : "Sound on") : zh ? "静音" : "Mute"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => dj.holdFor(8000)}>
                <WifiOff size={18} />
                {zh ? "假装断网 8 秒" : "Drop the stream for 8 s"}
              </button>
            </div>
            <p className="hint">
              {zh
                ? "断网测试：手里还有 5 秒的歌，放完会慢慢淡出（不是“啪”一声断掉），网回来后攒够 1.5 秒再淡入，卡顿记一次。"
                : "The drop test: 5 seconds of music are already here, so it plays on, then fades out (no click), and fades back in once 1.5 seconds have come in again. That counts as one stall."}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
