import { Clapperboard, Drama as DramaIcon, Eye, Feather, Sparkles, Star, VenetianMask } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { KINDS, type DramaKind } from "../../data/drama";
import type { T } from "../../i18n";
import { confetti } from "../../lib/confetti";
import { gsap, reduced } from "../../lib/anim";
import { haptic, sfx } from "../../lib/sfx";
import type { DramaCard, DramaView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { Both, Leaderboard } from "../common";
import { dramaSfx } from "./sound";
import "../../styles/party.css";
import "../../styles/drama.css";

/** The artwork lives in public/drama; until a picture loads, the stage paints itself. */
export const art = (name: string) => `/drama/${name}.webp`;

export type Face = (pid: string, size: number) => ReactNode;

export const isKind = (k: string | undefined): k is DramaKind => !!k && KINDS.some((x) => x.key === k);

/* ------------------------------------------------------------------ the stage */

/**
 * The set: the scene's backdrop (a family dining room, a palace hall...), slowly drifting while a
 * scene plays, with the cast standing along the front and the curtain in front of it all.
 */
export function Backdrop({ kind, pk, live, children, tall }: { kind?: string; pk?: boolean; live?: boolean; children?: ReactNode; tall?: boolean }) {
  const [ok, setOk] = useState(true);
  const src = art(pk ? "pk" : isKind(kind) ? `kind-${kind}` : "stage");
  useEffect(() => setOk(true), [src]);
  return (
    <div className={`dm-backdrop ${live ? "is-live" : ""} ${tall ? "is-tall" : ""}`} data-kind={pk ? "pk" : kind ?? "stage"}>
      {ok && <img className="dm-backdrop-img" src={src} alt="" draggable={false} onError={() => setOk(false)} />}
      <div className="dm-backdrop-light" aria-hidden="true" />
      <div className="dm-backdrop-shade" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * Red velvet that sweeps open when the scene starts and closes when it ends. Open, it hangs at
 * the sides, tied back with gold rope (the picture), framing the set.
 */
export function Curtain({ open, sound = true }: { open: boolean; sound?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [img, setImg] = useState(true);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const l = el.querySelector(".dm-curtain-l");
    const r = el.querySelector(".dm-curtain-r");
    const drapes = Array.from(el.querySelectorAll(".dm-drape"));
    const instant = first.current || reduced();
    first.current = false;
    gsap.killTweensOf([l, r, ...drapes]);
    if (open) {
      gsap.to(l, { xPercent: -100, scaleX: 0.5, duration: instant ? 0 : 1.25, ease: "power3.inOut" });
      gsap.to(r, { xPercent: 100, scaleX: 0.5, duration: instant ? 0 : 1.25, ease: "power3.inOut" });
      if (drapes.length) gsap.fromTo(drapes, { opacity: 0, scaleX: 1.6 }, { opacity: 1, scaleX: 1, duration: instant ? 0 : 0.8, delay: instant ? 0 : 0.55, ease: "power2.out" });
    } else {
      if (drapes.length) gsap.to(drapes, { opacity: 0, duration: instant ? 0 : 0.2 });
      gsap.to([l, r], { xPercent: 0, scaleX: 1, duration: instant ? 0 : 1.05, ease: "power2.inOut" });
    }
    if (!instant && sound) dramaSfx.curtain(open);
  }, [open, sound, img]);
  return (
    <div className="dm-curtain" ref={root} aria-hidden="true">
      {img && (
        <>
          <span className="dm-drape dm-drape-l">
            <img src={art("curtain")} alt="" draggable={false} onError={() => setImg(false)} />
          </span>
          <span className="dm-drape dm-drape-r">
            <img src={art("curtain")} alt="" draggable={false} />
          </span>
        </>
      )}
      <div className="dm-curtain-l" />
      <div className="dm-curtain-r" />
      <div className="dm-curtain-valance" />
    </div>
  );
}

/**
 * One actor on stage: standing (their drawn figure, or a face on a little body), with a brass
 * plaque for the role. `body` is the standing figure; `face` a round face at any size.
 */
export type Actor = { pid: string; role: T; name: string; face: (size: number) => ReactNode; body: ReactNode };
export function Cast({ actors, culprit, best }: { actors: Actor[]; culprit?: string | null; best?: string[] }) {
  const { lang } = useStore();
  return (
    <div className={`dm-cast n${actors.length}`}>
      {actors.map((a, i) => {
        const isCulprit = culprit === a.pid;
        const isBest = best?.includes(a.pid);
        return (
          <div key={a.pid} className={`dm-actor ${isCulprit ? "is-culprit" : ""} ${isBest ? "is-best" : ""}`} style={{ ["--i" as string]: i }}>
            <span className="dm-actor-spot" aria-hidden="true" />
            <span className="dm-actor-figure">
              {a.body}
              {isCulprit && (
                <span className="dm-actor-mask" aria-hidden="true">
                  <MaskArt culprit />
                </span>
              )}
              {isBest && (
                <span className="dm-actor-trophy" aria-hidden="true">
                  <TrophyArt />
                </span>
              )}
            </span>
            <span className="dm-plaque">
              <strong>{lang === "zh" ? a.role.zh : a.role.en}</strong>
              <small>{a.name}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The masks: red and black for the culprit, laughing gold for everyone innocent. */
export function MaskArt({ culprit, size }: { culprit: boolean; size?: number }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img src={art(culprit ? "mask-culprit" : "mask-innocent")} alt="" draggable={false} style={size ? { width: size, height: size } : undefined} onError={() => setOk(false)} />
  ) : culprit ? (
    <VenetianMask size={size ?? 34} strokeWidth={2.2} />
  ) : (
    <DramaIcon size={size ?? 34} strokeWidth={2.2} />
  );
}

/** A small mask next to a label. */
export function MiniMask({ culprit = true }: { culprit?: boolean }) {
  return (
    <span className="dm-minimask" aria-hidden="true">
      <MaskArt culprit={culprit} size={20} />
    </span>
  );
}

export function TrophyArt() {
  const [ok, setOk] = useState(true);
  return ok ? <img src={art("trophy")} alt="" draggable={false} onError={() => setOk(false)} /> : <Sparkles size={30} strokeWidth={2.2} />;
}

/* ------------------------------------------------------------------ the playbill */

export function Tags({ v }: { v: Pick<DramaView, "mode" | "level" | "diff" | "scene"> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const kind = KINDS.find((k) => k.key === v.scene?.kind);
  return (
    <div className="dm-tags">
      {v.mode === "pk" ? <span className="dm-tag">{zh ? "演技 PK" : "Acting duel"}</span> : kind && <span className="dm-tag">{zh ? kind.name.zh : kind.name.en}</span>}
      <span className="dm-tag">{v.level === "spicy" ? (zh ? "微辣" : "Spicy") : zh ? "全年龄" : "All ages"}</span>
      <span className="dm-tag">{v.diff === "hard" ? (zh ? "困难" : "Hard") : zh ? "简单" : "Easy"}</span>
    </div>
  );
}

/** The scene's title, who wrote it (a player's scene), its set-up and what the audience is hunting for. */
export function Playbill({ v, credit }: { v: DramaView; credit?: string | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  const key = v.scene?.id ?? v.pk?.line.zh ?? "";
  useEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current.children, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, clearProps: "transform,opacity" });
  }, [key]);
  return (
    <div className="dm-playbill" ref={ref}>
      <p className="dm-act tabular">{zh ? `第 ${v.round} 幕 · 共 ${v.total} 幕` : `Act ${v.round} of ${v.total}`}</p>
      {v.scene && (
        <>
          <h2 className="dm-title">
            <Both t={v.scene.title} />
          </h2>
          {credit && (
            <p className="dm-credit">
              <Feather size={14} strokeWidth={2.4} />
              {zh ? `编剧：${credit}` : `Written by ${credit}`}
            </p>
          )}
          <p className="dm-setup">{zh ? v.scene.setup.zh : v.scene.setup.en}</p>
          <p className="dm-hunt">
            <MiniMask />
            {zh ? `台上有一个人是「${v.scene.culprit.zh}」` : `One of them is secretly ${v.scene.culprit.en.replace(/^The /, "the ")}`}
          </p>
        </>
      )}
      {v.pk && (
        <>
          <h2 className="dm-title">
            <Both t={{ zh: `「${v.pk.line.zh}」`, en: `"${v.pk.line.en}"` }} />
          </h2>
          <p className="dm-setup">{zh ? "同一句台词，两种演法。观众打分，分低的受罚。" : "Same line, two ways. The audience scores; the lower score pays."}</p>
        </>
      )}
      <Tags v={v} />
    </div>
  );
}

/** Who plays whom, with each role's public description. */
export function Roster({ v, nameOf, face }: { v: DramaView; nameOf: (pid: string) => string; face: Face }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <ul className="dm-roster">
      {v.cast.map((c) => (
        <li key={c.pid} className={v.ready.includes(c.pid) ? "is-ready" : ""}>
          <span className="dm-roster-face">{face(c.pid, 40)}</span>
          <span className="dm-roster-main">
            <strong>
              {zh ? c.role.zh : c.role.en}
              <small>{nameOf(c.pid)}</small>
            </strong>
            {(zh ? c.brief.zh : c.brief.en) && <span>{zh ? c.brief.zh : c.brief.en}</span>}
          </span>
          {v.phase === "brief" && <span className="dm-roster-state">{v.ready.includes(c.pid) ? (zh ? "看好了" : "Ready") : zh ? "在看牌" : "Reading"}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ the secret card */

/**
 * An actor's private card: dealt face down, flipped with a tap. The culprit's side is marked
 * with the mask; everyone also has a secret task.
 */
export function RoleCard({ role, brief, card, culprit, pk, onDone, doneLabel }: { role: T; brief: T; card: DramaCard; culprit: T | null; pk: boolean; onDone?: () => void; doneLabel?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [flipped, setFlipped] = useState(false);
  const [backOk, setBackOk] = useState(true);
  const inner = useRef<HTMLDivElement>(null);
  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    sfx.flip();
    haptic(12);
    if (card.culprit) window.setTimeout(() => dramaSfx.sting(0.7), 380);
    if (inner.current && !reduced()) gsap.fromTo(inner.current, { rotateY: 0 }, { rotateY: 180, duration: 0.7, ease: "back.out(1.4)" });
  };
  const tx = (x: T) => (zh ? x.zh : x.en);
  return (
    <div className="dm-cardwrap">
      <div className={`dm-card ${flipped ? "is-flipped" : ""} ${card.culprit ? "is-culprit" : ""}`}>
        <div className="dm-card-inner" ref={inner} style={reduced() && flipped ? { transform: "rotateY(180deg)" } : undefined}>
          <button type="button" className="dm-card-back" onClick={flip} aria-label={zh ? "翻开身份牌" : "Turn your card over"}>
            {backOk ? <img src={art("card-back")} alt="" onError={() => setBackOk(false)} /> : <DramaIcon size={64} strokeWidth={1.6} />}
            <span className="dm-card-tap">{zh ? "点一下，偷偷看" : "Tap to peek"}</span>
          </button>
          <div className="dm-card-front">
            {!pk && (
              <span className="dm-card-watermark" aria-hidden="true">
                <MaskArt culprit={card.culprit} />
              </span>
            )}
            <p className="dm-card-label">{pk ? (zh ? "你的演法" : "Your style") : zh ? "你的角色" : "Your role"}</p>
            <h3 className="dm-card-role">{tx(pk ? card.secret : role)}</h3>
            {!pk && tx(brief) && <p className="dm-card-brief">{tx(brief)}</p>}
            {!pk && (
              <div className={`dm-card-secret ${card.culprit ? "is-culprit" : ""}`}>
                <p className="dm-card-label">
                  <MiniMask culprit={card.culprit} />
                  {card.culprit ? (zh ? `你就是「${culprit ? culprit.zh : ""}」` : `You are ${culprit ? culprit.en.replace(/^The /, "the ") : ""}`) : zh ? "你的小秘密" : "Your little secret"}
                </p>
                <p>{tx(card.secret)}</p>
              </div>
            )}
            {pk && <p className="dm-card-brief">{zh ? "用这种状态说出台词，演得越像分越高。" : "Say the line in this state. The more convincing, the more stars."}</p>}
            {tx(card.task) && (
              <div className="dm-card-task">
                <p className="dm-card-label">{zh ? "秘密任务" : "Secret task"}</p>
                <p>{tx(card.task)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {onDone && (
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!flipped} onClick={onDone}>
          {doneLabel ?? (zh ? "记住了" : "Got it")}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ during the scene */

/** "剧情反转": slams in when the twist lands. */
export function TwistBanner({ twist, sound = true }: { twist: T | null; sound?: boolean }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!twist || shown.current === twist.zh) return;
    shown.current = twist.zh;
    if (sound) {
      dramaSfx.sting();
      window.setTimeout(() => dramaSfx.gasp(), 900);
      haptic([30, 60, 30]);
    }
    if (!ref.current || reduced()) return;
    gsap.fromTo(ref.current, { scale: 1.6, rotate: -6, opacity: 0 }, { scale: 1, rotate: -1.5, opacity: 1, duration: 0.55, ease: "back.out(2)" });
    gsap.fromTo(ref.current, { x: -8 }, { x: 0, duration: 0.6, ease: "elastic.out(1.4, 0.2)", delay: 0.2 });
  }, [twist, sound]);
  if (!twist) return null;
  return (
    <div className="dm-twist" ref={ref} role="status">
      <span className="dm-twist-label">{lang === "zh" ? "剧情反转！" : "Plot twist!"}</span>
      <p>{lang === "zh" ? twist.zh : twist.en}</p>
    </div>
  );
}

/** Seconds left, as a big ring; the last ten tick (and the heart beats). */
export function SceneClock({ endsAt, total, now, sound = true }: { endsAt: number; total: number; now: () => number; sound?: boolean }) {
  const [, bump] = useState(0);
  const lastTick = useRef(-1);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, endsAt - now());
  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (!sound || secs > 10 || secs <= 0 || secs === lastTick.current) return;
    lastTick.current = secs;
    dramaSfx.tick(secs <= 3);
  }, [secs, sound]);
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={`dm-clock ${secs <= 10 ? "is-late" : ""}`} role="timer" aria-live="off">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="dm-clock-track" />
        <circle cx="32" cy="32" r={r} className="dm-clock-arc" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="tabular">{secs}</span>
    </div>
  );
}

/** The slate that opens every scene. */
export function Slate({ onDone }: { onDone?: () => void }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dramaSfx.clapper();
    const t1 = window.setTimeout(() => sfx.showtime(0.8), 260);
    if (!ref.current || reduced()) {
      const t2 = window.setTimeout(() => onDone?.(), 600);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    tl.fromTo(ref.current, { scale: 0.6, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: -3, duration: 0.35, ease: "back.out(2)" })
      .fromTo(ref.current.querySelector(".dm-slate-top"), { rotate: -28 }, { rotate: 0, duration: 0.16, ease: "power4.in" }, 0.1)
      .to(ref.current, { scale: 1.2, opacity: 0, duration: 0.4, ease: "power2.in" }, 1.1);
    return () => {
      window.clearTimeout(t1);
      tl.kill();
    };
    // once per scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="dm-slate" ref={ref} aria-hidden="true">
      <div className="dm-slate-top">
        <Clapperboard size={26} strokeWidth={2.2} />
      </div>
      <strong>{lang === "zh" ? "开拍！" : "Action!"}</strong>
    </div>
  );
}

/* ------------------------------------------------------------------ the ballot */

export type Ballot = { guess: string | null; stars: Record<string, number> };

/** Pick the culprit (in a scene), then 1 to 5 stars for each actor. */
export function BallotForm({ v, actors, onSubmit, submitted }: { v: DramaView; actors: Actor[]; onSubmit: (b: Ballot) => void; submitted?: Ballot | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [guess, setGuess] = useState<string | null>(submitted?.guess ?? null);
  const [stars, setStars] = useState<Record<string, number>>(submitted?.stars ?? {});
  const show = v.mode === "show";
  const complete = (!show || !!guess) && actors.every((a) => stars[a.pid]);
  return (
    <div className="dm-ballot">
      {show && v.scene && (
        <section>
          <p className="dm-ask">
            <MiniMask />
            {zh ? v.scene.ask.zh : v.scene.ask.en}
          </p>
          <div className="dm-suspects">
            {actors.map((a) => (
              <button
                key={a.pid}
                type="button"
                className={`dm-suspect ${guess === a.pid ? "is-on" : ""}`}
                aria-pressed={guess === a.pid}
                onClick={() => {
                  setGuess(a.pid);
                  sfx.tap();
                  haptic(8);
                }}
              >
                <span className="dm-suspect-face">
                  {a.face(52)}
                  {guess === a.pid && (
                    <span className="dm-suspect-mask" aria-hidden="true">
                      <MaskArt culprit />
                    </span>
                  )}
                </span>
                <strong>{zh ? a.role.zh : a.role.en}</strong>
                <small>{a.name}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <p className="dm-ask">
          <Star size={18} strokeWidth={2.4} />
          {zh ? "演得像不像？给每个人打星" : "How convincing? Stars for each"}
        </p>
        <ul className="dm-rates">
          {actors.map((a) => (
            <li key={a.pid}>
              <span className="dm-rate-who">
                {a.face(36)}
                <span>
                  <strong>{zh ? a.role.zh : a.role.en}</strong>
                  <small>{a.name}</small>
                </span>
              </span>
              <span className="dm-stars" role="radiogroup" aria-label={zh ? `${a.name}的演技` : `${a.name}'s acting`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars[a.pid] === n}
                    aria-label={`${n}`}
                    className={`dm-star ${(stars[a.pid] ?? 0) >= n ? "is-on" : ""}`}
                    onClick={() => {
                      setStars((s) => ({ ...s, [a.pid]: n }));
                      dramaSfx.star(n);
                      haptic(6);
                    }}
                  >
                    <Star size={26} strokeWidth={2} />
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!complete} onClick={() => onSubmit({ guess, stars })}>
        {submitted ? (zh ? "改好了，再交一次" : "Send my changes") : zh ? "交卷" : "Send my vote"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ the reveal */

/**
 * The truth, in four beats: a drum roll; the culprit's mask comes down (or they get away with it);
 * every card turns over; the stars count up and the best actor takes the trophy.
 */
export function Reveal({ v, actors, me, face }: { v: DramaView; actors: Actor[]; me?: string; face: Face }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const r = v.result!;
  const [step, setStep] = useState(reduced() ? 3 : 0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = `${v.round}-${v.scene?.id ?? v.pk?.line.zh}`;
  useEffect(() => {
    if (reduced()) {
      setStep(3);
      return;
    }
    setStep(0);
    sfx.reveal(0.9);
    const timers = [
      window.setTimeout(() => {
        setStep(1);
        dramaSfx.spotlight();
        if (v.mode === "show") dramaSfx.culprit(r.caught);
        else sfx.versus();
      }, 1600),
      window.setTimeout(() => {
        setStep(2);
        sfx.flip();
      }, 2900),
      window.setTimeout(() => {
        setStep(3);
        if (r.best.length) {
          sfx.crown();
          sfx.applause(2.4, 0.9);
          confetti(canvas.current, { y: 0.35, count: 180, colors: ["#ffcf6b", "#fff1c9", "#ff9cc5", "#f5f4fd"] });
        }
      }, 3900),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // once per reveal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const tx = (x: T) => (zh ? x.zh : x.en);
  const culpritActor = actors.find((a) => a.pid === r.culprit);
  const headline =
    v.mode === "pk"
      ? zh
        ? "谁演得更像？"
        : "Who sold it?"
      : r.caught
        ? zh
          ? `「${v.scene?.culprit.zh}」就是 ${culpritActor?.name ?? "TA"}！`
          : `${culpritActor?.name ?? "They"} did it!`
        : zh
          ? `${culpritActor?.name ?? "TA"} 骗过了所有人！`
          : `${culpritActor?.name ?? "They"} fooled everyone!`;
  return (
    <div className="dm-reveal">
      <canvas className="dm-confetti" ref={canvas} aria-hidden="true" />
      <Backdrop kind={v.scene?.kind} pk={v.mode === "pk"} live>
        <div className={`dm-spot-culprit ${step >= 1 && v.mode === "show" ? "is-on" : ""}`} aria-hidden="true" />
        <Cast actors={actors} culprit={step >= 1 && v.mode === "show" ? r.culprit : null} best={step >= 3 ? r.best : []} />
      </Backdrop>
      <div className="dm-verdict" data-step={step}>
        {step === 0 ? (
          <p className="dm-drum">{zh ? "真相是……" : "And the truth is…"}</p>
        ) : (
          <h2 className={`dm-headline ${r.caught ? "is-caught" : ""}`}>{headline}</h2>
        )}
        {step >= 1 && v.mode === "show" && (
          <p className="hint dm-count">
            {actors.map((a) => `${a.name} ${r.counts[a.pid] ?? 0}${zh ? " 票" : ""}`).join(zh ? "，" : " · ")}
            {!zh && " votes"}
          </p>
        )}
      </div>
      {step >= 2 && (
        <ul className="dm-truths">
          {actors.map((a, i) => {
            const c = r.cards[a.pid];
            const st = r.stars[a.pid] ?? 0;
            return (
              <li key={a.pid} className={`${c?.culprit ? "is-culprit" : ""} ${r.best.includes(a.pid) && step >= 3 ? "is-best" : ""}`} style={{ ["--i" as string]: i }}>
                <span className="dm-truth-face">{face(a.pid, 44)}</span>
                <span className="dm-truth-main">
                  <strong>
                    {zh ? a.role.zh : a.role.en}
                    <small>{a.name}{a.pid === me ? (zh ? "（你）" : " (you)") : ""}</small>
                  </strong>
                  {c && v.mode === "show" && (
                    <span className="dm-truth-secret">
                      {c.culprit && <MiniMask />}
                      {tx(c.secret)}
                    </span>
                  )}
                  {c && tx(c.task) && (
                    <span className="dm-truth-task">
                      <Eye size={13} strokeWidth={2.4} />
                      {tx(c.task)}
                    </span>
                  )}
                </span>
                <span className="dm-truth-stars tabular" aria-label={zh ? `平均 ${st} 星` : `${st} stars on average`}>
                  <Star size={16} strokeWidth={2.4} />
                  {step >= 3 ? st.toFixed(1) : "?"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {step >= 3 && (
        <div className="dm-outcome">
          {r.best.length > 0 && (
            <p className="dm-best">
              <Sparkles size={16} strokeWidth={2.4} />
              {zh ? `本幕${r.best.length > 1 ? "影帝影后" : "最佳演员"}：` : "Best actor: "}
              <strong>{actors.filter((a) => r.best.includes(a.pid)).map((a) => a.name).join(zh ? "、" : ", ")}</strong>
            </p>
          )}
          {v.mode === "show" && (
            <p className="hint">
              {r.right.length
                ? zh
                  ? `猜对的：${r.right.length} 人，每人 +1`
                  : `${r.right.length} guessed right: +1 each`
                : zh
                  ? "没有人猜对"
                  : "Nobody guessed right"}
              {!r.caught && (zh ? "；坏人逍遥法外 +3" : "; the culprit walks free: +3")}
            </p>
          )}
          {r.losers.length > 0 && r.penalty && (
            <p className="dm-penalty-line">
              {zh ? "受罚：" : "Penalty: "}
              <strong>{tx(r.penalty)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ setup */

export type Config = Pick<DramaView, "mode" | "level" | "diff" | "pen" | "total">;

export function SetupPanel({ cfg, onChange, disabled }: { cfg: Config; onChange: (c: Partial<Config>) => void; disabled?: boolean }) {
  const { lang } = useStore();
  // the first choice is the table's own penalty: drinking, or whatever the host set instead
  const pen = usePenaltyText();
  const zh = lang === "zh";
  const seg = <K extends keyof Config>(key: K, options: { value: Config[K]; label: string }[]) => (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={cfg[key] === o.value} disabled={disabled} onClick={() => onChange({ [key]: o.value } as Partial<Config>)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="panel setup-panel dm-setup">
      <span className="field-label">{zh ? "玩法" : "Game"}</span>
      {seg("mode", [
        { value: "show", label: zh ? "演戏猜坏人" : "Find the culprit" },
        { value: "pk", label: zh ? "演技 PK" : "Acting duel" },
      ])}
      <span className="field-label">{zh ? "尺度" : "Spice"}</span>
      {seg("level", [
        { value: "all", label: zh ? "全年龄" : "All ages" },
        { value: "spicy", label: zh ? "微辣" : "Spicy" },
      ])}
      <span className="field-label">{zh ? "难度" : "Difficulty"}</span>
      {seg("diff", [
        { value: "easy", label: zh ? "简单" : "Easy" },
        { value: "hard", label: zh ? "困难" : "Hard" },
      ])}
      <span className="field-label">{zh ? "输了怎么罚" : "Losers"}</span>
      {seg("pen", [
        { value: "drink", label: pen.isCustom ? pen.text : zh ? "喝酒" : "Drink" },
        { value: "move", label: zh ? "运动" : "Exercise" },
        { value: "prank", label: zh ? "整蛊" : "Forfeit" },
      ])}
      <span className="field-label">{zh ? "演几幕" : "How many acts"}</span>
      {seg("total", [
        { value: 3, label: "3" },
        { value: 5, label: "5" },
        { value: 8, label: "8" },
      ])}
    </div>
  );
}

/** The poster on the setup screen: an empty stage in its spotlight, waiting. */
export function Marquee() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <Backdrop tall live>
      <div className="dm-marquee">
        <span className="dm-marquee-masks" aria-hidden="true">
          <MaskArt culprit={false} />
          <MaskArt culprit />
        </span>
        <strong>{zh ? "戏精大赏" : "Drama Queens"}</strong>
        <small>{zh ? "演一出狗血剧，揪出藏在台上的坏人" : "Act a soap opera. Unmask the culprit."}</small>
      </div>
    </Backdrop>
  );
}

/** The curtain call: the trophy, the points, and who took best actor how many times. */
export function Finale({ v, ids, nameOf, face, me }: { v: DramaView; ids: string[]; nameOf: (pid: string) => string; face: Face; me?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dm-playbill dm-finale">
      <span className="dm-finale-trophy" aria-hidden="true">
        <TrophyArt />
      </span>
      <p className="dm-act">{zh ? "谢幕" : "Curtain call"}</p>
      <h2 className="dm-title">{zh ? "今晚的影帝影后" : "Tonight's stars"}</h2>
      <Leaderboard
        rows={ids.map((id) => ({
          id,
          name: id === me ? (zh ? `${nameOf(id)}（你）` : `${nameOf(id)} (you)`) : nameOf(id),
          score: v.scores[id] ?? 0,
          face: face(id, 38),
          note: v.awards[id] ? (zh ? `最佳演员 ×${v.awards[id]}` : `Best actor ×${v.awards[id]}`) : undefined,
        }))}
        unit={zh ? "分" : "pts"}
      />
    </div>
  );
}

/** How to play, for the rules sheet. */
export function Rules() {
  const { lang } = useStore();
  return lang === "zh" ? (
    <>
      <p>每一幕抽一个狗血剧本，几个人上台演，其余的人当观众。每个演员会拿到一张只有自己能看的身份牌：自己的角色、一个小秘密和一个秘密任务。其中一个人偷偷是「坏人」（小三、凶手、内鬼……），他的牌上写着他干了什么。</p>
      <p>演到一半会弹出一个剧情反转。演完以后，观众先猜谁是坏人，再给每个演员的演技打 1 到 5 星。</p>
      <p>计分：猜对 +1；没被多数人认出来的坏人 +3；每个演员加平均星数。受罚：星最少的演员；坏人被认出来就一起罚，没被认出来，被他骗了的观众受罚。星最多的拿下本幕最佳演员。</p>
      <p>演技 PK：两个人用不同的状态说同一句台词，观众打分，分低的受罚。</p>
    </>
  ) : (
    <>
      <p>Each act draws a melodramatic scene. A few players go on stage; the rest are the audience. Every actor gets a private card: their role, a little secret and a secret task. One of them is secretly the culprit (the homewrecker, the killer, the mole...), and their card says what they did.</p>
      <p>Halfway through, a plot twist lands. When the scene ends, the audience guesses the culprit, then gives every actor 1 to 5 stars.</p>
      <p>Points: a right guess +1; a culprit most people miss +3; every actor gets their average stars. Penalty: the actor with the fewest stars, plus the culprit if caught, or everyone the culprit fooled if not. Most stars wins best actor.</p>
      <p>Acting duel: two players say the same line in two different states; the audience scores, and the lower score pays.</p>
    </>
  );
}
