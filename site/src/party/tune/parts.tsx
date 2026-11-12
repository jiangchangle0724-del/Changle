import { ExternalLink, Lock, Music } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { POOL_CATS, POOL_ERAS } from "../../data/songPools";
import { clipOf, TUNES, type Tune } from "../../data/tunes";
import { gsap, reduced } from "../../lib/anim";
import { playMelody, type TuneHandle } from "../../lib/music";
import { loadPreview, playElement, playPreview, type PreviewHandle } from "../../lib/preview";
import { curveAt, type BeatMap } from "../../lib/beats";
import { isSfxEnabled } from "../../lib/sfx";
import { CATS, DEFAULT_HOOK_MS, DEFAULT_POOL, ERAS, HOOK_MAX_MS, parsePool, poolOf, SNAP_SECONDS, SOURCES, specialOf, type CatKey, type EraKey, type SongPool, type SourceKey } from "../../shared/songs";
import { useStore } from "../../store";
import { perfAt } from "../sensors";
import { SingerSheet } from "./SingerSheet";
import { specialBy, specialName } from "./specials";

/** A tune by its place in the list, or the notes themselves (online, the server sends only the notes). */
type Playable = number | Tune;
const asTune = (t: Playable): Tune | undefined => (typeof t === "number" ? TUNES[t] : t);

/** Seconds a clip lasts at its tempo. */
export function clipSeconds(tune: Playable, stage: number) {
  const t = asTune(tune);
  if (!t) return 0;
  return (clipOf(t, stage).reduce((a, [, b]) => a + b, 0) * 60) / t.bpm;
}

/** Play one clip of a tune, now or at a moment on this phone's performance clock. */
export function playClip(tune: Playable, stage: number, startPerf?: number): TuneHandle | null {
  const t = asTune(tune);
  if (!t) return null;
  return playMelody(clipOf(t, stage), { bpm: t.bpm, inst: "musicbox", startPerf, volume: 1.1 });
}

/** A record that spins while the music plays. */
export function Vinyl({ spinning, label }: { spinning: boolean; label?: ReactNode }) {
  return (
    <div className={`vinyl ${spinning ? "is-spinning" : ""}`} aria-hidden="true">
      <span className="vinyl-disc">
        <span className="vinyl-label">{label}</span>
      </span>
      <span className="eq">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ animationDelay: `${-i * 0.17}s` }} />
        ))}
      </span>
    </div>
  );
}

/** Three clips, three prices: the sooner you get it, the more it's worth. */
export function StageDots({ stage }: { stage: number }) {
  const { lang } = useStore();
  return (
    <div className="stages" role="status">
      {[3, 2, 1].map((pts, i) => (
        <span key={pts} className={`stage ${i === stage ? "is-now" : i < stage ? "is-past" : ""}`}>
          <strong className="tabular">{pts}</strong>
          {lang === "zh" ? "分" : pts === 1 ? "pt" : "pts"}
        </span>
      ))}
    </div>
  );
}

/** The big round button. First phone to hit it gets to answer. */
export function BuzzButton({ onBuzz, locked, disabled, label }: { onBuzz: () => void; locked?: boolean; disabled?: boolean; label?: string }) {
  const { lang } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className={`buzz ${locked ? "is-locked" : ""}`}
      disabled={disabled || locked}
      onPointerDown={(e) => {
        // fire on touch-down, not release: a buzzer is a race
        e.preventDefault();
        if (disabled || locked) return;
        onBuzz();
        if (!reduced() && ref.current) gsap.fromTo(ref.current, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      }}
      onClick={(e) => {
        // keyboard presses arrive as clicks with no pointer behind them
        if (e.detail === 0 && !disabled && !locked) onBuzz();
      }}
    >
      {locked ? <Lock size={34} /> : <span>{label ?? (lang === "zh" ? "抢！" : "Buzz!")}</span>}
    </button>
  );
}

/** Which stage of the clip is on now (by the server's clock). */
export function stageNow(stageAt: number[], now: number) {
  let s = 0;
  stageAt.forEach((at, i) => {
    if (at <= now) s = i;
  });
  return s;
}

/** Title reveal, with the other language underneath. */
export function TuneTitle({ tune }: { tune: number }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const t = TUNES[tune];
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 16, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.8)", clearProps: "transform,opacity" });
  }, [tune]);
  if (!t) return null;
  return (
    <div className="tune-title" ref={ref}>
      <strong>{lang === "zh" ? t.title.zh : t.title.en}</strong>
      <small>{lang === "zh" ? t.title.en : t.title.zh}</small>
    </div>
  );
}

/* ---------- real songs ---------- */

export type SongAudio = { url: string | null; buf: AudioBuffer | null; status: "idle" | "loading" | "ready" | "failed" | "muted" };

/** Load a preview as soon as its URL is known; `status` says whether this phone can play it. */
export function useSongAudio(url: string | null): SongAudio {
  const { sound } = useStore();
  const [st, setSt] = useState<SongAudio>({ url: null, buf: null, status: "idle" });
  useEffect(() => {
    if (!url) {
      setSt({ url: null, buf: null, status: "idle" });
      return;
    }
    if (!sound) {
      setSt({ url, buf: null, status: "muted" });
      return;
    }
    let gone = false;
    setSt({ url, buf: null, status: "loading" });
    void loadPreview(url).then((buf) => {
      if (!gone) setSt({ url, buf, status: buf ? "ready" : "failed" });
    });
    return () => {
      gone = true;
    };
  }, [url, sound]);
  return st;
}

/** Start a loaded preview at `offset` seconds, now or at a moment on the performance clock. */
export function startSong(a: SongAudio, opts: { startPerf?: number; offset?: number; seconds?: number; fadeIn?: number; fadeOut?: number }): PreviewHandle | null {
  if (!isSfxEnabled()) return null;
  if (a.buf) return playPreview(a.buf, opts);
  if (a.status === "failed" && a.url) {
    const delayMs = opts.startPerf !== undefined ? opts.startPerf - performance.now() : 0;
    return playElement(a.url, { offset: opts.offset, delayMs, seconds: opts.seconds });
  }
  return null;
}

/* ---------- one second (一秒猜歌) ---------- */

/**
 * Where the one-second snippets start in a preview, in ms: the first beat after the opening second
 * where the singing is strong (a voice is what people know a song by), within the first 15 seconds.
 * No beat map (the song couldn't be analysed): just past Apple's fade-in.
 */
export function hookOf(map: BeatMap | null, duration: number): number {
  const latest = Math.min(15, duration - 5);
  if (!map || !map.voice.length || !map.beats.length || latest <= 1) return DEFAULT_HOOK_MS;
  const singing = (t: number) => {
    let sum = 0;
    let n = 0;
    for (let x = t; x < t + 1; x += map.frame) {
      sum += curveAt(map.voice, map.frame, x);
      n++;
    }
    return n ? sum / n : 0;
  };
  // (from a second in: Apple's previews fade in)
  const beats = Array.from(map.beats).filter((b) => b >= 1 && b <= latest);
  if (!beats.length) return DEFAULT_HOOK_MS;
  const scores = beats.map(singing);
  const best = Math.max(...scores);
  // hardly any voice (an instrumental): the first beat; otherwise the first one sung out
  const i = best < 0.2 ? 0 : scores.findIndex((x) => x >= best * 0.75);
  return Math.min(HOOK_MAX_MS, Math.round(beats[Math.max(0, i)] * 100) * 10);
}

/** When each snippet of a one-second round plays, on the server's clock: the first two are short,
 *  the last plays on to the end of the round. */
export function snippetSpans(stageAt: number[], endsAt: number): [number, number][] {
  return stageAt.map((at, i) => [at, i < SNAP_SECONDS.length ? at + SNAP_SECONDS[i] * 1000 : Math.max(at, endsAt)]);
}

/**
 * Play a one-second round's snippets at their moments on the server's clock, every one from the
 * song's hook. A phone that loads late, or a round picking up after a buzz, joins a snippet mid-way.
 */
export function playSnippets(a: SongAudio, stageAt: number[], endsAt: number, hookMs: number, serverNow: number): (PreviewHandle | null)[] {
  const hook = hookMs / 1000;
  return snippetSpans(stageAt, endsAt).map(([from, to]) => {
    const len = (to - from) / 1000;
    const lead = from - serverNow;
    if (lead > 0) return startSong(a, { startPerf: perfAt(from, serverNow), offset: hook, seconds: len, fadeIn: 0.03, fadeOut: 0.12 });
    const done = -lead / 1000;
    if (done < len - 0.15) return startSong(a, { offset: hook + done, seconds: len - done, fadeIn: 0.05, fadeOut: 0.12 });
    return null;
  });
}

/** Whether a one-second round's snippet is playing now (the stage dances, the record spins). */
export function useSnippetOn(on: boolean, stageAt: number[], endsAt: number, now: () => number): boolean {
  const [inside, setInside] = useState(false);
  const key = stageAt.join(",");
  useEffect(() => {
    if (!on) {
      setInside(false);
      return;
    }
    const spans = snippetSpans(stageAt, endsAt);
    const tick = () => {
      const t = now();
      setInside(spans.some(([a, b]) => t >= a && t < b));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key, endsAt]);
  return inside;
}

/** How a real song plays: the whole preview, or one second first (一秒猜歌) and more if nobody gets it. */
export function SnapPicker({ snap, onPick, disabled }: { snap: boolean; onPick: (snap: boolean) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="tn-level">
      <div className="seg seg-sm" role="group" aria-label={zh ? "怎么放" : "How it plays"}>
        <button type="button" aria-pressed={!snap} disabled={disabled} onClick={() => onPick(false)}>
          {zh ? "整段放" : "Whole clip"}
        </button>
        <button type="button" aria-pressed={snap} disabled={disabled} onClick={() => onPick(true)}>
          {zh ? "一秒猜歌" : "One second"}
        </button>
      </div>
      <p className="tn-pool-hint">
        {snap
          ? zh
            ? "先放一秒，猜不出再放三秒，再不行一直放：3 分、2 分、1 分"
            : "One second first, then three, then the rest: 3, 2, 1 points"
          : zh
            ? "30 秒试听一直放，越早喊出来分越高"
            : "The 30-second preview plays on. The sooner, the more points."}
      </p>
    </div>
  );
}

/**
 * What to listen to: any number of languages (plus the world classics and today's charts), any number
 * of categories and decades, or none for all of them. Only categories and decades that a picked
 * language has songs in are offered (no rock in Korean, say); one that no longer fits is dropped.
 * Or a singer special (歌手专场): one singer's songs, picked from a sheet.
 *
 * `total`: how many songs the game is set to, for a singer with fewer.
 */
export function PoolPicker({ pool, onPick, disabled, total }: { pool: string; onPick: (p: SongPool) => void; disabled?: boolean; total?: number }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const singer = specialOf(pool);
  const [sheet, setSheet] = useState(false);
  /** the languages to go back to from a singer special */
  const byLang = useRef(singer ? DEFAULT_POOL : pool);
  if (!singer && parsePool(pool)) byLang.current = pool;
  const cur = parsePool(byLang.current) ?? parsePool(DEFAULT_POOL)!;
  const withCats = cur.srcs.filter((k) => SOURCES.find((x) => x.key === k)?.cats);
  const offered = CATS.filter((c) => withCats.some((k) => !POOL_CATS[k] || POOL_CATS[k].includes(c.key)));
  const keep = cur.cats.filter((c) => offered.some((o) => o.key === c));
  const decades = ERAS.filter((e) => withCats.some((k) => !POOL_ERAS[k] || POOL_ERAS[k].includes(e.key)));
  const keepEras = cur.eras.filter((e) => decades.some((o) => o.key === e));
  const fix = !singer && withCats.length && (keep.length !== cur.cats.length || keepEras.length !== cur.eras.length) ? poolOf(cur.srcs, keep, keepEras) : "";
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (fix && !disabled) pick.current(fix);
  }, [fix, disabled]);
  const everything = cur.srcs.length === SOURCES.length;
  const toggleSrc = (k: string) => {
    const on = cur.srcs.includes(k as SourceKey);
    if (on && cur.srcs.length === 1) return; // something always plays
    onPick(poolOf(on ? cur.srcs.filter((x) => x !== k) : [...cur.srcs, k], cur.cats, cur.eras));
  };
  const toggleCat = (c: string) => onPick(poolOf(cur.srcs, cur.cats.includes(c as CatKey) ? cur.cats.filter((x) => x !== c) : [...cur.cats, c], cur.eras));
  const toggleEra = (e: string) => onPick(poolOf(cur.srcs, cur.cats, cur.eras.includes(e as EraKey) ? cur.eras.filter((x) => x !== e) : [...cur.eras, e]));
  const special = singer ? specialBy(singer) : null;
  const name = special ? specialName(special, zh) : singer;
  const few = special && total && special[4] < total ? special[4] : 0;
  return (
    <div className="tn-pool" role="group" aria-label={zh ? "歌单" : "Songs"}>
      <div className="seg seg-sm" role="group" aria-label={zh ? "怎么选歌" : "Which songs"}>
        <button type="button" aria-pressed={!singer} disabled={disabled} onClick={() => singer && onPick(byLang.current)}>
          {zh ? "按语言" : "By language"}
        </button>
        <button type="button" aria-pressed={!!singer} disabled={disabled} onClick={() => setSheet(true)}>
          {zh ? "歌手专场" : "One singer"}
        </button>
      </div>
      {singer ? (
        <>
          <div className="tn-pool-singer">
            <strong>{name}</strong>
            {special && <small className="tabular">{zh ? `${special[4]} 首` : `${special[4]} songs`}</small>}
            {!disabled && (
              <button type="button" className="chip chip-sm" onClick={() => setSheet(true)}>
                {zh ? "换一位" : "Change"}
              </button>
            )}
          </div>
          <p className="tn-pool-hint">
            {zh ? `只放${name}的歌，四个选项也全是${name}的歌` : `Only ${name}'s songs, and all four titles are theirs.`}
            {few > 0 && (zh ? `。${few} 首放完就结束` : ` The game ends after their ${few}.`)}
          </p>
        </>
      ) : (
        <>
          <div className="tn-pool-row">
            {SOURCES.map((x) => (
              <button key={x.key} type="button" className="chip" aria-pressed={cur.srcs.includes(x.key)} disabled={disabled} onClick={() => toggleSrc(x.key)}>
                {zh ? x.zh : x.en}
              </button>
            ))}
            <button type="button" className="chip chip-all" aria-pressed={everything} disabled={disabled} onClick={() => onPick(everything ? DEFAULT_POOL : poolOf(SOURCES.map((x) => x.key), cur.cats, cur.eras))}>
              {zh ? "全选" : "All"}
            </button>
          </div>
          {withCats.length > 0 && (
            <div className="tn-pool-row tn-pool-cats" role="group" aria-label={zh ? "类别" : "Category"}>
              <button type="button" className="chip" aria-pressed={keep.length === 0} disabled={disabled} onClick={() => onPick(poolOf(cur.srcs, [], cur.eras))}>
                {zh ? "不限" : "Any"}
              </button>
              {offered.map((c) => (
                <button key={c.key} type="button" className="chip" aria-pressed={keep.includes(c.key)} disabled={disabled} onClick={() => toggleCat(c.key)}>
                  {zh ? c.zh : c.en}
                </button>
              ))}
            </div>
          )}
          {withCats.length > 0 && decades.length > 0 && (
            <div className="tn-pool-row tn-pool-cats" role="group" aria-label={zh ? "年代" : "Decade"}>
              <button type="button" className="chip" aria-pressed={keepEras.length === 0} disabled={disabled} onClick={() => onPick(poolOf(cur.srcs, cur.cats, []))}>
                {zh ? "所有年代" : "Any decade"}
              </button>
              {decades.map((e) => (
                <button key={e.key} type="button" className="chip" aria-pressed={keepEras.includes(e.key)} disabled={disabled} onClick={() => toggleEra(e.key)}>
                  {zh ? e.zh : e.en}
                </button>
              ))}
            </div>
          )}
          {!disabled && <p className="tn-pool-hint">{zh ? "语言、类别和年代都能多选，点一下选上，再点一下取消" : "Pick as many languages, categories and decades as you like. Tap again to drop one."}</p>}
        </>
      )}
      {!disabled && <SingerSheet open={sheet} onClose={() => setSheet(false)} current={singer} onPick={(who) => onPick(`@${who}`)} />}
    </div>
  );
}

/** How the table answers: race to buzz, or everyone picks from four at once. */
export function AnswerPicker({ quiz, onPick, disabled }: { quiz: boolean; onPick: (quiz: boolean) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="seg seg-sm" role="group" aria-label={zh ? "怎么答" : "How to answer"} style={{ alignSelf: "center" }}>
      <button type="button" aria-pressed={!quiz} disabled={disabled} onClick={() => onPick(false)}>
        {zh ? "抢答" : "Buzz in"}
      </button>
      <button type="button" aria-pressed={quiz} disabled={disabled} onClick={() => onPick(true)}>
        {zh ? "选择题" : "Multiple choice"}
      </button>
    </div>
  );
}

/**
 * How hard the four titles are (real songs): each with its singer, or titles only, the wrong ones by
 * the same singer as far as there are any.
 */
export function LevelPicker({ hard, onPick, disabled }: { hard: boolean; onPick: (hard: boolean) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="tn-level">
      <div className="seg seg-sm" role="group" aria-label={zh ? "选项的难度" : "How hard the titles are"}>
        <button type="button" aria-pressed={!hard} disabled={disabled} onClick={() => onPick(false)}>
          {zh ? "简单" : "Easy"}
        </button>
        <button type="button" aria-pressed={hard} disabled={disabled} onClick={() => onPick(true)}>
          {zh ? "难" : "Hard"}
        </button>
      </div>
      <p className="tn-pool-hint">
        {hard
          ? zh
            ? "选项只写歌名，错的尽量是同一个歌手的歌"
            : "Titles only. The wrong ones are by the same singer where possible."
          : zh
            ? "选项写着歌手名"
            : "Each title shows its singer"}
      </p>
    </div>
  );
}

/** One of the four titles; `a` and `ae` empty on the hard level (no singer shown). */
export type QuizChoice = { id: number; t: string; a: string; ae: string };

/** A classic tune as a choice: its title in this phone's language, the other one underneath. A tune
 *  this phone doesn't have (the table server is a newer version than the page) shows as a "?". */
export function tuneChoice(o: number, zh: boolean): QuizChoice {
  const t = TUNES[o]?.title ?? { zh: "?", en: "?" };
  return { id: o, t: zh ? t.zh : t.en, a: t.en, ae: t.zh };
}

/**
 * Four titles for everyone. Before the reveal a tap is the player's pick (one only); at the reveal
 * the right one lights up and a wrong pick is marked.
 *
 * One phone for the whole table (`tried`): the table guesses until it gets it, so a wrong title is
 * marked and locked, and the others can still be tapped.
 */
export function QuizChoices({ choices, mine, answer, onPick, disabled, tried = [] }: { choices: QuizChoice[]; mine: number | null; answer: number | null; onPick?: (id: number) => void; disabled?: boolean; tried?: number[] }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const done = answer !== null;
  return (
    <div className="tn-quiz" role="group" aria-label={zh ? "四个歌名" : "Four titles"}>
      {choices.map((c) => {
        const missed = tried.includes(c.id) && c.id !== answer;
        const cls = ["tn-option", mine === c.id ? "is-mine" : "", done && c.id === answer ? "is-right" : "", missed || (done && mine === c.id && c.id !== answer) ? "is-wrong" : ""].join(" ");
        return (
          <button key={c.id} type="button" className={cls} disabled={disabled || done || mine !== null || missed} aria-pressed={mine === c.id} onClick={() => onPick?.(c.id)}>
            <strong>{c.t}</strong>
            {(zh ? c.a : c.ae) && <small>{zh ? c.a : c.ae}</small>}
            {mine === c.id && !done && <span className="tn-pick">{zh ? "你的答案" : "Your pick"}</span>}
            {missed && !done && <span className="tn-pick tn-pick-miss">{zh ? "不是这首" : "Not this one"}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Cover art in the middle of the record. */
export function CoverLabel({ art }: { art: string }) {
  const [ok, setOk] = useState(true);
  if (!art || !ok) return <Music size={30} strokeWidth={2.4} />;
  return <img className="vinyl-art" src={art} alt="" onError={() => setOk(false)} />;
}

/** The song, once it's out: title, artist, and a way to hear the rest of it. */
export function SongReveal({ song }: { song: { t: string; a: string; ae: string; url: string } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 16, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.8)", clearProps: "transform,opacity" });
  }, [song.url]);
  return (
    <div className="tune-title song-title" ref={ref}>
      <strong>{song.t}</strong>
      <small>{zh ? song.a : song.ae}</small>
      <a className="song-link" href={song.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} />
        {zh ? "在 Apple Music 听完整版" : "Listen on Apple Music"}
      </a>
    </div>
  );
}

/** Where this phone is with the song: loading, or can't play it at all. */
export function SongStatus({ audio, playing }: { audio: SongAudio; playing: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (audio.status === "loading" && playing) return <p className="hint song-status">{zh ? "歌在路上，马上就响" : "The song is on its way"}</p>;
  if (audio.status === "muted") return <p className="hint song-status">{zh ? "这台手机的声音关着，打开声音才听得到歌" : "Sound is off on this phone. Turn it on to hear the song."}</p>;
  return null;
}
