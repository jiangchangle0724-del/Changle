import { EyeOff, Gavel, Mic, Vote } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { PACK_NAMES, PACKS, type Pack } from "../../data/straightfacePacks";
import type { T } from "../../i18n";
import { gsap, reduced } from "../../lib/anim";
import { sfx } from "../../lib/sfx";
import { SeatFace } from "../../online/People";
import type { SeatView } from "../../shared/protocol";
import { roundLines } from "../../shared/straightface/scoring";
import type { Level, PublicView, StraightFaceView } from "../../shared/straightface/types";
import { Bi, FacesIn, RoundTag, Stamp, stampIn, TvBoard, TvClock, TvLineup, TvPodium, TvShow, useArrivals, useBeat, useConfetti, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { PACK_ART, ROLE_ART, VERDICT_ART } from "./art";
import { cue } from "./sounds";
import "./tv-straightface.css";

/**
 * 一本正经 on the big screen: a late-night word show. The round's word on a big index card for the
 * whole room; whoever is explaining in the spotlight, the order down the side; the bets and the
 * judge's thinking as counts and faces (never who bet on whom); then the reveal, as the phones show
 * it: the real meaning, the fun fact, who did what, the honest one under the stamp, the points.
 * Nothing on this screen is anyone's part: it is drawn from the table's view only.
 */
export default function TvStraightFace({ v, sound }: TvViewProps<StraightFaceView>) {
  const { zh } = useLang();
  const t = v.table;
  const phase = v.phase;
  const clock =
    t && phase === "explain" && t.speakerId ? (
      <TvClock key={`e${t.roundNumber}-${t.speakerId}`} endsAt={v.stepAt + t.timers.explain * 1000} total={t.timers.explain * 1000} sound={sound} />
    ) : t && phase === "accuse" ? (
      <TvClock key={`a${t.roundNumber}`} endsAt={v.stepAt + t.timers.accuse * 1000} total={t.timers.accuse * 1000} sound={sound} />
    ) : null;
  const shownRound = t ? (phase === "between" || phase === "lobby" ? t.roundNumber + 1 : t.roundNumber) : 0;
  const tag =
    t && phase !== "setup" && phase !== "finished" ? (
      <RoundTag>
        {zh ? `第 ${Math.max(1, shownRound)} 轮` : `Round ${Math.max(1, shownRound)}`}
        <small>{zh ? ` / 共 ${t.roundsPlanned} 轮` : ` of ${t.roundsPlanned}`}</small>
      </RoundTag>
    ) : null;
  return (
    <TvShow game="straightface" className="tvsf" phase={phase} round={tag} clock={clock} set={<Shelves />}>
      {phase === "setup" && <Setup v={v} />}
      {t && phase === "peek" && <Peek v={v} t={t} sound={sound} />}
      {t && phase === "explain" && <Explain t={t} sound={sound} />}
      {t && phase === "bets" && <Bets v={v} t={t} sound={sound} />}
      {t && phase === "accuse" && <Accuse t={t} />}
      {t && phase === "reveal" && <Reveal v={v} t={t} sound={sound} />}
      {t && (phase === "between" || phase === "lobby") && <Between v={v} t={t} />}
      {t && phase === "finished" && <Finished v={v} t={t} sound={sound} />}
    </TvShow>
  );
}

/** The set: a wall of old dictionaries in the dark behind the stage. */
function Shelves() {
  return <i className="tvsf-shelves" />;
}

const isPack = (p: string | null | undefined): p is Pack => !!p && (PACKS as readonly string[]).includes(p);

/** A count as a list of names for useArrivals (the table's view says how many, never who). */
const counted = (n: number) => Array.from({ length: n }, (_, i) => String(i));

/** The word, as the phones show it: a Chinese original keeps its characters, with the reading under them. */
function wordOf(term: T, zh: boolean) {
  const original = term.zh.trim() !== "" && term.en.startsWith(term.zh);
  const main = original ? term.zh : zh ? term.zh : term.en;
  const sub = original ? term.en.slice(term.zh.length).trim() : zh ? term.en : term.zh;
  return { main, sub: sub && sub !== main ? sub : "" };
}

/** The round's word on an index card, its pack's picture in the corner; `children` under it (the meaning, at the reveal). */
function WordCard({ t, small = false, lead, children }: { t: PublicView; small?: boolean; lead?: ReactNode; children?: ReactNode }) {
  const { zh } = useLang();
  if (!t.term) return null;
  const w = wordOf(t.term, zh);
  const longest = Math.max(...w.main.split(/\s+/).map((x) => [...x].length));
  const fit = longest >= 14 ? "is-xlong" : longest >= 9 ? "is-long" : "";
  return (
    <div className={`tvsf-card ${small ? "is-small" : ""} ${fit}`}>
      <div className="tvsf-card-head">
        {isPack(t.pack) && (
          <span className="tvsf-pack">
            <img src={PACK_ART[t.pack]} alt="" width={44} height={44} />
            {zh ? PACK_NAMES[t.pack].zh : PACK_NAMES[t.pack].en}
          </span>
        )}
        {lead && <span className="tvsf-lead">{lead}</span>}
        {t.level && <Dots level={t.level} />}
      </div>
      <p className="tvsf-word" lang={/^[\x20-\x7e]+$/.test(w.main) ? "en" : undefined}>
        {w.main}
      </p>
      {w.sub && <p className="tvsf-reading">{w.sub}</p>}
      {children}
    </div>
  );
}

function Dots({ level }: { level: Level }) {
  return (
    <span className="tvsf-dots" aria-label={`${level}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? "is-on" : ""} />
      ))}
    </span>
  );
}

/** The people of this game, in the order given; anyone no longer seated is left out. */
function useGame(ids: string[]) {
  const { seat } = useSeats();
  return ids.map((id) => seat(id)).filter((s): s is SeatView => !!s);
}

/* ------------------------------------------------------------------ before the deal */

function Setup({ v }: { v: StraightFaceView }) {
  const { zh } = useLang();
  const { players } = useSeats();
  const short = Math.max(0, 3 - players.length);
  const cast = [
    { role: "judge", name: { zh: "裁判", en: "The judge" }, line: zh ? "听大家解释，找出老实人" : "Hears everyone out, finds the honest one" },
    { role: "honest", name: { zh: "老实人", en: "The honest one" }, line: zh ? "看过真释义，照实说" : "Read the real meaning, tells it straight" },
    { role: "bluffer", name: { zh: "瞎编的人", en: "The bluffers" }, line: zh ? "没看过，一本正经地编" : "Never saw it, make one up with a straight face" },
  ] as const;
  return (
    <div className="tvsf-setup">
      <ul className="tvsf-cast">
        {cast.map((c) => (
          <li key={c.role}>
            <img src={ROLE_ART[c.role]} alt="" width={210} height={210} />
            <Bi t={c.name} />
            <span>{c.line}</span>
          </li>
        ))}
      </ul>
      <p className="tvsf-sub">
        {short > 0 ? (zh ? `至少 3 个人，还差 ${short} 个` : `Needs 3 players: ${short} more`) : zh ? "主人在手机上选词包，然后发牌" : "The host picks the packs on their phone, then deals"}
        {v.setup.packs && <span className="tvsf-count tabular">{zh ? `${v.setup.packs.length} 个词包` : `${v.setup.packs.length} packs`}</span>}
      </p>
      <TvLineup people={players.map((s) => ({ seat: s }))} big={190} />
    </div>
  );
}

/* ------------------------------------------------------------------ the word goes up, everyone reads their part */

function Peek({ v, t, sound }: { v: StraightFaceView; t: PublicView; sound: boolean }) {
  const { zh } = useLang();
  const people = useGame(v.players);
  const root = useRef<HTMLDivElement>(null);
  useArrivals(counted(t.peekedCount), sound);
  useBeat(
    (tl, q) => {
      if (sound) tl.call(() => cue.deal(), [], 0);
      tl.fromTo(q(".tvsf-card"), { rotateX: -80, y: 60, opacity: 0 }, { rotateX: 0, y: 0, opacity: 1, duration: 0.8, ease: "back.out(1.5)" }, 0.2);
      if (sound) tl.call(() => sfx.showtime(0.6), [], 0.5);
      tl.fromTo(q(".tvsf-sub"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 }, 0.9);
    },
    root,
    // (a round dealt again after someone left keeps its number: the new word still flips in)
    [t.roundNumber, t.term?.zh],
  );
  return (
    <div className="tvsf-peek" ref={root}>
      <WordCard t={t} lead={zh ? "这一轮的词" : "This round's word"} />
      <p className="tvsf-sub">
        <EyeOff size={40} strokeWidth={2.4} />
        {zh ? "每个人在偷偷看自己的身份：只有一个老实人知道它的意思" : "Everyone is reading their part in secret: only one honest one knows what it means"}
        <span className="tvsf-count tabular">
          <b key={t.peekedCount}>{t.peekedCount}</b>/{t.peekTotal}
          <small>{zh ? " 看好了" : " ready"}</small>
        </span>
      </p>
      <TvLineup people={people.map((s) => judgeTagged(s, t.judgeId, zh))} big={200} />
    </div>
  );
}

/** The judge wears the gavel on every screen; nobody else's part shows. */
function judgeTagged(seat: SeatView, judge: string | null, zh: boolean, extra?: Partial<Person>): Person {
  return seat.id === judge ? { seat, state: "spot", tag: <span className="tvsf-judge-tag">{zh ? "裁判" : "Judge"}</span>, ...extra } : { seat, ...extra };
}

/* ------------------------------------------------------------------ explaining */

function Explain({ t, sound }: { t: PublicView; sound: boolean }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const order = t.speakOrder;
  const lineup = useGame(order);
  const speaker = t.speakerId;
  const idx = speaker ? order.indexOf(speaker) : -1;
  const who = seat(speaker);
  const judge = seat(t.judgeId);
  const spot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (idx < 0) return;
    if (sound) sfx.woodblock(1.1, 0.7);
    if (reduced() || !spot.current) return;
    const tw = gsap.fromTo(spot.current, { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)" });
    return () => {
      tw.progress(1);
      tw.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaker, t.roundNumber]);
  if (idx < 0) {
    // the order, shuffled by the game: the judge starts it
    return (
      <div className="tvsf-order-up">
        <WordCard t={t} small />
        <p className="tvsf-sub">
          <Mic size={40} strokeWidth={2.4} />
          {zh ? "发言顺序（随机排的）：裁判一开始，大家轮流一本正经地解释" : "Speaking order (shuffled): when the judge starts, everyone explains it in turn, with a straight face"}
        </p>
        <TvLineup people={lineup.map((s, i) => ({ seat: s, tag: <b className="tvsf-nth tabular">{i + 1}</b> }))} big={190} />
      </div>
    );
  }
  return (
    <div className="tvsf-talk">
      <WordCard t={t} small />
      <div className="tvsf-spot" ref={spot} key={speaker ?? ""}>
        {who && (
          <>
            <span className="tvsf-spot-fig">
              <Figure seat={who} />
            </span>
            <p className="tvsf-spot-name">
              <Mic size={44} strokeWidth={2.2} />
              {who.name}
            </p>
            <p className="tvsf-spot-what">{zh ? `正在解释 · 第 ${idx + 1}/${order.length} 个` : `is explaining · ${idx + 1} of ${order.length}`}</p>
          </>
        )}
      </div>
      <aside className="tvsf-queue">
        <h2>{zh ? "发言顺序" : "Speaking order"}</h2>
        <ol>
          {order.map((id, i) => {
            const s = seat(id);
            const state = i < idx ? "done" : i === idx ? "now" : "next";
            return (
              <li key={id} className={`is-${state}`}>
                {s && <FacesIn seats={[s]} size={46} />}
                <span className="tvsf-queue-name">{s?.name ?? "?"}</span>
                <span className="tvsf-queue-state">{state === "done" ? (zh ? "说完了" : "done") : state === "now" ? (zh ? "正在说" : "speaking") : zh ? "等着说" : "up next"}</span>
              </li>
            );
          })}
        </ol>
        {judge && (
          <p className="tvsf-queue-judge">
            <img src={ROLE_ART.judge} alt="" width={64} height={64} />
            <span>{zh ? `裁判 ${judge.name} 在听，随时追问` : `${judge.name} judges: listening, asking`}</span>
          </p>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ the bets */

function Bets({ v, t, sound }: { v: StraightFaceView; t: PublicView; sound: boolean }) {
  const { zh } = useLang();
  const people = useGame(v.players);
  useArrivals(counted(t.betsPlaced), sound);
  return (
    <div className="tvsf-peek">
      <WordCard t={t} small />
      <p className="tvsf-sub">
        <Vote size={40} strokeWidth={2.4} />
        {zh ? "在手机上押：谁是老实人？押中 +1" : "Bet on your phone: who is the honest one? A right bet: +1"}
        <span className="tvsf-count tabular">
          <b key={t.betsPlaced}>{t.betsPlaced}</b>/{t.betsExpected}
          <small>{zh ? " 押了" : " in"}</small>
        </span>
      </p>
      <TvLineup people={people.map((s) => judgeTagged(s, t.judgeId, zh))} big={200} />
    </div>
  );
}

/* ------------------------------------------------------------------ the judge decides */

function Accuse({ t }: { t: PublicView }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const judge = seat(t.judgeId);
  const speakers = useGame(t.speakOrder);
  return (
    <div className="tvsf-accuse">
      <WordCard t={t} small />
      <div className="tvsf-judge">
        <img src={ROLE_ART.judge} alt="" width={150} height={150} className="tvsf-judge-art" />
        <p className="tvsf-judge-line">
          <Gavel size={44} strokeWidth={2.2} />
          {zh ? `裁判 ${judge?.name ?? ""} 在想：谁是老实人？` : `${judge?.name ?? "The judge"} is deciding: who is the honest one?`}
        </p>
      </div>
      <TvLineup people={speakers.map((s) => ({ seat: s }))} big={180} />
    </div>
  );
}

/* ------------------------------------------------------------------ the reveal */

function Reveal({ v, t, sound }: { v: StraightFaceView; t: PublicView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { seat, name } = useSeats();
  const root = useRef<HTMLDivElement>(null);
  const burst = useConfetti();
  const rv = t.reveal;
  const f = v.facts;
  const right = !!f && f.accusedId === f.honestId;
  const honest = seat(rv?.honestId);
  const said = f ? roundLines(f, name) : { preLines: [], lines: [] };
  const deltas = Object.entries(rv?.result.deltas ?? {}).filter(([, d]) => d !== 0);
  // the same beats as the phones: the meaning, the fun fact, who did what, then the honest one
  useBeat(
    (tl, q) => {
      tl.fromTo(q(".tvsf-card"), { rotateY: -90, opacity: 0 }, { rotateY: 0, opacity: 1, duration: 0.7, ease: "back.out(1.4)" }, 0);
      tl.fromTo(q(".tvsf-fact"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45 }, 0.9);
      tl.fromTo(q(".tvsf-pre li"), { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.12 }, 1.8);
      if (sound) tl.call(() => sfx.drumroll(1.0), [], 1.8);
      tl.fromTo(q(".tvsf-honest-fig"), { opacity: 0, y: 70, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.6)" }, 2.7);
      stampIn(tl, q(".tvsf-honest .tvx-stamp"), 3.0);
      tl.fromTo(q(".tvsf-verdict-art"), { scale: 0.4, opacity: 0, rotate: right ? -12 : 12 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.5, ease: "back.out(1.6)" }, 3.0);
      if (!right) tl.fromTo(q(".tvsf-verdict-art"), { x: -14 }, { x: 0, duration: 0.7, ease: "elastic.out(1.4, 0.2)" }, 3.5);
      if (sound) tl.call(() => cue.verdict(right), [], 3.0);
      if (right) tl.call(() => burst({ x: 0.22, y: 0.6, count: 180, spread: 90, power: 22 }), [], 3.1);
      tl.fromTo(q(".tvsf-points li, .tvsf-deltas > span"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.08 }, 3.6);
      if (sound) tl.call(() => cue.points(), [], 3.6);
    },
    root,
    [t.roundNumber],
  );
  if (!rv || !f) return null;
  const master = v.master ? seat(v.master) : undefined;
  const picked = v.picked ? seat(v.picked) : undefined;
  return (
    <div className="tvsf-reveal" ref={root}>
      <div className="tvsf-reveal-main">
        <WordCard t={t} lead={zh ? "真释义" : "The real meaning"}>
          <p className={`tvsf-def ${tr(rv.definition).length > 100 ? "is-wordy" : ""}`}>{tr(rv.definition)}</p>
        </WordCard>
        <p className={`tvsf-fact ${tr(rv.funFact).length > 110 ? "is-wordy" : ""}`}>
          <b>{zh ? "冷知识" : "Fun fact"}</b>
          {tr(rv.funFact)}
        </p>
      </div>
      <div className="tvsf-verdict">
        <div className="tvsf-honest">
          <div className="tvsf-honest-row">
            {honest && (
              <span className="tvsf-honest-fig">
                <Figure seat={honest} />
              </span>
            )}
            <img className="tvsf-verdict-art" src={VERDICT_ART[right ? "right" : "fooled"]} alt="" width={170} height={170} />
          </div>
          <span className="tvsf-honest-stamp">
            <Stamp tone={right ? "go" : "stop"} held>
              {zh ? `老实人：${honest?.name ?? ""}` : `Honest: ${honest?.name ?? ""}`}
            </Stamp>
          </span>
        </div>
        <div className="tvsf-said">
          <ul className="tvsf-pre">
            {said.preLines.map((l, i) => (
              <li key={i}>{tr(l)}</li>
            ))}
          </ul>
          <ul className="tvsf-points">
            {said.lines.map((l, i) => (
              <li key={i}>{tr(l)}</li>
            ))}
          </ul>
          {deltas.length > 0 && (
            <p className="tvsf-deltas">
              {deltas.map(([id, d]) => (
                <span key={id} className={d > 0 ? "is-up" : "is-down"}>
                  <SeatFace seat={seat(id)} size={36} />
                  {name(id)} <b className="tabular">{d > 0 ? `+${d}` : d}</b>
                </span>
              ))}
            </p>
          )}
          {master && (
            <p className="tvsf-master">
              <img src={VERDICT_ART.master} alt="" width={56} height={56} />
              {zh ? `大忽悠 ${master.name} 在手机上指定一个人` : `${master.name}, the master bluffer, is picking someone`}
            </p>
          )}
          {picked && f && <p className="tvsf-master">{zh ? `${name(f.accusedId)} 指定了 ${picked.name}` : `${name(f.accusedId)} picked ${picked.name}`}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ between rounds, and the end */

function rows(v: StraightFaceView, t: PublicView, seat: (id: string) => SeatView | undefined, zh: boolean) {
  return v.players
    .map((id) => ({ id, s: seat(id), score: t.scores[id] ?? 0, fooled: v.fooled[id] ?? 0 }))
    .filter((r): r is { id: string; s: SeatView; score: number; fooled: number } => !!r.s)
    .sort((a, b) => b.score - a.score || b.fooled - a.fooled)
    .map((r) => ({ seat: r.s, score: r.score, note: r.fooled ? (zh ? `骗到裁判 ${r.fooled} 次` : `fooled the judge ${r.fooled}×`) : undefined }));
}

function Between({ v, t }: { v: StraightFaceView; t: PublicView }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const next = seat(v.nextJudge);
  return (
    <div className="tvsf-between">
      <TvBoard rows={rows(v, t, seat, zh)} unit={zh ? "分" : "pts"} title={zh ? "比分" : "Scores"} max={9} />
      {next && (
        <div className="tvsf-next">
          <span className="tvsf-next-fig">
            <Figure seat={next} />
          </span>
          <p className="tvsf-next-line">
            <img src={ROLE_ART.judge} alt="" width={72} height={72} />
            <span>{zh ? `下一轮裁判：${next.name}` : `Next judge: ${next.name}`}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function Finished({ v, t, sound }: { v: StraightFaceView; t: PublicView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { seat } = useSeats();
  const learned = (v.learned ?? []).slice(-6);
  return (
    <div className="tvsf-end">
      <TvPodium rows={rows(v, t, seat, zh)} unit={zh ? "分" : "pts"} sound={sound} className="tvsf-podium" burstX={0.36} />
      {learned.length > 0 && (
        <aside className="tvsf-learned">
          <h2>{zh ? `今晚学到的 ${v.learned!.length} 个词` : `${v.learned!.length} words you learned tonight`}</h2>
          <ul>
            {learned.map((l, i) => (
              <li key={i}>
                <b>{wordOf(l.term, zh).main}</b>
                <span>{tr(l.definition)}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
