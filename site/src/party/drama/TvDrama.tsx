import { Clapperboard, Eye, Feather, Film, Mic, Sparkles, Star } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Figure } from "../../components/Figure";
import { GROUPS, KINDS } from "../../data/drama";
import { CSET_NAME } from "../../data/dramaClassics";
import { READ_PASS, readKind, RSET_NAME } from "../../data/dramaReadings";
import { GENERIC_BEATS, sceneGuide } from "../../data/dramaGuide";
import { gsap, reduced } from "../../lib/anim";
import { sfx } from "../../lib/sfx";
import { SeatFace } from "../../online/People";
import { useCue, useRoom } from "../../online/RoomContext";
import { BRIEF_MS } from "../../shared/engine/games/drama";
import type { DramaView } from "../../shared/protocol";
import { usePenaltyText } from "../../store";
import { Bi, FacesIn, RoundTag, TvClock, TvPodium, TvShow, useArrivals, useConfetti, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { Backdrop, Cast, Curtain, MaskArt, MiniMask, readBar, readHeadline, stageOf, TrophyArt, TwistBanner, type Actor } from "./parts";
import { useDramaMusic } from "./score";
import { dramaSfx } from "./sound";
import "../../styles/drama.css";
import "../../styles/tv-drama.css";

const VOTE_MS = 50_000;
/** the confetti when the culprit is caught: champagne, cream, rose, moon */
const CHAMPAGNE = ["#ffcf6b", "#fff1c9", "#ff9cc5", "#f5f4fd"];

/**
 * 戏精大赏 on the big screen: the theatre. The playbill and who plays whom while the actors read
 * their cards; the curtain opens on the set with the cast on stage, the slate, the clock, the plot
 * twist slamming in; the curtain closes for the vote (who has voted shows, never for whom); the
 * spotlight and the mask come down on the culprit, every card turns over, the best actor takes
 * the trophy; the curtain call on the podium. Nobody's card is on this screen before the reveal.
 */
export default function TvDrama({ v, sound }: TvViewProps<DramaView>) {
  const { zh } = useLang();
  const { seat, name } = useSeats();
  const { now } = useRoom();
  // everyone on stage stands: their drawn figure, or their face on a little body
  const actors: Actor[] = v.cast.map((c) => {
    const s = seat(c.pid);
    return { pid: c.pid, role: c.role, name: name(c.pid), face: (size: number) => <SeatFace seat={s} size={size} />, body: s ? <Figure seat={s} /> : <SeatFace seat={s} size={120} /> };
  });

  // the house bells, then the game's theme off stage and the scene's own music on it, on the
  // same beat as any phone that plays it too
  useCue(v.phase === "brief", () => {
    if (!sound) return;
    dramaSfx.chimes();
    dramaSfx.deal();
  });
  useDramaMusic(v, sound, now);
  useCue(v.phase === "vote", () => {
    if (sound) sfx.applause(1.8, 0.7);
  });

  const clock =
    v.phase === "brief" ? (
      <TvClock key={`b${v.round}`} endsAt={v.endsAt} total={BRIEF_MS} sound={sound} />
    ) : v.phase === "act" ? (
      <TvClock key={`a${v.round}`} endsAt={v.endsAt} total={v.actMs} sound={sound} />
    ) : v.phase === "vote" ? (
      <TvClock key={`v${v.round}`} endsAt={v.endsAt} total={VOTE_MS} sound={sound} />
    ) : null;
  const tag =
    v.phase === "setup" ? null : v.phase === "end" ? (
      <RoundTag>{zh ? "谢幕" : "Curtain call"}</RoundTag>
    ) : (
      <RoundTag>
        {zh ? `第 ${v.round} 幕` : `Act ${v.round}`}
        <small>{zh ? ` / 共 ${v.total} 幕` : ` of ${v.total}`}</small>
      </RoundTag>
    );

  const staged = v.phase === "brief" || v.phase === "act" || v.phase === "vote" || v.phase === "reveal";
  return (
    <TvShow game="drama" className={`tvd is-${v.phase}`} phase={v.phase} round={tag} clock={clock}>
      {v.phase === "setup" && <Setup v={v} />}
      {staged && <Theatre v={v} actors={actors} sound={sound} />}
      {v.phase === "brief" && <Brief v={v} sound={sound} />}
      {v.phase === "act" && (v.pk ? <Caption v={v} /> : v.read ? <ReadingNow v={v} /> : <Script v={v} />)}
      {v.phase === "vote" && <Vote v={v} sound={sound} />}
      {v.phase === "reveal" && v.result && <Truths v={v} actors={actors} />}
      {v.phase === "end" && <Finale v={v} sound={sound} />}
    </TvShow>
  );
}

/** Who wrote the scene on now: someone at the table, or a name from the public library. */
function useCredit(v: DramaView) {
  const { name } = useSeats();
  return v.credit ? (v.credit.pid ? name(v.credit.pid) : v.credit.name) : null;
}

/* ------------------------------------------------------------------ the theatre */

/**
 * One theatre for the whole act, so the curtain is seen to open and close: narrow beside the
 * playbill, the full width while the scene plays. At the reveal the light picks out the culprit.
 */
function Theatre({ v, actors, sound }: { v: DramaView; actors: Actor[]; sound: boolean }) {
  const r = v.result;
  const reveal = v.phase === "reveal" && !!r;
  const step = useSteps(reveal ? [1.6, 2.9, 3.9] : [], reveal ? `${v.round}-${v.scene?.id ?? v.classic?.id ?? v.read?.id ?? v.pk?.line.zh}` : "");
  const burst = useConfetti();
  const show = v.mode === "show";
  // the reveal's beats, sounded here when this screen plays the show
  useEffect(() => {
    if (!reveal || !r || step === 0) return;
    if (step === 1 && sound) {
      dramaSfx.spotlight();
      if (show) dramaSfx.culprit(r.caught);
      else sfx.versus();
    }
    if (step === 2 && sound) sfx.flip();
    if (step === 3 && r.best.length) {
      if (sound) {
        sfx.crown();
        sfx.applause(2.4, 0.9);
      }
      burst({ x: 0.32, y: 0.4, count: 200, colors: CHAMPAGNE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const open = v.phase === "act" || reveal;
  return (
    <div className={`tvd-theatre is-${v.phase}`}>
      <Backdrop {...stageOf(v)} live={v.phase === "act" || reveal}>
        {reveal && <div className={`dm-spot-culprit ${step >= 1 && show ? "is-on" : ""}`} aria-hidden="true" />}
        <Cast actors={actors} culprit={reveal && step >= 1 && show ? r!.culprit : null} best={reveal && step >= 3 ? r!.best : []} />
        <Curtain open={open} sound={sound} />
        {v.phase === "act" && <Slate key={v.round} sound={sound} />}
        {v.phase === "act" && <TwistBanner twist={v.twist} sound={sound} />}
      </Backdrop>
      {reveal && r && <Verdict v={v} actors={actors} step={step} />}
    </div>
  );
}

/** Steps of a moment, on this screen's clock from when it arrived (timers, so a busy screen keeps time). */
function useSteps(marks: number[], key: string) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!marks.length) return setStep(0);
    if (reduced()) return setStep(marks.length);
    setStep(0);
    const timers = marks.map((m, i) => window.setTimeout(() => setStep(i + 1), m * 1000));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return step;
}

/** The slate that opens every scene: clap, "Action!". */
function Slate({ sound }: { sound: boolean }) {
  const { zh } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  useLayoutEffect(() => {
    if (sound) {
      dramaSfx.clapper();
      window.setTimeout(() => sfx.showtime(0.8), 260);
    }
    const el = ref.current;
    if (!el || reduced()) {
      const id = window.setTimeout(() => setGone(true), 900);
      return () => window.clearTimeout(id);
    }
    const tl = gsap.timeline({ onComplete: () => setGone(true) });
    tl.fromTo(el, { scale: 0.5, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: -3, duration: 0.4, ease: "back.out(2)" })
      .fromTo(el.querySelector(".tvd-slate-top"), { rotate: -28 }, { rotate: 0, duration: 0.18, ease: "power4.in" }, 0.12)
      .to(el, { scale: 1.25, opacity: 0, duration: 0.45, ease: "power2.in" }, 1.3);
    return () => {
      tl.kill();
    };
    // once per scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (gone) return null;
  return (
    <div className="tvd-slate" ref={ref} aria-hidden="true">
      <span className="tvd-slate-top">
        <Clapperboard size={40} strokeWidth={2.2} />
      </span>
      <strong>{zh ? "开拍！" : "Action!"}</strong>
    </div>
  );
}

/* ------------------------------------------------------------------ before the show */

function Setup({ v }: { v: DramaView }) {
  const { zh } = useLang();
  const pen = usePenaltyText();
  return (
    <>
      <div className="tvd-theatre is-setup">
        <Backdrop tall live>
          <div className="dm-marquee tvd-marquee">
            <span className="dm-marquee-masks" aria-hidden="true">
              <MaskArt culprit={false} />
              <MaskArt culprit />
            </span>
            <strong>{zh ? "戏精大赏" : "Drama Queens"}</strong>
            <small>{zh ? "演一出狗血剧，揪出藏在台上的坏人" : "Act a soap opera. Unmask the culprit."}</small>
          </div>
          <Curtain open={false} sound={false} />
        </Backdrop>
      </div>
      <aside className="tvd-side tvd-bill">
        <p className="tvd-act">{zh ? "今晚上演" : "Tonight"}</p>
        <ul className="tvd-chips">
          <li className="is-main">
            {v.mode === "pk" ? (zh ? "演技 PK" : "Acting duel") : v.mode === "classic" ? (zh ? "名场面" : "Famous scenes") : v.mode === "read" ? (zh ? "朗读" : "Read aloud") : zh ? "演戏猜坏人" : "Find the culprit"}
          </li>
          {v.mode === "classic" && <li>{zh ? CSET_NAME[v.cset ?? "zh"].zh : CSET_NAME[v.cset ?? "zh"].en}</li>}
          {v.mode === "read" && <li>{zh ? RSET_NAME[v.rset ?? "zh"].zh : RSET_NAME[v.rset ?? "zh"].en}</li>}
          {v.mode === "read" && (v.rkinds ?? []).length > 0 && (
            <li>
              {(v.rkinds ?? [])
                .map((k) => readKind(k))
                .filter((k): k is NonNullable<typeof k> => !!k)
                .map((k) => (zh ? k.name.zh : k.name.en))
                .join(zh ? "、" : ", ")}
            </li>
          )}
          <li>{v.level === "spicy" ? (zh ? "微辣" : "Spicy") : zh ? "全年龄" : "All ages"}</li>
          {v.mode !== "classic" && v.mode !== "read" && <li>{v.diff === "hard" ? (zh ? "困难" : "Hard") : zh ? "简单" : "Easy"}</li>}
          {v.mode === "show" && (v.groups ?? []).length > 0 && <li>{GROUPS.filter((x) => v.groups!.includes(x.key)).map((x) => (zh ? x.name.zh : x.name.en)).join(zh ? "、" : ", ")}</li>}
          <li>{zh ? `${v.total} 幕` : `${v.total} acts`}</li>
          <li>{v.pen === "drink" ? (pen.isCustom ? pen.text : zh ? "输了喝" : "Losers drink") : v.pen === "move" ? (zh ? "输了运动" : "Losers exercise") : zh ? "输了整蛊" : "Losers do a forfeit"}</li>
        </ul>
        <p className="tvd-note">
          {v.mode === "pk"
            ? zh
              ? "两个人用不同的状态说同一句台词，观众打星，分低的受罚。"
              : "Two players say the same line in two states. The audience gives stars; the lower score pays."
            : v.mode === "classic"
              ? zh
                ? "照着有名的电影、电视剧片段演，观众打星，分低的受罚。"
                : "Act out famous moments from film and TV. The audience gives stars; the lowest score pays."
            : v.mode === "read"
              ? zh
                ? "一个人上台朗读一段，照指定的读法读：哭着读、憋着笑读、用大臣腔读……观众打星，不到 3 星的受罚。"
                : "One person reads a piece aloud, the way it asks: in tears, with a straight face, as a royal courtier... The audience gives stars; under three pays."
            : zh
              ? "几个人上台演一段狗血剧，其中一个偷偷是坏人。观众猜是谁，再给演技打星。"
              : "A few players act a soap opera; one of them is secretly the culprit. The audience guesses who, then stars the acting."}
        </p>
        <p className="tvd-wait">{zh ? "等主人开演" : "Waiting for the host to raise the curtain"}</p>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ reading the cards */

function Brief({ v, sound }: { v: DramaView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { seat } = useSeats();
  const credit = useCredit(v);
  useArrivals(v.ready, sound);
  // a company of five or more: who's read their card, as faces (the stage names who plays whom)
  if (v.cast.length > 4) {
    return (
      <aside className="tvd-side tvd-bill">
        <Bill v={v} credit={credit} />
        <p className="tvd-count tabular">
          <b>{v.ready.length}</b>/{v.cast.length}
          <small>{zh ? " 看好了牌" : " have read their cards"}</small>
        </p>
        <FacesIn seats={v.ready.map((pid) => seat(pid))} size={58} />
      </aside>
    );
  }
  return (
    <aside className="tvd-side tvd-bill">
      <Bill v={v} credit={credit} />
      <ul className="tvd-roster">
        {v.cast.map((c) => {
          const ready = v.ready.includes(c.pid);
          return (
            <li key={c.pid} className={ready ? "is-ready" : ""}>
              <SeatFace seat={seat(c.pid)} size={46} />
              <span className="tvd-roster-main">
                <strong>{tr(c.role)}</strong>
                <small>{seat(c.pid)?.name ?? "?"}</small>
              </span>
              <span className="tvd-roster-state">
                {ready ? (zh ? (v.mode === "read" ? "准备好了" : "看好了") : "Ready") : v.mode === "read" ? (zh ? "在默读" : "Reading it over") : zh ? "在看牌" : "Reading"}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** The scene's title, who wrote it, its set-up and what the audience is hunting for. */
function Bill({ v, credit }: { v: DramaView; credit: string | null }) {
  const { zh, tr } = useLang();
  const kind = KINDS.find((k) => k.key === v.scene?.kind);
  const group = GROUPS.find((x) => x.key === v.scene?.group);
  return (
    <>
      <p className="tvd-act">
        {v.mode === "pk"
          ? zh
            ? "演技 PK"
            : "Acting duel"
          : v.mode === "classic"
            ? zh
              ? "名场面"
              : "Famous scene"
            : v.read
              ? `${zh ? "朗读" : "Read aloud"} · ${tr(readKind(v.read.kind)?.name ?? { zh: "", en: "" })}`
              : kind
                ? tr(kind.name)
                : zh
                  ? "本幕"
                  : "This act"}
        {group && ` · ${tr(group.name)}`}
      </p>
      {v.read && (
        <>
          <h1 className="tvd-title">
            <Bi t={v.read.title} />
          </h1>
          <p className="tvd-setup">{tr(readKind(v.read.kind)?.how ?? v.read.how)}</p>
          <p className="tvd-hunt">
            <Mic size={26} strokeWidth={2.4} aria-hidden="true" />
            {tr(v.read.how)}
          </p>
        </>
      )}
      {v.scene && (
        <>
          <h1 className="tvd-title">
            <Bi t={v.scene.title} />
          </h1>
          {credit && (
            <p className="tvd-credit">
              <Feather size={24} strokeWidth={2.4} />
              {zh ? `编剧：${credit}` : `Written by ${credit}`}
            </p>
          )}
          <p className="tvd-setup">{tr(v.scene.setup)}</p>
          <p className="tvd-hunt">
            <MiniMask />
            {v.options ? (zh ? "台上的人藏着一个秘密，是下面哪一个？" : "The actor is hiding one of these. Which?") : zh ? `台上有一个人是「${v.scene.culprit.zh}」` : `One of them is secretly ${v.scene.culprit.en.replace(/^The /, "the ")}`}
          </p>
          {v.options && <SecretList v={v} />}
        </>
      )}
      {v.pk && (
        <>
          <h1 className="tvd-title">
            <Bi t={{ zh: `「${v.pk.line.zh}」`, en: `"${v.pk.line.en}"` }} />
          </h1>
          <p className="tvd-setup">{zh ? "同一句台词，两种演法。观众打星，分低的受罚。" : "Same line, two ways. The audience gives stars; the lower score pays."}</p>
        </>
      )}
      {v.classic && (
        <>
          <h1 className="tvd-title">
            <Bi t={v.classic.title} />
          </h1>
          <p className="tvd-credit">
            <Film size={24} strokeWidth={2.4} />
            <span>{`${tr(v.classic.show)} · ${v.classic.year}`}</span>
          </p>
          <p className="tvd-setup">{tr(v.classic.setup)}</p>
        </>
      )}
    </>
  );
}

/** A monologue's three secrets; at the reveal, the votes for each and the real one marked. */
function SecretList({ v, counts, answer }: { v: DramaView; counts?: Record<string, number>; answer?: number | null }) {
  const { zh, tr } = useLang();
  return (
    <ol className="dm-secret-results tvd-secrets">
      {(v.options ?? []).map((o, i) => (
        <li key={i} className={answer === i ? "is-true" : ""}>
          <span className="dm-secret-mark" aria-hidden="true">
            {String.fromCharCode(65 + i)}
          </span>
          <span>
            {tr(o)}
            {answer === i && <strong>{zh ? "（真的）" : " (the real one)"}</strong>}
          </span>
          {counts && <small className="tabular">{zh ? `${counts[String(i)] ?? 0} 票` : `${counts[String(i)] ?? 0} ${counts[String(i)] === 1 ? "vote" : "votes"}`}</small>}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ the scene */

/**
 * While a scene plays: its name, and the step of the story it should be at by now (the guide's steps
 * spread over the scene, the third from the twist), so actors who've never acted know what comes
 * next and the room follows along.
 */
function Script({ v }: { v: DramaView }) {
  const { tr, zh } = useLang();
  const { now } = useRoom();
  const credit = useCredit(v);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const title = v.scene?.title ?? v.classic?.title;
  const beats = v.classic ? v.classic.beats : v.scene ? (sceneGuide(v.scene.id)?.beats ?? GENERIC_BEATS) : [];
  if (!title || !beats.length) return null;
  const step = stepAt((now() - (v.endsAt - v.actMs)) / Math.max(1, v.actMs), beats.length, !!v.scene);
  const hunt = v.scene && !v.options ? (zh ? `台上有一个人是「${v.scene.culprit.zh}」` : `One of them is ${v.scene.culprit.en.replace(/^The /, "the ")}`) : null;
  return (
    <div className="tvd-script">
      <p className="tvd-script-head">
        <span>{tr(title)}</span>
        {hunt && (
          <small>
            <MiniMask />
            {hunt}
          </small>
        )}
        {credit && <small>{zh ? `编剧：${credit}` : `by ${credit}`}</small>}
      </p>
      <ol className="tvd-script-steps" aria-hidden="true">
        {beats.map((_, i) => (
          <li key={i} className={i === step ? "is-on" : i < step ? "is-done" : ""}>
            {i + 1}
          </li>
        ))}
      </ol>
      <p className="tvd-script-beat" key={step}>
        {tr(beats[step])}
      </p>
    </div>
  );
}

/**
 * Which step the story should be at, `f` of the way through the scene: a scene's four steps put the
 * third at the twist (half time); otherwise the steps share the time equally.
 */
function stepAt(f: number, n: number, twist: boolean): number {
  const x = Math.min(1, Math.max(0, f));
  if (twist && n === 4) return x < 0.2 ? 0 : x < 0.5 ? 1 : x < 0.85 ? 2 : 3;
  return Math.min(n - 1, Math.floor(x * n));
}

/**
 * While a piece is read: who's reading, what, and how it's meant to be read, so the room knows what
 * the stars are for. (The words are on the phones; this screen leaves the reader the voice.)
 */
function ReadingNow({ v }: { v: DramaView }) {
  const { tr, zh } = useLang();
  const { name } = useSeats();
  if (!v.read) return null;
  const kind = readKind(v.read.kind);
  const reader = v.cast[0]?.pid;
  return (
    <div className="tvd-script is-read">
      <p className="tvd-script-head">
        <span>{tr(v.read.title)}</span>
        {kind && (
          <small>
            <Mic size={24} strokeWidth={2.4} aria-hidden="true" />
            {tr(kind.name)}
          </small>
        )}
        {reader && <small>{zh ? `朗读：${name(reader)}` : `Read by ${name(reader)}`}</small>}
      </p>
      <p className="tvd-script-beat">{tr(v.read.how)}</p>
    </div>
  );
}

/** While a duel plays, its line rides at the top. */
function Caption({ v }: { v: DramaView }) {
  const { tr, zh } = useLang();
  const credit = useCredit(v);
  return (
    <p className="tvd-caption">
      <span>{v.scene ? tr(v.scene.title) : v.classic ? tr(v.classic.title) : v.pk ? (zh ? `「${v.pk.line.zh}」` : `"${v.pk.line.en}"`) : ""}</span>
      {credit && <small>{zh ? `编剧：${credit}` : `by ${credit}`}</small>}
    </p>
  );
}

/* ------------------------------------------------------------------ the vote */

function Vote({ v, sound }: { v: DramaView; sound: boolean }) {
  const { zh, tr } = useLang();
  const { seat, players } = useSeats();
  useArrivals(v.voted, sound);
  // the audience votes; with nobody watching, the actors vote on each other
  const audience = v.peer ? players.filter((s) => v.cast.some((c) => c.pid === s.id)) : players.filter((s) => !v.cast.some((c) => c.pid === s.id));
  const voted = audience.filter((s) => v.voted.includes(s.id));
  return (
    <aside className="tvd-side tvd-ballot">
      <h1 className="tvd-ask">
        <Bi t={v.peer ? { zh: "演员互投", en: "The actors vote" } : { zh: "观众投票", en: "The audience votes" }} />
      </h1>
      {v.mode === "show" && v.scene && (
        <p className="tvd-q">
          <MiniMask />
          {tr(v.scene.ask)}
        </p>
      )}
      {v.mode === "show" && v.options && <SecretList v={v} />}
      <p className="tvd-q">
        <Star size={30} strokeWidth={2.4} />
        {v.mode === "show"
          ? zh
            ? "再给每个演员的演技打星"
            : "Then stars for every actor"
          : v.mode === "classic"
            ? zh
              ? "给每个演员打星：谁最像原片？"
              : "Stars for every actor: who got closest to the original?"
            : v.mode === "read" && v.read
              ? tr(readKind(v.read.kind)?.ask ?? { zh: "读得怎么样？", en: "How was that?" })
              : zh
                ? "给两个人打星"
                : "Stars for both of them"}
      </p>
      <p className="tvd-count tabular">
        <b>{voted.length}</b>/{audience.length}
        <small>{zh ? " 交了" : " voted"}</small>
      </p>
      <FacesIn seats={v.voted.map((pid) => seat(pid))} size={58} />
      {v.twist && (
        <p className="tvd-twist-note">
          <span>{zh ? "剧情反转" : "Plot twist"}</span>
          {tr(v.twist)}
        </p>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ the truth */

function Verdict({ v, actors, step }: { v: DramaView; actors: Actor[]; step: number }) {
  const { zh } = useLang();
  const r = v.result!;
  const culprit = actors.find((a) => a.pid === r.culprit);
  const readStars = v.mode === "read" ? (r.stars[v.cast[0]?.pid ?? ""] ?? 0) : 0;
  const headline =
    v.mode === "pk"
      ? zh
        ? "谁演得更像？"
        : "Who sold it?"
      : v.mode === "read"
        ? readHeadline(readStars, zh)
      : v.mode === "classic"
        ? zh
          ? "谁最像原版？"
          : "Who nailed it?"
        : r.caught
        ? v.options
          ? zh
            ? "秘密被猜中了！"
            : "Busted! The secret's out."
          : zh
            ? `「${v.scene?.culprit.zh}」就是 ${culprit?.name ?? "TA"}！`
            : `${culprit?.name ?? "They"} did it!`
        : r.right.length
          ? zh
            ? `${culprit?.name ?? "TA"} 骗过了大多数人！`
            : `${culprit?.name ?? "They"} fooled most of the room!`
          : zh
            ? `${culprit?.name ?? "TA"} 骗过了所有人！`
            : `${culprit?.name ?? "They"} fooled everyone!`;
  return (
    <div className="tvd-verdict" data-step={step}>
      {step === 0 ? (
        <p className="tvd-drum">{v.mode === "read" ? (zh ? "评委打分中……" : "The judges are scoring…") : zh ? "真相是……" : "And the truth is…"}</p>
      ) : (
        <h2 className={`tvd-headline ${r.caught || (v.mode === "read" && readStars >= READ_PASS) ? "is-caught" : ""}`}>{headline}</h2>
      )}
    </div>
  );
}

function Truths({ v, actors }: { v: DramaView; actors: Actor[] }) {
  const { zh, tr } = useLang();
  const r = v.result!;
  const step = useSteps([1.6, 2.9, 3.9], `${v.round}-${v.scene?.id ?? v.classic?.id ?? v.read?.id ?? v.pk?.line.zh}`);
  return (
    <aside className="tvd-side tvd-truths">
      {step >= 1 && v.mode === "show" && v.options && <SecretList v={v} counts={r.counts} answer={r.answer ?? null} />}
      {step >= 1 && v.mode === "show" && !v.options && (
        <p className="tvd-counts">
          {actors.map((a) => (
            <span key={a.pid}>
              {a.name}
              <b className="tabular">{r.counts[a.pid] ?? 0}</b>
            </span>
          ))}
          <small>{zh ? "票" : "votes"}</small>
        </p>
      )}
      {step >= 2 ? (
        <ul className={`tvd-cards n${actors.length}`}>
          {actors.map((a, i) => {
            const c = r.cards[a.pid];
            const st = r.stars[a.pid] ?? 0;
            return (
              <li key={a.pid} className={`${c?.culprit ? "is-culprit" : ""} ${step >= 3 && r.best.includes(a.pid) ? "is-best" : ""}`} style={{ ["--i" as string]: i }}>
                {a.face(54)}
                <span className="tvd-card-main">
                  <strong>
                    {tr(a.role)}
                    <small>{a.name}</small>
                  </strong>
                  {c && v.mode === "show" && (
                    <span className="tvd-card-secret">
                      {c.culprit && <MiniMask />}
                      {tr(c.secret)}
                    </span>
                  )}
                  {c && tr(c.task) && (
                    <span className="tvd-card-task">
                      <Eye size={20} strokeWidth={2.4} />
                      {tr(c.task)}
                    </span>
                  )}
                </span>
                <span className="tvd-card-stars tabular">
                  <Star size={24} strokeWidth={2.4} />
                  {step >= 3 ? st.toFixed(1) : "?"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tvd-wait">{v.mode === "show" ? (zh ? "每个人的牌马上翻开" : "Every card turns over in a moment") : zh ? "星星马上揭晓" : "The stars are coming up"}</p>
      )}
      {step >= 3 && <Outcome v={v} actors={actors} />}
    </aside>
  );
}

function Outcome({ v, actors }: { v: DramaView; actors: Actor[] }) {
  const { zh, tr } = useLang();
  const r = v.result!;
  const best = actors.filter((a) => r.best.includes(a.pid));
  const lines: ReactNode[] = [];
  if (best.length)
    lines.push(
      <p key="best" className="tvd-best">
        <Sparkles size={26} strokeWidth={2.4} />
        {zh ? `本幕${best.length > 1 ? "影帝影后" : "最佳演员"}：` : "Best actor: "}
        <strong>{best.map((a) => a.name).join(zh ? "、" : ", ")}</strong>
      </p>,
    );
  if (v.mode === "show")
    lines.push(
      <p key="right" className="tvd-note">
        {r.right.length ? (zh ? `猜对的 ${r.right.length} 人，每人 +1` : `${r.right.length} guessed right: +1 each`) : zh ? "没有人猜对" : "Nobody guessed right"}
        {!r.caught && (zh ? "；坏人逍遥法外 +3" : "; the culprit walks free: +3")}
      </p>,
    );
  const readStars = v.mode === "read" ? (r.stars[v.cast[0]?.pid ?? ""] ?? 0) : 0;
  if (readStars > 0)
    lines.push(
      <p key="bar" className="tvd-note">
        {readBar(readStars, zh)}
      </p>,
    );
  if (r.losers.length && r.penalty)
    lines.push(
      <p key="pen" className="tvd-penalty">
        {zh ? "受罚：" : "Penalty: "}
        <strong>{tr(r.penalty)}</strong>
      </p>,
    );
  return <div className="tvd-outcome">{lines}</div>;
}

/* ------------------------------------------------------------------ the curtain call */

function Finale({ v, sound }: { v: DramaView; sound: boolean }) {
  const { zh } = useLang();
  const { players, seat } = useSeats();
  const ids = [...new Set([...players.map((s) => s.id), ...Object.keys(v.scores)])];
  const rows = ids
    .map((id) => seat(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({
      seat: s,
      score: v.scores[s.id] ?? 0,
      note: v.awards[s.id] ? (
        <span className="tvd-awards">
          <span className="tvd-trophy-mini" aria-hidden="true">
            <TrophyArt />
          </span>
          {zh ? `最佳演员 ×${v.awards[s.id]}` : `Best actor ×${v.awards[s.id]}`}
        </span>
      ) : undefined,
    }));
  return (
    <div className="tvd-finale">
      <h1 className="tvd-finale-title">
        <Bi t={{ zh: "今晚的影帝影后", en: "Tonight's stars" }} />
      </h1>
      <TvPodium rows={rows} unit={zh ? "分" : "pts"} sound={sound} className="tvd-podium" />
    </div>
  );
}
