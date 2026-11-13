import { DramaAction } from "./ShellActions";
import { Clapperboard, Drama as DramaIcon, ExternalLink, Eye, Feather, Film, Mic, Sparkles, Star, VenetianMask } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GROUPS, KINDS, PK_DEMO, pkSeeUrl, pkStyle, SCENES, type DramaKind, type PkStyle } from "../../data/drama";
import { DRAWN_ART } from "../../data/dramaArt";
import { CLASSIC_TIPS, CSET_NAME } from "../../data/dramaClassics";
import { READ_KINDS, READ_PASS, READ_TIPS, readKind, RSET_NAME, type ReadKind } from "../../data/dramaReadings";
import { FIRST_TIME_TIPS, GENERIC_BEATS, roleGuide, sceneGuide } from "../../data/dramaGuide";
import type { T } from "../../i18n";
import { confetti } from "../../lib/confetti";
import { gsap, reduced } from "../../lib/anim";
import { haptic, sfx } from "../../lib/sfx";
import type { DramaCard, DramaView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { Both, Leaderboard } from "../common";
import { Pill } from "../../ui/Pill";
import { dramaSfx } from "./sound";
import "../../styles/party.css";
import "../../styles/drama.css";

/** The artwork lives in public/drama; until a picture loads, the stage paints itself. */
export const art = (name: string) => `/drama/${name}.webp`;

export type Face = (pid: string, size: number) => ReactNode;

export const isKind = (k: string | undefined): k is DramaKind => !!k && KINDS.some((x) => x.key === k);

/**
 * The set a reading stands in: a love letter, a breakup or a confession at the candlelit table, a memorial in the
 * palace hall, a broadcast or a sales pitch in the studio, a meltdown at the office, a dubbed voice
 * on the film set; a straight face on the empty stage.
 */
const READ_STAGE: Record<ReadKind, DramaKind | "classic" | null> = {
  cry: "love",
  breakup: "love",
  deep: "love",
  melodrama: "love",
  court: "palace",
  anchor: "show",
  sell: "show",
  sorry: "show",
  rant: "office",
  voice: "classic",
  deadpan: null,
};

/** What the stage shows for the act on now: a scene's own picture, kind and group, the duel, a famous scene, a reading's set. */
export function stageOf(v: Pick<DramaView, "mode" | "scene" | "read">): { scene?: string; kind?: string; pk?: boolean; classic?: boolean; group?: string } {
  if (v.mode === "read" && v.read) {
    const at = READ_STAGE[v.read.kind];
    return at === "classic" ? { classic: true } : at ? { kind: at } : {};
  }
  return { scene: v.mode === "show" ? v.scene?.id : undefined, kind: v.scene?.kind, pk: v.mode === "pk", classic: v.mode === "classic", group: v.scene?.group };
}

/* ------------------------------------------------------------------ the stage */

/**
 * The set: the scene's backdrop (a family dining room, a palace hall...), slowly drifting while a
 * scene plays, with the cast standing along the front and the curtain in front of it all.
 *
 * A built-in scene has a picture of its own (`scene-<id>`), a scene set in one community's everyday
 * life one for that community (`group-cn`...), and a famous scene the film set (`classic`), each
 * once drawn (`DRAWN_ART`); until then, or if one won't load, the next: the community's, the
 * scene's kind, the empty stage.
 */
export function Backdrop({ scene, kind, pk, classic, group, live, children, tall }: { scene?: string; kind?: string; pk?: boolean; classic?: boolean; group?: string; live?: boolean; children?: ReactNode; tall?: boolean }) {
  const names = (pk ? ["pk"] : classic ? ["classic", "stage"] : [`scene-${scene}`, `group-${group}`, ...(isKind(kind) ? [`kind-${kind}`] : []), "stage"]).filter(
    (n) => !(n === "classic" || n.startsWith("group-") || n.startsWith("scene-")) || DRAWN_ART.has(n),
  );
  const key = names.join("|");
  const [tries, setTries] = useState(0);
  useEffect(() => setTries(0), [key]);
  const src = tries < names.length ? art(names[tries]) : null;
  return (
    <div className={`dm-backdrop ${live ? "is-live" : ""} ${tall ? "is-tall" : ""}`} data-kind={pk ? "pk" : classic ? "classic" : kind ?? "stage"}>
      {src && <img className="dm-backdrop-img" src={src} alt="" draggable={false} onError={() => setTries((n) => n + 1)} />}
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

export function Tags({ v }: { v: Pick<DramaView, "mode" | "level" | "diff" | "scene" | "cset" | "read"> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const kind = KINDS.find((k) => k.key === v.scene?.kind);
  const group = GROUPS.find((x) => x.key === v.scene?.group);
  const classic = v.mode === "classic";
  const read = v.mode === "read" ? v.read : null;
  return (
    <div className="dm-tags">
      {v.mode === "pk" ? (
        <span className="dm-tag">{zh ? "演技 PK" : "Acting duel"}</span>
      ) : classic ? (
        <span className="dm-tag">{zh ? "名场面" : "Famous scenes"}</span>
      ) : v.mode === "read" ? (
        <span className="dm-tag">{zh ? "朗读" : "Read aloud"}</span>
      ) : (
        kind && <span className="dm-tag">{zh ? kind.name.zh : kind.name.en}</span>
      )}
      {classic && <span className="dm-tag">{zh ? CSET_NAME[v.cset ?? "zh"].zh : CSET_NAME[v.cset ?? "zh"].en}</span>}
      {read && <span className="dm-tag">{zh ? RSET_NAME[read.set].zh : RSET_NAME[read.set].en}</span>}
      {group && <span className="dm-tag">{zh ? group.name.zh : group.name.en}</span>}
      <span className="dm-tag">{v.level === "spicy" ? (zh ? "微辣" : "Spicy") : zh ? "全年龄" : "All ages"}</span>
      {/* a famous scene is as hard as the original makes it, a reading as its words */}
      {!classic && v.mode !== "read" && <span className="dm-tag">{v.diff === "hard" ? (zh ? "困难" : "Hard") : zh ? "简单" : "Easy"}</span>}
    </div>
  );
}

/** The scene's title, who wrote it (a player's scene), its set-up and what the audience is hunting for. */
export function Playbill({ v, credit }: { v: DramaView; credit?: string | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const ref = useRef<HTMLDivElement>(null);
  const key = v.scene?.id ?? v.classic?.id ?? v.read?.id ?? v.pk?.line.zh ?? "";
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
          {v.options ? (
            <Secrets v={v} />
          ) : (
            <p className="dm-hunt">
              <MiniMask />
              {zh ? `台上有一个人是「${v.scene.culprit.zh}」` : `One of them is secretly ${v.scene.culprit.en.replace(/^The /, "the ")}`}
            </p>
          )}
          <Beats beats={sceneGuide(v.scene.id)?.beats ?? GENERIC_BEATS} />
          {v.peer && v.phase !== "reveal" && (
            <p className="dm-peer-note">{zh ? "这一幕没人当观众：演完以后，演员互相猜、互相打星，不能投自己。" : "Nobody's watching this one: when it's over, the actors guess and rate each other (never themselves)."}</p>
          )}
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
      {v.classic && (
        <>
          <p className="dm-classic-show">
            <Film size={14} strokeWidth={2.4} aria-hidden="true" />
            <span>{`${zh ? v.classic.show.zh : v.classic.show.en} · ${v.classic.year}`}</span>
          </p>
          <h2 className="dm-title">
            <Both t={v.classic.title} />
          </h2>
          <p className="dm-setup">{zh ? v.classic.setup.zh : v.classic.setup.en}</p>
          <SeeOriginal c={v.classic} />
          <Beats beats={v.classic.beats} />
          {v.peer && v.phase !== "reveal" && (
            <p className="dm-peer-note">{zh ? "这一幕没人当观众：演完以后，演员互相打星，不能投自己。" : "Nobody's watching this one: when it's over, the actors rate each other (never themselves)."}</p>
          )}
        </>
      )}
      {v.read && (
        <>
          <ReadKindLine k={v.read.kind} />
          <h2 className="dm-title">
            <Both t={v.read.title} />
          </h2>
          <ReadHow r={v.read} />
        </>
      )}
      <Tags v={v} />
    </div>
  );
}

/* ------------------------------------------------------------------ 朗读 */

/** A reading's kind, as the line over its title. */
function ReadKindLine({ k }: { k: ReadKind }) {
  const { lang } = useStore();
  const kind = readKind(k);
  if (!kind) return null;
  return (
    <p className="dm-classic-show dm-read-kind">
      <Mic size={14} strokeWidth={2.4} aria-hidden="true" />
      <span>{lang === "zh" ? kind.name.zh : kind.name.en}</span>
    </p>
  );
}

/** How to read it: the kind's way, then this piece's own direction. */
export function ReadHow({ r }: { r: NonNullable<DramaView["read"]> }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const kind = readKind(r.kind);
  return (
    <div className="dm-read-how">
      <p className="dm-beats-title">{zh ? "怎么读" : "How to read it"}</p>
      {kind && <p>{zh ? kind.how.zh : kind.how.en}</p>}
      <p>{zh ? r.how.zh : r.how.en}</p>
    </div>
  );
}

/**
 * The words, one breath to a line. `big` for the phone being read from; smaller for the phones
 * following along.
 */
export function ReadingText({ r, big }: { r: NonNullable<DramaView["read"]>; big?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  if (!r.lines.length) return null;
  return (
    <div className={`dm-reading ${big ? "is-big" : ""}`} lang={zh ? "zh" : "en"}>
      {r.lines.map((l, i) => (
        <p key={i}>{zh ? l.zh : l.en}</p>
      ))}
    </div>
  );
}

/**
 * The reader's own card while they read it over: the title, how to read it and the words, then
 * the button that says they're ready.
 */
export function ReadingCard({ r, onDone, doneLabel, inShell }: { r: NonNullable<DramaView["read"]>; onDone?: () => void; doneLabel?: string; inShell?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dm-readcard">
      <p className="dm-card-label">{zh ? "你要读的" : "Your reading"}</p>
      <ReadKindLine k={r.kind} />
      <h3 className="dm-title">{zh ? r.title.zh : r.title.en}</h3>
      <ReadHow r={r} />
      <ReadingText r={r} />
      {onDone && (
        <DramaAction inShell={inShell}>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onDone}>
            {doneLabel ?? (zh ? "准备好了" : "Ready")}
          </button>
        </DramaAction>
      )}
    </div>
  );
}

/** While it's read: the kind and the title, with the clock beside them, over the words. */
export function ReadingHead({ r, clock }: { r: NonNullable<DramaView["read"]>; clock?: ReactNode }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const kind = readKind(r.kind);
  return (
    <div className="dm-read-head">
      <span className="dm-read-head-main">
        {kind && (
          <small>
            <Mic size={14} strokeWidth={2.4} aria-hidden="true" />
            {zh ? kind.name.zh : kind.name.en}
          </small>
        )}
        <strong>{zh ? r.title.zh : r.title.en}</strong>
      </span>
      {clock}
    </div>
  );
}

/** Where to watch the original: a video search, on Bilibili for the Chinese set and YouTube for the English. */
export function SeeOriginal({ c }: { c: { set: "zh" | "en"; see: string } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <a
      className="dm-card-see dm-see-original"
      href={pkSeeUrl(c.set, c.see)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={zh ? "看原片（在新页面打开视频搜索）" : "Watch the original (opens a video search in a new page)"}
    >
      {zh ? "看原片" : "Watch the original"}
      <ExternalLink size={16} strokeWidth={2.4} aria-hidden="true" />
    </a>
  );
}

/** A monologue: the actor is hiding one of these three; the audience watches for which. */
function Secrets({ v }: { v: DramaView }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dm-hunt-secrets">
      <p>
        <MiniMask />
        {zh ? "台上的人藏着一个秘密，是下面哪一个？" : "The actor is hiding one of these. Which?"}
      </p>
      <ol>
        {(v.options ?? []).map((o, i) => (
          <li key={i}>
            <span className="dm-secret-mark" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            {zh ? o.zh : o.en}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * What happens, step by step. People who have never acted need a path to follow; the playbill
 * keeps it on screen through the scene.
 */
function Beats({ beats }: { beats: T[] }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="dm-beats">
      <p className="dm-beats-title">{zh ? "剧情怎么走" : "How the scene goes"}</p>
      <ol>
        {beats.map((b, i) => (
          <li key={i}>{zh ? b.zh : b.en}</li>
        ))}
      </ol>
    </div>
  );
}

/** For someone who has never acted: five things that make any scene (or famous scene) work, folded until asked for. */
export function FirstTimeTips({ classic, read }: { classic?: boolean; read?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <details className="dm-tips">
      <summary>
        {read
          ? zh
            ? "第一次上台朗读？看这五句"
            : "First time reading aloud? Read these five"
          : classic
            ? zh
              ? "第一次演名场面？看这五句"
              : "First famous scene? Read these five"
            : zh
              ? "第一次演戏？看这五句"
              : "Never acted before? Read these five"}
      </summary>
      <ol>
        {(read ? READ_TIPS : classic ? CLASSIC_TIPS : FIRST_TIME_TIPS).map((x, i) => (
          <li key={i}>{zh ? x.zh : x.en}</li>
        ))}
      </ol>
    </details>
  );
}

/** Who plays whom, with each role's public description. */
export function Roster({ v, nameOf, face }: { v: DramaView; nameOf: (pid: string) => string; face: Face }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <ul className="dm-roster">
      {v.cast.map((c) => {
        // a role's public line; in a duel, what the actor's style looks like, so the audience knows what to watch for
        // (a reading's direction is on the playbill)
        const about = v.mode === "pk" ? pkStyle(c.role)?.how : v.mode === "classic" || v.mode === "read" ? undefined : c.brief;
        const line = about ? (zh ? about.zh : about.en) : "";
        // and in a scene, how the role comes across, for actors and audience alike (a famous scene: its line too)
        const play = v.mode === "show" ? roleGuide(v.scene?.id, c.role)?.play : v.mode === "classic" ? c.brief : undefined;
        const first = v.mode === "classic" ? c.first : undefined;
        return (
          <li key={c.pid} className={v.ready.includes(c.pid) ? "is-ready" : ""}>
            <span className="dm-roster-face">{face(c.pid, 40)}</span>
            <span className="dm-roster-main">
              <strong>
                {zh ? c.role.zh : c.role.en}
                <small>{nameOf(c.pid)}</small>
              </strong>
              {line && <span>{line}</span>}
              {play && <span className="dm-roster-play">{zh ? `怎么演：${play.zh}` : `How to play it: ${play.en}`}</span>}
              {first && <span className="dm-roster-play">{zh ? `第一句：${first.zh}` : `Opens with: ${first.en}`}</span>}
            </span>
            {v.phase === "brief" && (
              <span className="dm-roster-state">
                {v.ready.includes(c.pid) ? (zh ? (v.mode === "read" ? "准备好了" : "看好了") : "Ready") : v.mode === "read" ? (zh ? "在默读" : "Reading it over") : zh ? "在看牌" : "Reading"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ the secret card */

/**
 * A duel card under the style's name, for someone who has never acted: what the style is and what
 * to do, the everyday sentence said that way, and the line to say tonight. A style this phone
 * doesn't know yet (an older page at a newer table) gets the plain line.
 */
function StyleHelp({ st, line }: { st: PkStyle | undefined; line?: T | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const tx = (x: T) => (zh ? x.zh : x.en);
  return (
    <>
      <p className="dm-card-brief">{st ? tx(st.how) : zh ? "用这种状态说出台词，演得越像分越高。" : "Say the line in this state. The more convincing, the more stars."}</p>
      {st && (
        <div className="dm-card-task dm-card-demo">
          <p className="dm-card-label">{zh ? `比如把「${PK_DEMO.zh}」说成` : `For example, “${PK_DEMO.en}” becomes`}</p>
          <p>{tx(st.demo)}</p>
        </div>
      )}
      {line && tx(line) && (
        <div className="dm-card-secret dm-card-line">
          <p className="dm-card-label">{zh ? "你要说的台词" : "The line you say"}</p>
          <p>{zh ? `「${line.zh}」` : `“${line.en}”`}</p>
        </div>
      )}
    </>
  );
}

/**
 * An actor's private card: dealt face down, flipped with a tap. Every card looks and sounds the
 * same when it turns over (the phone goes round the table, and the person next to you sees the
 * colours and hears the sound): only the words say who the culprit is. Everyone also has a secret
 * task. In a duel it explains the style instead
 * (`line` is the line both actors say), and once it's turned over, a link under it goes to
 * videos of people doing that style. In a famous scene (`first`, its opening line, and `see`, the
 * original) there's nothing secret: the part, how to play it, the line, and a link to the original.
 */
export function RoleCard({ role, brief, card, culprit, pk, onDone, doneLabel, inShell, line, sceneId, first, see }: { role: T; brief: T; card: DramaCard; culprit: T | null; pk: boolean; onDone?: () => void; doneLabel?: string; inShell?: boolean; line?: T | null; sceneId?: string | null; first?: T | null; see?: { set: "zh" | "en"; see: string } | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const classic = !!first;
  const st = pk ? pkStyle(card.secret) : undefined;
  const rg = pk || classic ? undefined : roleGuide(sceneId, role);
  const title = pk ? card.secret : role;
  const [flipped, setFlipped] = useState(false);
  const [backOk, setBackOk] = useState(true);
  const inner = useRef<HTMLDivElement>(null);
  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    sfx.flip();
    haptic(12);
    if (inner.current && !reduced()) gsap.fromTo(inner.current, { rotateY: 0 }, { rotateY: 180, duration: 0.7, ease: "back.out(1.4)" });
  };
  const tx = (x: T) => (zh ? x.zh : x.en);
  return (
    <div className="dm-cardwrap">
      <div className={`dm-card ${flipped ? "is-flipped" : ""}`}>
        <div className="dm-card-inner" ref={inner} style={reduced() && flipped ? { transform: "rotateY(180deg)" } : undefined}>
          <button type="button" className="dm-card-back" onClick={flip} aria-label={zh ? "翻开身份牌" : "Turn your card over"}>
            {backOk ? <img src={art("card-back")} alt="" onError={() => setBackOk(false)} /> : <DramaIcon size={64} strokeWidth={1.6} />}
            <span className="dm-card-tap">{zh ? "点一下，偷偷看" : "Tap to peek"}</span>
          </button>
          <div className="dm-card-front">
            {!pk && !classic && (
              <span className="dm-card-watermark" aria-hidden="true">
                <MaskArt culprit={false} />
              </span>
            )}
            <p className="dm-card-label">{pk ? (zh ? "你的演法" : "Your style") : zh ? "你的角色" : "Your role"}</p>
            <h3 className={`dm-card-role ${(zh ? title.zh.length > 8 : title.en.length > 22) ? "is-long" : ""}`}>{tx(title)}</h3>
            {!pk && !classic && tx(brief) && <p className="dm-card-brief">{tx(brief)}</p>}
            {(rg || classic) && (
              <p className="dm-card-play">
                <strong>{zh ? "怎么演" : "How to play it"}</strong>
                {tx(rg ? rg.play : brief)}
              </p>
            )}
            {!pk && !classic && (
              <div className="dm-card-secret">
                <p className="dm-card-label">
                  <MiniMask culprit={false} />
                  {card.culprit ? (zh ? `你就是「${culprit ? culprit.zh : ""}」` : `You are ${culprit ? culprit.en.replace(/^The /, "the ") : ""}`) : zh ? "你的小秘密" : "Your little secret"}
                </p>
                <p>{tx(card.secret)}</p>
              </div>
            )}
            {(rg || first) && (
              <div className="dm-card-task dm-card-first">
                <p className="dm-card-label">{zh ? "开口第一句" : "Open with"}</p>
                <p>{tx(rg ? rg.first : first!)}</p>
              </div>
            )}
            {pk && <StyleHelp st={st} line={line} />}
            {tx(card.task) && (
              <div className="dm-card-task">
                <p className="dm-card-label">{zh ? "秘密任务" : "Secret task"}</p>
                <p>{tx(card.task)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {st && flipped && (
        <a
          className="dm-card-see"
          href={pkSeeUrl(zh ? "zh" : "en", tx(st.see))}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={zh ? "看看别人怎么演（在新页面打开视频搜索）" : "Watch how others play it (opens a video search in a new page)"}
        >
          {zh ? "看看别人怎么演" : "Watch how others play it"}
          <ExternalLink size={16} strokeWidth={2.4} aria-hidden="true" />
        </a>
      )}
      {see && flipped && <SeeOriginal c={see} />}
      {onDone && (
        <DramaAction inShell={inShell}>
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!flipped} onClick={onDone}>
            {doneLabel ?? (zh ? "记住了" : "Got it")}
          </button>
        </DramaAction>
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
/** A clock's time left: minutes and seconds (5:00) while there's a minute or more, then seconds. */
export function clockText(secs: number): string {
  return secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : String(secs);
}

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
    <div className={`dm-clock ${secs <= 10 ? "is-late" : ""} ${secs >= 60 ? "is-long" : ""}`} role="timer" aria-live="off">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="dm-clock-track" />
        <circle cx="32" cy="32" r={r} className="dm-clock-arc" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="tabular">{clockText(secs)}</span>
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

/**
 * Pick the culprit (in a scene), then 1 to 5 stars for each actor. In a monologue the pick is one of
 * the three secrets; with nobody watching, an actor votes too, on everyone but themselves (`me`).
 */
export function BallotForm({ v, actors: all, onSubmit, submitted, inShell, me }: { v: DramaView; actors: Actor[]; onSubmit: (b: Ballot) => void; submitted?: Ballot | null; inShell?: boolean; me?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const actors = me ? all.filter((a) => a.pid !== me) : all;
  const tx = (x: T) => (zh ? x.zh : x.en);
  const [guess, setGuess] = useState<string | null>(submitted?.guess ?? null);
  const [stars, setStars] = useState<Record<string, number>>(submitted?.stars ?? {});
  const show = v.mode === "show";
  const options = show ? v.options ?? null : null;
  const complete = (!show || !!guess) && actors.every((a) => stars[a.pid]);
  return (
    <div className="dm-ballot">
      {options && v.scene && (
        <section>
          <p className="dm-ask">
            <MiniMask />
            {zh ? v.scene.ask.zh : v.scene.ask.en}
          </p>
          <div className="dm-secrets" role="radiogroup" aria-label={zh ? v.scene.ask.zh : v.scene.ask.en}>
            {options.map((o, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={guess === String(i)}
                className={`dm-secret ${guess === String(i) ? "is-on" : ""}`}
                onClick={() => {
                  setGuess(String(i));
                  sfx.tap();
                  haptic(8);
                }}
              >
                <span className="dm-secret-mark" aria-hidden="true">
                  {String.fromCharCode(65 + i)}
                </span>
                {zh ? o.zh : o.en}
              </button>
            ))}
          </div>
        </section>
      )}
      {show && !options && v.scene && (
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
          {v.mode === "read" && v.read
            ? tx(readKind(v.read.kind)?.ask ?? { zh: "读得怎么样？", en: "How was that?" })
            : v.mode === "classic"
              ? zh
                ? "像不像原片？给每个人打星"
                : "How close to the original? Stars for each"
              : zh
                ? "演得像不像？给每个人打星"
                : "How convincing? Stars for each"}
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
      <DramaAction inShell={inShell}>
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!complete} onClick={() => onSubmit({ guess, stars })}>
          {submitted ? (zh ? "改好了，再交一次" : "Send my changes") : zh ? "交卷" : "Send my vote"}
        </button>
      </DramaAction>
    </div>
  );
}

/* ------------------------------------------------------------------ the reveal */

/** A reading's verdict: five stars from everyone, a pass, or not this time (no stars: nobody voted). */
export function readHeadline(stars: number, zh: boolean): string {
  if (!stars) return zh ? "这一段没人打星" : "No stars this time";
  if (stars >= 5) return zh ? "全场五星！" : "Five stars all round!";
  if (stars >= READ_PASS) return zh ? "过关！" : "Passed!";
  return zh ? "没过关……" : "Not this time…";
}

/** A reading nobody here could rate (one person at the table): the applause is the verdict. */
export function quietRead(zh: boolean): string {
  return zh ? "读完了，掌声送给你！" : "That's the reading. Take a bow!";
}

/**
 * Why a reveal counts nothing. `crowd`: one person at the table, so nobody could vote (a monologue
 * the room guessed out loud, or a reading); otherwise nobody voted or gave stars in time.
 */
export function quietNote(mode: DramaView["mode"], crowd: boolean, zh: boolean): string {
  if (mode === "read") return crowd ? (zh ? "一个人读，不打星也不计分" : "Reading on your own: no stars, no points") : zh ? "没人打星，这一幕不计分" : "Nobody gave stars: no points this act";
  if (crowd) return zh ? "大家是喊着猜的，这一幕不计分" : "The room guessed out loud: no points this act";
  return zh ? "没人投票，这一幕不计分" : "Nobody voted: no points this act";
}

/** The bar a reading had to clear. */
export function readBar(stars: number, zh: boolean): string {
  return zh ? `平均 ${stars.toFixed(1)} 星，${READ_PASS} 星过关` : `${stars.toFixed(1)} stars on average; ${READ_PASS} to pass`;
}

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
  const key = `${v.round}-${v.scene?.id ?? v.classic?.id ?? v.read?.id ?? v.pk?.line.zh}`;
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
        // (no votes to count: nobody was caught or fooled, the truth just comes out)
        if (v.mode === "show" && !r.quiet) dramaSfx.culprit(r.caught);
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
  // a monologue: the answer is one of the three secrets, not a person
  const options = v.mode === "show" ? v.options ?? null : null;
  const readStars = v.mode === "read" ? (r.stars[v.cast[0]?.pid ?? ""] ?? 0) : 0;
  const headline =
    v.mode === "pk"
      ? zh
        ? "谁演得更像？"
        : "Who sold it?"
      : v.mode === "read"
        ? r.quiet
          ? quietRead(zh)
          : readHeadline(readStars, zh)
      : v.mode === "classic"
        ? zh
          ? "谁最像原版？"
          : "Who nailed it?"
        : r.quiet && options
        ? zh
          ? "猜对了吗？"
          : "Did you get it right?"
        : r.caught || r.quiet
        ? options
          ? zh
            ? "秘密被猜中了！"
            : "Busted! The secret's out."
          : zh
            ? `「${v.scene?.culprit.zh}」就是 ${culpritActor?.name ?? "TA"}！`
            : `${culpritActor?.name ?? "They"} did it!`
        : r.right.length
          ? zh
            ? `${culpritActor?.name ?? "TA"} 骗过了大多数人！`
            : `${culpritActor?.name ?? "They"} fooled most of you!`
          : zh
            ? `${culpritActor?.name ?? "TA"} 骗过了所有人！`
            : `${culpritActor?.name ?? "They"} fooled everyone!`;
  return (
    <div className="dm-reveal">
      <canvas className="dm-confetti" ref={canvas} aria-hidden="true" />
      <Backdrop {...stageOf(v)} live>
        <div className={`dm-spot-culprit ${step >= 1 && v.mode === "show" && !options ? "is-on" : ""}`} aria-hidden="true" />
        <Cast actors={actors} culprit={step >= 1 && v.mode === "show" && !options ? r.culprit : null} best={step >= 3 ? r.best : []} />
      </Backdrop>
      <div className="dm-verdict" data-step={step}>
        {step === 0 && !(r.quiet && v.mode === "read") ? (
          <p className="dm-drum">{v.mode === "read" ? (zh ? "评委打分中……" : "The judges are scoring…") : zh ? "真相是……" : "And the truth is…"}</p>
        ) : (
          <h2 className={`dm-headline ${r.caught || (v.mode === "read" && readStars >= READ_PASS) ? "is-caught" : ""}`}>{headline}</h2>
        )}
        {step >= 1 && options && (
          <ol className="dm-secret-results">
            {options.map((o, i) => (
              <li key={i} className={r.answer === i ? "is-true" : ""}>
                <span className="dm-secret-mark" aria-hidden="true">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>
                  {tx(o)}
                  {r.answer === i && <strong>{zh ? "（真的）" : " (the real one)"}</strong>}
                </span>
                {!r.quiet && <small className="tabular">{zh ? `${r.counts[String(i)] ?? 0} 票` : `${r.counts[String(i)] ?? 0} ${r.counts[String(i)] === 1 ? "vote" : "votes"}`}</small>}
              </li>
            ))}
          </ol>
        )}
        {step >= 1 && v.mode === "show" && !options && !r.quiet && (
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
                {!r.quiet && (
                  <span className="dm-truth-stars tabular" aria-label={zh ? `平均 ${st} 星` : `${st} stars on average`}>
                    <Star size={16} strokeWidth={2.4} />
                    {step >= 3 ? st.toFixed(1) : "?"}
                  </span>
                )}
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
          {r.quiet && <p className="hint">{quietNote(v.mode, !!v.crowd, zh)}</p>}
          {v.mode === "show" && !r.quiet && (
            <p className="hint">
              {r.right.length
                ? zh
                  ? `猜对的：${r.right.length} 人，每人 +1`
                  : `${r.right.length} guessed right: +1 each`
                : zh
                  ? "没有人猜对"
                  : "Nobody guessed right"}
              {!r.caught && (options ? (zh ? "；秘密没被猜中，演员 +3" : "; the secret stayed hidden: +3 to the actor") : zh ? "；坏人逍遥法外 +3" : "; the culprit walks free: +3")}
            </p>
          )}
          {v.mode === "read" && readStars > 0 && <p className="hint">{readBar(readStars, zh)}</p>}
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

export type Config = Pick<DramaView, "mode" | "level" | "diff" | "pen" | "total" | "cset" | "groups" | "rset" | "rkinds">;

/** The groups with scenes of their own, in the order the setup lists them. */
const GROUPS_ON = GROUPS.filter((x) => SCENES.some((sc) => sc.group === x.key));

export function SetupPanel({ cfg, onChange, disabled }: { cfg: Config; onChange: (c: Partial<Config>) => void; disabled?: boolean }) {
  const { lang } = useStore();
  // the first choice is the table's own penalty: drinking, or whatever the host set instead
  const pen = usePenaltyText();
  const zh = lang === "zh";
  const seg = <K extends keyof Config>(key: K, options: { value: Config[K]; label: string }[], cls = "") => (
    <div className={`seg ${cls}`} role="group">
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
        { value: "classic", label: zh ? "名场面" : "Famous scenes" },
        { value: "read", label: zh ? "朗读" : "Read aloud" },
      ], "dm-modes")}
      {cfg.mode === "classic" && (
        <>
          <span className="field-label">{zh ? "演哪边的片子" : "Which films"}</span>
          {seg("cset", [
            { value: "zh", label: zh ? CSET_NAME.zh.zh : CSET_NAME.zh.en },
            { value: "en", label: zh ? CSET_NAME.en.zh : CSET_NAME.en.en },
          ])}
        </>
      )}
      {cfg.mode === "read" && (
        <>
          <span className="field-label">{zh ? "读哪一套" : "Which set"}</span>
          {seg("rset", [
            { value: "zh", label: zh ? RSET_NAME.zh.zh : RSET_NAME.zh.en },
            { value: "en", label: zh ? RSET_NAME.en.zh : RSET_NAME.en.en },
            { value: "both", label: zh ? RSET_NAME.both.zh : RSET_NAME.both.en },
          ])}
        </>
      )}
      <span className="field-label">{zh ? "尺度" : "Spice"}</span>
      {seg("level", [
        { value: "all", label: zh ? "全年龄" : "All ages" },
        { value: "spicy", label: zh ? "微辣" : "Spicy" },
      ])}
      {cfg.mode !== "classic" && cfg.mode !== "read" && (
        <>
          <span className="field-label">{zh ? "难度" : "Difficulty"}</span>
          {seg("diff", [
            { value: "easy", label: zh ? "简单" : "Easy" },
            { value: "hard", label: zh ? "困难" : "Hard" },
          ])}
        </>
      )}
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
      {cfg.mode === "show" && GROUPS_ON.length > 0 && <GroupPicker picked={cfg.groups ?? []} onChange={(groups) => onChange({ groups })} disabled={disabled} />}
      {cfg.mode === "read" && <KindPicker picked={cfg.rkinds ?? []} onChange={(rkinds) => onChange({ rkinds })} disabled={disabled} />}
    </div>
  );
}

/**
 * Which kinds of reading: any of the ten. None picked, all of them take turns; some picked, only
 * those. A guest sees what the host picked.
 */
function KindPicker({ picked, onChange, disabled }: { picked: string[]; onChange: (kinds: NonNullable<Config["rkinds"]>) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const name = (x: (typeof READ_KINDS)[number]) => (zh ? x.name.zh : x.name.en);
  const on = READ_KINDS.filter((x) => picked.includes(x.key));
  return (
    <>
      <span className="field-label" id="dm-kinds-label">
        {zh ? "读哪几类" : "Which kinds"}
      </span>
      {disabled ? (
        <p className="dm-groups-read dm-kinds-read">{on.length ? on.map(name).join(zh ? "、" : ", ") : zh ? "全部" : "All of them"}</p>
      ) : (
        <div className="dm-groups dm-kinds" role="group" aria-labelledby="dm-kinds-label">
          {READ_KINDS.map((x) => (
            <Pill
              key={x.key}
              kind="toggle"
              tone="accent"
              selected={picked.includes(x.key)}
              onToggle={(sel) => onChange(READ_KINDS.map((y) => y.key).filter((k) => (k === x.key ? sel : picked.includes(k))))}
            >
              {name(x)}
            </Pill>
          ))}
        </div>
      )}
      <p className="dm-groups-hint">{zh ? "不选就是全部，每一类轮流来。选了的就只读这几类。" : "Pick none and they all take turns. Pick some and only those come up."}</p>
    </>
  );
}

/**
 * Whose stories come first: any of the groups with scenes of their own. None picked, everyone's
 * scenes only; some picked, theirs first and everyone's fill in. A guest sees what the host picked.
 */
function GroupPicker({ picked, onChange, disabled }: { picked: string[]; onChange: (groups: NonNullable<Config["groups"]>) => void; disabled?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const name = (x: (typeof GROUPS)[number]) => (zh ? x.name.zh : x.name.en);
  const on = GROUPS_ON.filter((x) => picked.includes(x.key));
  return (
    <>
      <span className="field-label" id="dm-groups-label">
        {zh ? "剧本背景" : "Whose stories"}
      </span>
      {disabled ? (
        <p className="dm-groups-read">{on.length ? on.map(name).join(zh ? "、" : ", ") : zh ? "通用" : "Anyone's"}</p>
      ) : (
        <div className="dm-groups" role="group" aria-labelledby="dm-groups-label">
          {GROUPS_ON.map((x) => (
            <Pill
              key={x.key}
              kind="toggle"
              tone="accent"
              selected={picked.includes(x.key)}
              onToggle={(sel) => onChange(GROUPS_ON.map((y) => y.key).filter((k) => (k === x.key ? sel : picked.includes(k))))}
            >
              {name(x)}
            </Pill>
          ))}
        </div>
      )}
      <p className="dm-groups-hint">
        {zh ? "不选就是通用的剧本。选了的先演，不够的时候用通用的补。" : "Pick none for everyone's stories. Pick some and theirs come first, with everyone's filling in."}
      </p>
    </>
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
      <p>每一幕开始前，每个人选「我要上台」「都行」或「我只看」。剧本按上台的人数来分，一个人到八个人都有；没人报名时，从选「都行」的人里随机抽几个上台。</p>
      <p>每个演员会拿到一张只有自己能看的身份牌：自己的角色、一个小秘密和一个秘密任务。其中一个人偷偷是「坏人」（小三、凶手、内鬼……），他的牌上写着他干了什么。一个人上台时是独角戏：台上的人藏着三个秘密里的一个，观众猜是哪一个。</p>
      <p>演到一半会弹出一个剧情反转。演完以后，观众先猜谁是坏人，再给每个演员的演技打 1 到 5 星。没人当观众时，演员互相猜、互相打星，不能投自己。</p>
      <p>人少也能玩：桌上不到三个人时，每一幕都是独角戏，一个人演，其他人猜。只有一个人时只演独角戏和朗读，屋里的人一起喊答案，主人点揭晓，不计分。</p>
      <p>计分：猜对 +1；没被多数人认出来的坏人 +3；每个演员加平均星数。受罚：星最少的演员；坏人被认出来就一起罚，没被认出来，被他骗了的观众受罚。星最多的拿下本幕最佳演员。</p>
      <p>演技 PK：两个人用不同的状态说同一句台词，观众打分，分低的受罚。</p>
      <p>剧本背景：主人可以选几个人群（中国、加拿大、南亚、菲律宾……），选了的人群的剧本先演，不够时用通用的补。</p>
      <p>名场面：主人选中文影视还是英文影视，上台的人照着有名的电影、电视剧片段演。牌上写着你演谁、怎么演、开口第一句，还能点开原片看看。观众打星，分低的受罚。</p>
      <p>朗读：每一幕一个人上台，照指定的读法读一段，比如带着哭腔读一封情书、一本正经地读一个第一人称的笑话、用大臣腔读一份奏折、看着一个人深情地读一段告白。主人选中文网络、英文网络还是中英通用的段子，也可以只选其中几类。读的人先默读一遍，开始读以后，大家手机上都能跟着看。读完观众打 1 到 5 星，平均不到 3 星的受罚；憋笑那一类，笑出声就只能拿 1 星。全场都给 5 星，拿下本幕最佳。</p>
    </>
  ) : (
    <>
      <p>Before each act, everyone picks “I'll act”, “Either way” or “Just watching”. The scene fits however many go up, from one to eight; with no volunteers, a few of the “Either way” crowd go up at random.</p>
      <p>Every actor gets a private card: their role, a little secret and a secret task. One of them is secretly the culprit (the homewrecker, the killer, the mole...), and their card says what they did. With one on stage, it's a monologue: the actor is hiding one of three secrets, and the audience guesses which.</p>
      <p>Halfway through, a plot twist lands. When the scene ends, the audience guesses the culprit, then gives every actor 1 to 5 stars. With nobody watching, the actors guess and rate each other, never themselves.</p>
      <p>A small table works too: with fewer than three, every act is a monologue, one acting and the rest guessing. On your own you play monologues and readings: the room shouts its guesses, the host reveals the answer, and nobody scores.</p>
      <p>Points: a right guess +1; a culprit most people miss +3; every actor gets their average stars. Penalty: the actor with the fewest stars, plus the culprit if caught, or everyone the culprit fooled if not. Most stars wins best actor.</p>
      <p>Acting duel: two players say the same line in two different states; the audience scores, and the lower score pays.</p>
      <p>Whose stories: the host can pick some of the communities (Chinese, Canadian, South Asian, Filipino...). Their scenes come first, and everyone's fill in when they run out.</p>
      <p>Famous scenes: the host picks Chinese or English film and TV, and the actors play a famous moment from it. Your card says who you play, how to play them and the line to open with, with a link to watch the original. The audience gives stars; the lowest score pays.</p>
      <p>Read aloud: each act, one person reads a piece the way it asks: a love letter through tears, a first-person joke with a straight face, a royal memorial in a courtier's voice, a confession from the heart. The host picks pieces from the Chinese internet, the English internet or ones that work for both, and can keep only some of the kinds. The reader reads it over first; once they start, everyone can follow along on their phones. Then the audience gives 1 to 5 stars, and an average under 3 pays. In the straight-face kind, a laugh out loud gets one star. Five stars from everyone takes best of the act.</p>
    </>
  );
}
