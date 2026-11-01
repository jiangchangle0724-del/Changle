import { Camera, Check, ImagePlus, LockKeyhole, RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiTitle } from "../../components/TopBar";
import { api, ApiError } from "../../lib/api";
import { gsap, reduced } from "../../lib/anim";
import {
  BACKDROPS,
  BUILDS,
  CLOTH_COLORS,
  CLOTH_SWATCH,
  DEFAULT_CHOICES,
  EVERYDAY,
  EXTRAS,
  GLASSES,
  HAIR_COLORS,
  HAIR_SWATCH,
  HAIRS,
  HATS,
  HEIGHTS,
  LIMITED,
  OUTFITS,
  STYLES,
  TRADITIONAL,
  type Choice,
  type Choices,
} from "../../shared/draw";
import { useStore } from "../../store";
import { useAccount } from "../AccountContext";
import { b64ToBlob, blobToB64, finishFigure, photoForDrawing } from "./pics";

/** The maker belongs to "me": the room's rose light. */
const ROSE = "#ff9cc5";

/** A drawing the player chose: the whole figure, its round crop, the figure alone (for the games' stages), and what they picked. */
export type Drawn = { full: Blob; round: Blob; cut: Blob | null; choices: Choices };

type Drawing = { blob: Blob; url: string; choices: Choices };
type Tab = "style" | "hair" | "outfit" | "extras" | "backdrop";

const TABS: { id: Tab; zh: string; en: string }[] = [
  { id: "style", zh: "风格", en: "Style" },
  { id: "hair", zh: "发型", en: "Hair" },
  { id: "outfit", zh: "穿搭", en: "Clothes" },
  { id: "extras", zh: "配饰", en: "Extras" },
  { id: "backdrop", zh: "底色", en: "Backdrop" },
];

const same = (a: Choices, b: Choices) => JSON.stringify(a) === JSON.stringify(b);

function sorry(e: unknown, zh: boolean): string {
  const code = e instanceof ApiError ? e.code : "network";
  const say: Record<string, [string, string]> = {
    month: ["这个月的 AI 头像做过了，下个月 1 号再来。", "That's this month's AI avatar. Come back on the 1st."],
    limit: ["这个网络今天画得太多了，明天再来。", "Lots of drawing from this network today. Try tomorrow."],
    closed: ["今天大家画得太多了，明天再来。", "Everyone's drawn a lot today. Come back tomorrow."],
    paused: ["网站暂停中，过一会儿再来。", "The site is paused. Come back in a while."],
    banned: ["这个账号已被停用。", "This account has been blocked."],
    locked: ["这套是许愿成真的限定款：你许的愿上线后解锁。", "That's a limited outfit: it unlocks when a game you wished for goes live."],
    "not-ready": ["AI 画头像还没开通。", "AI avatars aren't switched on yet."],
    blocked: ["这张照片 AI 画不了，换一张试试。", "The AI won't draw this photo. Try another."],
    busy: ["AI 现在太忙，过一会儿再试。", "The AI is busy. Try again in a moment."],
    signin: ["登录过期了，重新登录再画。", "You've been signed out. Sign in and try again."],
    size: ["这张照片太大了，换一张试试。", "That photo is too big. Try another."],
    network: ["网不好，没连上，再试一次。", "Couldn't connect. Try again."],
  };
  const s = say[code] ?? ["没画出来，再试一次。", "That didn't work. Try again."];
  return zh ? s[0] : s[1];
}

/**
 * Make an anime avatar: an AI draws you from a photo as a chibi figure, in the style, hair,
 * clothes and extras you pick. Full screen, over whatever opened it (sign-up, the profile editor).
 */
export function AvatarMaker({
  open,
  ticket,
  figureUrl,
  choices,
  backdrop,
  style,
  onDone,
  onClose,
}: {
  open: boolean;
  /** a sign-up in progress (no account yet) */
  ticket?: string;
  /** the figure you have now: drawings start from it until you add a new photo */
  figureUrl?: string | null;
  /** what you picked for it */
  choices?: Choices | null;
  /** your avatar color, the first backdrop */
  backdrop: number;
  /** from your profile's gender */
  style: string;
  onDone: (d: Drawn) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [round, setRound] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (open) {
      closing.current = false;
      if (!mounted) setRound((r) => r + 1);
      setMounted(true);
    } else if (mounted && !closing.current) {
      closing.current = true;
      const done = () => {
        closing.current = false;
        setMounted(false);
      };
      if (reduced() || !root.current) return done();
      gsap.to(root.current, { opacity: 0, y: 24, duration: 0.26, ease: "power2.in", onComplete: done });
    }
  }, [open, mounted]);

  useLayoutEffect(() => {
    if (!mounted || !open || !root.current) return;
    root.current.focus({ preventScroll: true });
    if (reduced()) return;
    gsap.fromTo(root.current, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55, ease: "expo.out" });
  }, [mounted, open]);

  if (!mounted) return null;
  const start: Choices = { ...DEFAULT_CHOICES, style, backdrop, ...(choices ?? {}) };
  return createPortal(
    <div ref={root} className="mk" role="dialog" aria-modal="true" aria-labelledby="mk-title" tabIndex={-1} style={{ ["--gel" as string]: ROSE }}>
      <Body key={round} ticket={ticket} figureUrl={figureUrl ?? null} start={start} onDone={onDone} onClose={onClose} />
    </div>,
    document.body,
  );
}

function Body({ ticket, figureUrl, start, onDone, onClose }: { ticket?: string; figureUrl: string | null; start: Choices; onDone: (d: Drawn) => void; onClose: () => void }) {
  const { lang } = useStore();
  const { me } = useAccount();
  const zh = lang === "zh";
  // the limited outfits: the wishlist's reward (admins try them out)
  const unlocked = !!me && (!!me.perks?.includes("wish") || me.admin);
  const [ch, setCh] = useState<Choices>(start);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [sel, setSel] = useState(-1);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // drawings left this month: undefined until asked, null for no limit (the owner)
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [per, setPer] = useState(6);
  const [mode, setMode] = useState<"photo" | "edit" | "saved">("photo");
  const [tab, setTab] = useState<Tab>("style");
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const art = useRef<HTMLImageElement>(null);
  const fresh = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const chNow = useRef(ch);
  chNow.current = ch;

  useEffect(
    () => () => {
      abort.current?.abort();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  const keep = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urls.current.push(u);
    return u;
  };

  // how many drawings this month's go has left, before anyone takes a photo
  useEffect(() => {
    let gone = false;
    void api<{ left: number | null; per: number }>("/avatar/allowance", { body: { ticket } }).then(
      (r) => {
        if (gone) return;
        setLeft(r.left);
        setPer(r.per);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [ticket]);
  const spent = left === 0;

  // what the next drawing starts from: a new photo, or the figure you have
  const from: "photo" | "figure" | null = photo ? "photo" : figureUrl ? "figure" : null;
  const shown = sel >= 0 ? drawings[sel] : null;
  const canUse = !!shown && same(shown.choices, ch) && busy === null;
  const dirty = drawings.length > 0;

  const requestClose = useCallback(() => (dirty ? setLeaving(true) : onClose()), [dirty, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (leaving) setLeaving(false);
      else requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [leaving, requestClose]);

  const draw = async (src?: { blob: Blob; kind: "photo" | "figure" }) => {
    if (abort.current || spent) return;
    setErr(null);
    const asked = chNow.current;
    // What the drawing starts from. A new photo; or, when you changed what you picked while
    // looking at a drawing, that drawing (the same character, changed only as asked); or your
    // photo again; or, with no photo this time, the figure you chose before (the server has it,
    // nothing to fetch and send back).
    let pic: { blob: Blob; kind: "photo" | "figure" } | null = src ?? null;
    let how: "photo" | "edit" | "saved" = "photo";
    try {
      if (!pic && shown && !same(shown.choices, asked)) {
        pic = { blob: await photoForDrawing(shown.blob), kind: "figure" };
        how = "edit";
      } else if (!pic && photo) pic = { blob: photo.blob, kind: "photo" };
    } catch {
      setErr(zh ? "这张图打不开，再试一次。" : "That picture didn't open. Try again.");
      return;
    }
    if (!pic && !figureUrl) return;
    if (!pic) how = "saved";
    const ac = new AbortController();
    abort.current = ac;
    setMode(how);
    setBusy(performance.now());
    try {
      const body = pic ? { image: await blobToB64(pic.blob), mime: pic.blob.type || "image/jpeg", from: pic.kind, choices: asked, ticket } : { from: "saved", choices: asked, ticket };
      const r = await api<{ image: string; mime: string; left: number | null }>("/avatar/draw", { body, signal: ac.signal });
      const blob = b64ToBlob(r.image, r.mime);
      const d = { blob, url: keep(blob), choices: asked };
      fresh.current = true;
      setDrawings((xs) => [...xs, d]);
      setSel(count.current++);
      setLeft(r.left);
    } catch (e) {
      if (!ac.signal.aborted) setErr(sorry(e, zh));
      // a failed drawing says what is left (it was given back), and "this month's is done" means none
      if (e instanceof ApiError && e.code === "month") setLeft(0);
    } finally {
      if (abort.current === ac) {
        abort.current = null;
        setBusy(null);
      }
    }
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const blob = await photoForDrawing(f);
      setPhoto({ blob, url: keep(blob) });
      setSel(-1);
      // the first drawing straight away, as the photo is
      void draw({ blob, kind: "photo" });
    } catch {
      setErr(zh ? "这张照片打不开，换一张试试。" : "That photo didn't open. Try another.");
    }
  };

  const use = async () => {
    if (!shown || saving) return;
    setSaving(true);
    try {
      const { full, round, cut } = await finishFigure(shown.blob);
      onDone({ full, round, cut, choices: shown.choices });
    } catch {
      setErr(zh ? "没存上，再试一次。" : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // a new drawing develops in place, like a photo coming up in the tray
  useLayoutEffect(() => {
    if (!fresh.current || !art.current || reduced()) return;
    fresh.current = false;
    gsap.fromTo(
      art.current,
      { opacity: 0, scale: 1.03, filter: "brightness(1.9) saturate(0.4) blur(6px)" },
      { opacity: 1, scale: 1, filter: "brightness(1) saturate(1) blur(0px)", duration: 1.1, ease: "power2.out", clearProps: "filter" },
    );
  }, [sel, drawings.length]);

  useLayoutEffect(() => panel.current?.scrollTo({ top: 0 }), [tab]);

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => void pickFile(e)} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e)} />
    </>
  );
  const promise = (
    <p className="mk-private">
      <LockKeyhole size={14} aria-hidden="true" />
      {zh ? "照片会发给 Google 的 AI 照着画，画完不保存。只用你自己的照片。" : "Your photo goes to Google's AI to draw from, and isn't kept. Use a photo of yourself."}
    </p>
  );
  const leave = leaving && <Leave zh={zh} onStay={() => setLeaving(false)} onLeave={onClose} />;
  const top = (title: boolean) => (
    <header className="mk-top">
      <button className="icon-btn" onClick={requestClose} aria-label={zh ? "关闭" : "Close"}>
        <X size={22} />
      </button>
      {title ? (
        <h2 id="mk-title" className="mk-title">
          <BiTitle name={{ zh: "AI 画头像", en: "AI avatar" }} size="sm" />
        </h2>
      ) : (
        <span />
      )}
      <span />
    </header>
  );

  // ---- first: a photo ----
  if (!from)
    return (
      <div className="mk-in">
        {inputs}
        {top(false)}
        <div className="mk-start">
          <button className="mk-slot" onClick={() => camera.current?.click()} aria-label={zh ? "拍一张照片" : "Take a photo"}>
            <span className="mk-slot-card">
              <Camera size={34} aria-hidden="true" />
              <span>{zh ? "正脸，光线亮，只有你一个人" : "Facing the camera, in good light, just you"}</span>
            </span>
          </button>
          <div className="mk-start-copy">
            <h2 id="mk-title">
              <BiTitle name={{ zh: "AI 画你的动漫头像", en: "Your anime avatar" }} size="md" align="left" />
            </h2>
            <p className="hint">
              {zh
                ? "拍一张正脸照，AI 照着你的样子画一个 Q 版全身形象。风格、发型、穿搭、配饰都能挑。"
                : "Take a photo and an AI draws you as a chibi anime figure. Pick the style, hair, clothes and extras."}
            </p>
            {left !== null && left !== undefined && <MonthNote left={left} per={per} zh={zh} />}
          </div>
          <div className="mk-start-acts">
            <button className="btn btn-primary btn-lg btn-block" disabled={spent} onClick={() => camera.current?.click()}>
              <Camera size={20} /> {zh ? "拍一张照片" : "Take a photo"}
            </button>
            <button className="btn btn-quiet btn-block" disabled={spent} onClick={() => library.current?.click()}>
              <ImagePlus size={19} /> {zh ? "从相册选" : "Choose a photo"}
            </button>
            {err && <p className="form-error">{err}</p>}
            {promise}
          </div>
        </div>
        {leave}
      </div>
    );

  // ---- then: draw, look, change, draw again ----
  const source = photo ? { url: photo.url, label: zh ? "你的照片" : "Your photo" } : { url: figureUrl!, label: zh ? "现在的头像" : "Your avatar now" };
  const bd = BACKDROPS[ch.backdrop]?.hex ?? BACKDROPS[0].hex;
  const keepWord = from === "photo" ? null : zh ? "保持现在的" : "Keep as is";
  return (
    <div className="mk-in">
      {inputs}
      {top(true)}
      <div className="mk-stage" style={{ ["--bd" as string]: bd }}>
        <div className="mk-spot" aria-hidden="true" />
        <figure className={`mk-card ${shown ? "is-art" : "is-source"} ${busy !== null ? "is-busy" : ""}`}>
          {shown ? <img ref={art} key={shown.url} src={shown.url} alt={zh ? "AI 画的你" : "You, drawn by AI"} /> : <img src={source.url} alt="" />}
          {!shown && busy === null && <figcaption className="mk-card-tag">{source.label}</figcaption>}
          {busy !== null && <DrawingNow t0={busy} zh={zh} mode={mode} />}
        </figure>
        {(drawings.length > 0 || photo) && (
          <div className="mk-strip" role="group" aria-label={zh ? "画过的" : "Drawings"}>
            <button className={`mk-thumb ${sel < 0 ? "is-on" : ""}`} onClick={() => setSel(-1)} aria-label={source.label} aria-pressed={sel < 0}>
              <img src={source.url} alt="" />
            </button>
            {drawings.map((d, i) => (
              <button
                key={d.url}
                className={`mk-thumb ${sel === i ? "is-on" : ""}`}
                onClick={() => {
                  // (a drawing brings back what it was drawn with, so it can be used as it is)
                  setSel(i);
                  setCh(d.choices);
                }}
                aria-label={zh ? `第 ${i + 1} 张` : `Drawing ${i + 1}`}
                aria-pressed={sel === i}
              >
                <img src={d.url} alt="" />
              </button>
            ))}
            <button className="mk-thumb mk-thumb-add" onClick={() => library.current?.click()} aria-label={zh ? "换一张照片" : "Use another photo"} disabled={busy !== null || spent}>
              <ImagePlus size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="mk-dock">
        <div className="mk-tabs" role="tablist" aria-label={zh ? "分类" : "Parts"}>
          {TABS.map((t) => (
            <button key={t.id} id={`mk-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="mk-panel" className="mk-tab" onClick={() => setTab(t.id)}>
              {zh ? t.zh : t.en}
            </button>
          ))}
        </div>
        <div ref={panel} id="mk-panel" className="mk-panel" role="tabpanel" aria-labelledby={`mk-tab-${tab}`}>
          <Choose tab={tab} ch={ch} set={(p) => setCh((c) => ({ ...c, ...p }))} zh={zh} keepWord={keepWord} unlocked={unlocked} />
        </div>
        <div className="mk-foot">
          {err && (
            <p className="form-error mk-err" role="alert">
              {err}
            </p>
          )}
          {canUse ? (
            <div className="mk-acts">
              <button className="btn btn-quiet" disabled={spent} onClick={() => void draw()}>
                <RefreshCw size={17} /> {zh ? "再画一张" : "Draw again"}
              </button>
              <button className="btn btn-primary" onClick={() => void use()} disabled={saving}>
                <Check size={19} /> {zh ? "就用这个" : "Use this one"}
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => void draw()} disabled={busy !== null || spent}>
              <Sparkles size={18} />
              {busy !== null ? (zh ? "正在画" : "Drawing") : shown ? (zh ? "按新选择改一张" : "Change it") : drawings.length ? (zh ? "按新选择画一张" : "Draw with these") : zh ? "AI 画一张" : "Draw me"}
            </button>
          )}
          {left !== null && left !== undefined && <MonthNote left={left} per={per} zh={zh} />}
        </div>
      </div>
      {leave}
    </div>
  );
}

/** This month's go: how many drawings are left, or that it's used up. */
function MonthNote({ left, per, zh }: { left: number; per: number; zh: boolean }) {
  if (left <= 0) return <p className="mk-left">{zh ? "这个月的 AI 头像做过了，下个月 1 号再来。" : "You've made this month's AI avatar. Come back on the 1st."}</p>;
  return (
    <p className="mk-left tabular">
      {zh ? `每月一次：这个月还能画 ${left} 张（共 ${per} 张），选好一张就算用完` : `Once a month: ${left} of ${per} drawings left, and choosing one uses it up`}
    </p>
  );
}

/** While the AI draws: light passes over the picture, and the seconds count up honestly. */
function DrawingNow({ t0, zh, mode }: { t0: number; zh: boolean; mode: "photo" | "edit" | "saved" }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setS(Math.floor((performance.now() - t0) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [t0]);
  // most drawings take 10 to 20 seconds: the bar runs toward the end without ever reaching it
  const p = 1 - Math.exp(-s / 9);
  return (
    <div className="mk-drawing" role="status" aria-live="polite">
      <span className="mk-beam" aria-hidden="true" />
      <div className="mk-drawing-note">
        <span>{mode === "photo" ? (zh ? "AI 正在照着你的照片画" : "Drawing you from your photo") : mode === "edit" ? (zh ? "AI 正在按你选的改" : "Changing what you picked") : zh ? "AI 正在重画" : "Redrawing"}</span>
        <span className="tabular">{zh ? `${s} 秒` : `${s}s`}</span>
      </div>
      <span className="mk-progress" style={{ transform: `scaleX(${0.04 + p * 0.9})` }} aria-hidden="true" />
    </div>
  );
}

function Chips({
  list,
  value,
  onPick,
  zh,
  keepWord,
  only,
}: {
  list: Choice[];
  value: string;
  onPick: (id: string) => void;
  zh: boolean;
  keepWord?: string | null;
  only?: string[];
}) {
  const items = only ? list.filter((o) => only.includes(o.id)) : list;
  return (
    <div className="mk-chips">
      {items.map((o) => (
        <button key={o.id} className="chip" aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
          {o.id === "keep" && keepWord ? keepWord : zh ? o.zh : o.en}
        </button>
      ))}
    </div>
  );
}

function Dots({
  list,
  swatch,
  value,
  onPick,
  zh,
  keepWord,
  first,
}: {
  list: Choice[];
  swatch: Record<string, string>;
  value: string;
  onPick: (id: string) => void;
  zh: boolean;
  keepWord?: string | null;
  first: string;
}) {
  const lead = list.find((o) => o.id === first)!;
  return (
    <div className="mk-colors">
      <button className="chip chip-sm mk-color-word" aria-pressed={value === first} onClick={() => onPick(first)}>
        {first === "keep" && keepWord ? keepWord : zh ? lead.zh : lead.en}
      </button>
      {list
        .filter((o) => o.id !== first)
        .map((o) => (
          <button key={o.id} className="mk-color" aria-pressed={value === o.id} aria-label={zh ? o.zh : o.en} onClick={() => onPick(o.id)}>
            <span style={{ background: swatch[o.id] }} />
          </button>
        ))}
    </div>
  );
}

function Choose({ tab, ch, set, zh, keepWord, unlocked }: { tab: Tab; ch: Choices; set: (p: Partial<Choices>) => void; zh: boolean; keepWord: string | null; unlocked: boolean }) {
  const label = (z: string, e: string) => <h3 className="mk-label">{zh ? z : e}</h3>;
  const outfits = useMemo(() => OUTFITS.filter((o) => o.id !== "keep"), []);
  if (tab === "style")
    return (
      <>
        {label("画成", "Draw me as")}
        <Chips list={STYLES} value={ch.style} onPick={(style) => set({ style })} zh={zh} keepWord={keepWord} />
        {label("身高", "Height")}
        <Chips list={HEIGHTS} value={ch.height} onPick={(height) => set({ height })} zh={zh} />
        {label("体型", "Build")}
        <Chips list={BUILDS} value={ch.build} onPick={(build) => set({ build })} zh={zh} />
      </>
    );
  if (tab === "hair")
    return (
      <>
        {label("发型", "Hairstyle")}
        <Chips list={HAIRS} value={ch.hair} onPick={(hair) => set({ hair })} zh={zh} keepWord={keepWord} />
        {label("发色", "Hair color")}
        <Dots list={HAIR_COLORS} swatch={HAIR_SWATCH} value={ch.hairColor} first="keep" onPick={(hairColor) => set({ hairColor })} zh={zh} keepWord={keepWord} />
      </>
    );
  if (tab === "outfit")
    return (
      <>
        <div className="mk-chips mk-chips-lead">
          <button className="chip" aria-pressed={ch.outfit === "keep"} onClick={() => set({ outfit: "keep" })}>
            {keepWord ?? (zh ? "照片里穿的" : "What I'm wearing")}
          </button>
        </div>
        {label("潮流", "Everyday")}
        <Chips list={outfits} only={EVERYDAY} value={ch.outfit} onPick={(outfit) => set({ outfit })} zh={zh} />
        {label("各地传统服饰", "Traditional dress")}
        <Chips list={outfits} only={TRADITIONAL} value={ch.outfit} onPick={(outfit) => set({ outfit })} zh={zh} />
        {label("限量款：许愿成真奖励", "Limited: the wishlist's reward")}
        {!unlocked && <p className="hint mk-sub">{zh ? "你在心愿单许的游戏上线后解锁。" : "Unlocks when a game you wished for goes live."}</p>}
        <div className={`mk-chips mk-limited ${unlocked ? "" : "is-locked"}`}>
          {outfits
            .filter((o) => LIMITED.includes(o.id))
            .map((o) => (
              <button key={o.id} className="chip" aria-pressed={ch.outfit === o.id} disabled={!unlocked} onClick={() => set({ outfit: o.id })}>
                {!unlocked && <LockKeyhole size={13} aria-hidden="true" />}
                {zh ? o.zh : o.en}
              </button>
            ))}
        </div>
        {label("主色", "Main color")}
        <Dots list={CLOTH_COLORS} swatch={CLOTH_SWATCH} value={ch.outfitColor} first="auto" onPick={(outfitColor) => set({ outfitColor })} zh={zh} />
      </>
    );
  if (tab === "extras")
    return (
      <>
        {label("帽子和头饰", "Hats")}
        <Chips list={HATS} value={ch.hat} onPick={(hat) => set({ hat })} zh={zh} />
        {label("眼镜", "Glasses")}
        <Chips list={GLASSES} value={ch.glasses} onPick={(glasses) => set({ glasses })} zh={zh} keepWord={keepWord} />
        {label("小配饰（可多选）", "Extras (pick any)")}
        <div className="mk-chips">
          {EXTRAS.map((o) => {
            const on = ch.extras.includes(o.id);
            return (
              <button key={o.id} className="chip" aria-pressed={on} onClick={() => set({ extras: on ? ch.extras.filter((x) => x !== o.id) : [...ch.extras, o.id] })}>
                {on && <Check size={15} aria-hidden="true" />}
                {zh ? o.zh : o.en}
              </button>
            );
          })}
        </div>
      </>
    );
  return (
    <>
      {label("画的底色", "Backdrop")}
      <p className="hint mk-sub">{zh ? "也是你圆头像的底色。" : "Also the color behind your round avatar."}</p>
      <div className="mk-colors">
        {BACKDROPS.slice(0, 10).map((b, i) => (
          <button key={b.hex} className="mk-color" aria-pressed={ch.backdrop === i} aria-label={`${zh ? "底色" : "Backdrop"} ${i + 1}`} onClick={() => set({ backdrop: i })}>
            <span style={{ background: b.hex }} />
          </button>
        ))}
      </div>
    </>
  );
}

function Leave({ zh, onStay, onLeave }: { zh: boolean; onStay: () => void; onLeave: () => void }) {
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => stay.current?.focus(), []);
  return (
    <div className="mk-leave-back" onClick={onStay}>
      <div className="mk-leave" role="alertdialog" aria-labelledby="mk-leave-q" onClick={(e) => e.stopPropagation()}>
        <p id="mk-leave-q" className="mk-leave-q">
          {zh ? "画好的头像还没用上，不要了吗？" : "Leave without using your drawing?"}
        </p>
        <div className="mk-leave-acts">
          <button ref={stay} className="btn btn-primary" onClick={onStay}>
            {zh ? "继续挑" : "Keep going"}
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            {zh ? "不要了" : "Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
