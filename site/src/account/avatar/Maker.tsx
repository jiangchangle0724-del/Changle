import { Camera, Check, Dices, ImagePlus, LockKeyhole, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiTitle } from "../../components/TopBar";
import { gsap, reduced } from "../../lib/anim";
import { useStore } from "../../store";
import { HAIR_COLORS, preset, randomCfg, STARTS, type AvatarCfg, type Opt } from "../../shared/avatar/cfg";
import { figBox, renderAvatar } from "../../shared/avatar/render";
import { lastPts, lastRead, loadMatcher, matchPhoto, matcherReady, type Seen } from "./match";
import { GROUPS, TABS, restyle, type Group, type TabId, type Words } from "./options";
import { Scan, type ScanState } from "./Scan";

/** The maker belongs to "me": the room's rose light. */
const ROSE = "#ff9cc5";

const SEEN: Record<Seen, Words> = {
  skin: { zh: "肤色", en: "skin" },
  face: { zh: "脸型", en: "face shape" },
  eyes: { zh: "眼型", en: "eyes" },
  eyeColor: { zh: "瞳色", en: "eye color" },
  brows: { zh: "眉毛", en: "brows" },
  hair: { zh: "发型", en: "hairstyle" },
  fringe: { zh: "刘海", en: "fringe" },
  hairColor: { zh: "发色", en: "hair color" },
  glasses: { zh: "眼镜", en: "glasses" },
  beard: { zh: "胡子", en: "facial hair" },
};

const same = (a: AvatarCfg, b: AvatarCfg) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Make an anime avatar: start from a photo (read on the phone, never uploaded) or from a style,
 * then change anything, watching it on a lit stage. Full screen, over whatever opened it.
 */
export function AvatarMaker({
  open,
  initial,
  start = "x",
  onDone,
  onClose,
}: {
  open: boolean;
  /** the look so far (none: the maker starts by asking for a photo or a style) */
  initial?: AvatarCfg | null;
  /** which style to start from when there's no look yet */
  start?: AvatarCfg["start"];
  onDone: (c: AvatarCfg) => void;
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
  return createPortal(
    <div ref={root} className="mk" role="dialog" aria-modal="true" aria-labelledby="mk-title" tabIndex={-1} style={{ ["--gel" as string]: ROSE }}>
      <Body key={round} initial={initial ?? null} start={start} onDone={onDone} onClose={onClose} />
    </div>,
    document.body,
  );
}

type Found = { seen: Seen[] };

function Body({ initial, start, onDone, onClose }: { initial: AvatarCfg | null; start: AvatarCfg["start"]; onDone: (c: AvatarCfg) => void; onClose: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const say = (w: Words) => (zh ? w.zh : w.en);

  const [cfg, setCfg] = useState<AvatarCfg>(() => initial ?? preset(start));
  const [past, setPast] = useState<AvatarCfg[]>([]);
  const [phase, setPhase] = useState<"start" | "edit">(initial ? "edit" : "start");
  const [tab, setTab] = useState<TabId>(initial ? "face" : "photo");
  const [scan, setScan] = useState<ScanState | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [leaving, setLeaving] = useState(false);
  const cfgNow = useRef(cfg);
  cfgNow.current = cfg;
  const matched = useRef<{ cfg: AvatarCfg; found: Found } | null>(null);
  const photoUrl = useRef<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const fig = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dice = useRef<HTMLSpanElement>(null);
  const arrive = useRef(false);

  useEffect(() => () => void (photoUrl.current && URL.revokeObjectURL(photoUrl.current)), []);

  const apply = useCallback((next: AvatarCfg) => {
    const now = cfgNow.current;
    if (same(now, next)) return;
    setPast((p) => [...p.slice(-59), now]);
    setCfg(next);
  }, []);

  const undo = () => {
    if (!past.length) return;
    setCfg(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };

  const shuffle = () => {
    if (dice.current && !reduced()) gsap.fromTo(dice.current, { rotation: 0 }, { rotation: 360, duration: 0.55, ease: "settle" });
    setScan(null);
    apply({ ...randomCfg(cfgNow.current.start), skin: cfgNow.current.skin });
  };

  const dirty = initial ? !same(cfg, initial) : phase === "edit";
  const requestClose = useCallback(() => (dirty ? setLeaving(true) : onClose()), [dirty, onClose]);

  // Escape closes this (and not the sheet underneath)
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

  // ---- the photo ----
  const readPhoto = async (file: File) => {
    setPhase("edit");
    setTab("photo");
    setFound(null);
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    const url = URL.createObjectURL(file);
    photoUrl.current = url;
    setScan(matcherReady() ? { stage: "read", photo: url } : { stage: "load", photo: url, progress: 0 });
    try {
      const m = await loadMatcher((p) => setScan((s) => (s && s.stage === "load" && s.photo === url ? { ...s, progress: p } : s)));
      if (photoUrl.current !== url) return;
      setScan({ stage: "read", photo: url });
      const [r] = await Promise.all([matchPhoto(m, file), wait(reduced() ? 0 : 1100)]);
      if (photoUrl.current !== url) return;
      if (r.note === "no-face" || !lastRead) {
        setScan({ stage: "fail", photo: url, why: "no-face" });
        return;
      }
      matched.current = { cfg: { ...cfgNow.current, ...r.cfg }, found: { seen: r.seen } };
      setScan({ stage: "mesh", photo: url, pic: lastRead, pts: lastPts });
    } catch {
      if (photoUrl.current === url) setScan({ stage: "fail", photo: url, why: "load" });
    }
  };

  const meshDone = useCallback(() => {
    const m = matched.current;
    matched.current = null;
    if (!m) return;
    arrive.current = true;
    apply(m.cfg);
    setFound(m.found);
    setScan(null);
  }, [apply]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void readPhoto(f);
  };

  // ---- the stage ----
  const live = useMemo(() => renderAvatar(cfg, { view: "full", id: "mk-live", live: true, label: zh ? "你的头像" : "Your avatar" }), [cfg, zh]);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const el = fig.current;
    if (!el) return;
    if (!shown.current || reduced()) {
      shown.current = true;
      arrive.current = false;
      return;
    }
    if (arrive.current) {
      arrive.current = false;
      gsap.fromTo(el, { opacity: 0, y: 18, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "expo.out", transformOrigin: "50% 100%" });
      return;
    }
    gsap.fromTo(el, { scaleX: 1.018, scaleY: 0.982 }, { scaleX: 1, scaleY: 1, duration: 0.42, ease: "settle", transformOrigin: "50% 100%", overwrite: true });
  }, [live, scan === null]);

  // a new tab starts at the top
  useLayoutEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    document.getElementById(`mk-tab-${tab}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  const fileInputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={pickFile} />
      <input ref={library} type="file" accept="image/*" hidden onChange={pickFile} />
    </>
  );
  const promise = (
    <p className="mk-private">
      <LockKeyhole size={14} aria-hidden="true" />
      {zh ? "照片只在你的手机上看，不会上传。" : "Your photo is read on your phone and never uploaded."}
    </p>
  );

  if (phase === "start")
    return (
      <div className="mk-in">
        {fileInputs}
        <header className="mk-top">
          <button className="icon-btn" onClick={requestClose} aria-label={zh ? "关闭" : "Close"}>
            <X size={22} />
          </button>
          <span />
          <span />
        </header>
        <div className="mk-start">
          <div className="mk-lineup">
            {STARTS.map((s) => (
              <StartFigure
                key={s.id}
                opt={s}
                zh={zh}
                onPick={() => {
                  apply(restyle(cfgNow.current, s.id));
                  setPhase("edit");
                  setTab("face");
                }}
              />
            ))}
          </div>
          <div className="mk-start-copy">
            <h2 id="mk-title">
              <BiTitle name={{ zh: "做你的头像", en: "Make your avatar" }} size="md" align="left" />
            </h2>
            <p className="hint">{zh ? "拍张照片，照着你的样子配；或者点上面一个，自己捏。" : "Take a photo and it's matched to you, or tap one above and make it yourself."}</p>
          </div>
          <div className="mk-start-acts">
            <button className="btn btn-primary btn-lg btn-block" onClick={() => camera.current?.click()}>
              <Camera size={20} /> {zh ? "拍一张照片" : "Take a photo"}
            </button>
            <button className="btn btn-quiet btn-block" onClick={() => library.current?.click()}>
              <ImagePlus size={19} /> {zh ? "从相册选" : "Choose a photo"}
            </button>
            {promise}
          </div>
        </div>
        {leaving && <Leave zh={zh} onStay={() => setLeaving(false)} onLeave={onClose} />}
      </div>
    );

  return (
    <div className="mk-in">
      {fileInputs}
      <header className="mk-top">
        <button className="icon-btn" onClick={requestClose} aria-label={zh ? "关闭" : "Close"}>
          <X size={22} />
        </button>
        <h2 id="mk-title" className="mk-title">
          <BiTitle name={{ zh: "做头像", en: "Your avatar" }} size="sm" />
        </h2>
        <div className="mk-top-right">
          <button className="icon-btn" onClick={undo} disabled={!past.length} aria-label={zh ? "撤销" : "Undo"}>
            <Undo2 size={20} />
          </button>
          <button className="icon-btn" onClick={shuffle} aria-label={zh ? "随机换一个" : "Surprise me"}>
            <span ref={dice} className="mk-dice">
              <Dices size={21} />
            </span>
          </button>
        </div>
      </header>

      <div className="mk-stage">
        <div className="mk-spot" aria-hidden="true" />
        {scan ? <Scan s={scan} zh={zh} onMeshDone={meshDone} /> : <div ref={fig} className="mk-fig" dangerouslySetInnerHTML={{ __html: live }} />}
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
          {tab === "photo" ? (
            <PhotoTab
              zh={zh}
              scan={scan}
              found={found}
              cfg={cfg}
              promise={promise}
              onCamera={() => camera.current?.click()}
              onLibrary={() => library.current?.click()}
              onBack={() => setScan(null)}
              onSkin={(i) => apply({ ...cfgNow.current, skin: i })}
              onGo={setTab}
            />
          ) : (
            GROUPS[tab].map((g, gi) =>
              g.hidden?.(cfg) ? null : (
                <GroupView
                  key={`${tab}${gi}`}
                  g={g}
                  gi={gi}
                  cfg={cfg}
                  say={say}
                  zh={zh}
                  onPick={(c) => {
                    setScan(null);
                    apply(c);
                  }}
                />
              ),
            )
          )}
        </div>
        <div className="mk-foot">
          <button className="btn btn-primary btn-block" onClick={() => onDone(cfg)} disabled={!!scan && scan.stage !== "fail"}>
            <Check size={19} /> {zh ? "就用这个" : "Use this look"}
          </button>
        </div>
      </div>
      {leaving && <Leave zh={zh} onStay={() => setLeaving(false)} onLeave={onClose} />}
    </div>
  );
}

function StartFigure({ opt, zh, onPick }: { opt: Opt; zh: boolean; onPick: () => void }) {
  const svg = useMemo(() => {
    const c = preset(opt.id as AvatarCfg["start"]);
    // (framed narrow: three stand side by side, as big as the width allows)
    const f = figBox(c);
    const box = { ...f, x: f.x + f.w * 0.17, w: f.w * 0.66 };
    return renderAvatar(c, { view: "full", box, id: `mk-start-${opt.id}`, anchor: "bottom" });
  }, [opt.id]);
  return (
    <button className="mk-start-fig" onClick={onPick}>
      <span className="mk-start-art" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="mk-start-name">{zh ? opt.zh : opt.en}</span>
    </button>
  );
}

function PhotoTab({
  zh,
  scan,
  found,
  cfg,
  promise,
  onCamera,
  onLibrary,
  onBack,
  onSkin,
  onGo,
}: {
  zh: boolean;
  scan: ScanState | null;
  found: Found | null;
  cfg: AvatarCfg;
  promise: React.ReactNode;
  onCamera: () => void;
  onLibrary: () => void;
  onBack: () => void;
  onSkin: (i: number) => void;
  onGo: (t: TabId) => void;
}) {
  const busy = !!scan && scan.stage !== "fail";
  const skinGroup = GROUPS.face[0] as Extract<Group, { kind: "colors" }>;
  return (
    <div className="mk-photo">
      {scan?.stage === "fail" && (
        <div className="mk-note">
          <p>
            {scan.why === "no-face"
              ? zh
                ? "换一张正脸、亮一点的照片试试，脸占画面大一些更好。"
                : "Try a brighter photo, facing the camera, with your face filling more of it."
              : zh
                ? "这里读不了照片。可以自己捏，或者换个浏览器再试。"
                : "Photos can't be read here. Make it yourself, or try another browser."}
          </p>
          <button className="link-btn" onClick={onBack}>
            {zh ? "回到我的头像" : "Back to my avatar"}
          </button>
        </div>
      )}
      {found && !scan && (
        <div className="mk-found">
          <p className="mk-found-head">
            <Check size={16} aria-hidden="true" />
            {zh ? "照着照片配好了" : "Matched to your photo"}
          </p>
          {found.seen.length > 0 && (
            <p className="hint">
              {zh ? "看出了" : "It read your "}
              {found.seen.map((s) => (zh ? SEEN[s].zh : SEEN[s].en)).join(zh ? "、" : ", ")}
              {zh ? "。" : "."}
            </p>
          )}
          <span className="mk-label">{zh ? "肤色对吗？" : "Is the skin tone right?"}</span>
          <Colors g={skinGroup} cfg={cfg} zh={zh} onPick={(c) => onSkin(c.skin)} />
          <p className="hint">
            {zh ? "别的不像，就到" : "Anything else off? Change it under "}
            <button className="link-btn mk-inline" onClick={() => onGo("hair")}>
              {zh ? "发型" : "Hair"}
            </button>
            {zh ? "、" : ", "}
            <button className="link-btn mk-inline" onClick={() => onGo("eyes")}>
              {zh ? "眼睛" : "Eyes"}
            </button>
            {zh ? "这些分类里改。" : " and the rest."}
          </p>
        </div>
      )}
      {!found && !scan && (
        <p className="hint mk-photo-lead">
          {zh
            ? "拍一张或者选一张正脸照片，照着你的肤色、脸型、眼睛和发型配一个。"
            : "Take or choose a photo facing the camera. Your skin, face shape, eyes and hair are matched from it."}
        </p>
      )}
      <div className="mk-photo-acts">
        <button className="btn btn-quiet" onClick={onCamera} disabled={busy}>
          <Camera size={19} /> {zh ? "拍一张" : "Take one"}
        </button>
        <button className="btn btn-quiet" onClick={onLibrary} disabled={busy}>
          <ImagePlus size={19} /> {zh ? "从相册选" : "Choose one"}
        </button>
      </div>
      {promise}
    </div>
  );
}

function GroupView({ g, gi, cfg, say, zh, onPick }: { g: Group; gi: number; cfg: AvatarCfg; say: (w: Words) => string; zh: boolean; onPick: (c: AvatarCfg) => void }) {
  return (
    <section className="mk-group">
      <h3 className="mk-label">{say(g.title)}</h3>
      {g.kind === "pics" && <Pics g={g} gi={gi} cfg={cfg} zh={zh} onPick={onPick} />}
      {g.kind === "colors" && <Colors g={g} cfg={cfg} zh={zh} onPick={onPick} />}
      {g.kind === "switches" && (
        <div className="mk-switches">
          {g.items.map((it) => (
            <button key={it.key} className="chip" aria-pressed={cfg[it.key]} onClick={() => onPick({ ...cfg, [it.key]: !cfg[it.key] })}>
              {cfg[it.key] && <Check size={15} aria-hidden="true" />}
              {zh ? it.zh : it.en}
            </button>
          ))}
        </div>
      )}
      {g.kind === "steps" && (
        <div className="seg mk-steps" role="group" aria-label={say(g.title)}>
          {g.options.map((o, i) => (
            <button key={i} aria-pressed={cfg[g.key] === i} onClick={() => onPick({ ...cfg, [g.key]: i as 0 | 1 | 2 })}>
              {say(o)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Pics({ g, gi, cfg, zh, onPick }: { g: Extract<Group, { kind: "pics" }>; gi: number; cfg: AvatarCfg; zh: boolean; onPick: (c: AvatarCfg) => void }) {
  const only = g.only?.(cfg);
  const opts = only ? g.options.filter((o) => only.includes(o.id)) : g.options;
  const items = useMemo(
    () =>
      opts.map((o) => {
        const v = g.pick ? g.pick(cfg, o.id) : ({ ...cfg, [g.key]: o.id } as AvatarCfg);
        const box = g.key === "outfit" ? figBox(v) : undefined;
        return { o, v, svg: renderAvatar(v, { view: g.view, box, id: `mk-${gi}-${g.key}-${o.id}` }) };
      }),
    [cfg, g, gi, opts],
  );
  return (
    <div className={`mk-pics cols-${g.cols} view-${g.view}`} role="group">
      {items.map(({ o, v, svg }) => (
        <button key={o.id} className="mk-pic" aria-pressed={cfg[g.key] === o.id} onClick={() => onPick(v)}>
          <span className="mk-pic-art" dangerouslySetInnerHTML={{ __html: svg }} />
          <span className="mk-pic-name">{zh ? o.zh : o.en}</span>
        </button>
      ))}
    </div>
  );
}

function Colors({ g, cfg, zh, onPick }: { g: Extract<Group, { kind: "colors" }>; cfg: AvatarCfg; zh: boolean; onPick: (c: AvatarCfg) => void }) {
  const name = zh ? g.title.zh : g.title.en;
  return (
    <div className={`mk-colors is-${g.style}`} role="group" aria-label={name}>
      {g.colors.map((c, i) => {
        const bg =
          g.style === "hair"
            ? `linear-gradient(150deg, ${HAIR_COLORS[i][2]} 0 16%, ${c} 44%, ${HAIR_COLORS[i][1]} 100%)`
            : g.style === "eye"
              ? `radial-gradient(circle at 50% 54%, #160d1c 0 23%, ${c} 25% 70%, color-mix(in oklab, ${c} 60%, #160d1c) 100%)`
              : c;
        return (
          <button key={i} className="mk-color" aria-pressed={cfg[g.key] === i} aria-label={`${name} ${i + 1}`} onClick={() => onPick({ ...cfg, [g.key]: i })}>
            <span style={{ background: bg }} />
          </button>
        );
      })}
    </div>
  );
}

function Leave({ zh, onStay, onLeave }: { zh: boolean; onStay: () => void; onLeave: () => void }) {
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => stay.current?.focus(), []);
  return (
    <div className="mk-leave-back" onClick={onStay}>
      <div className="mk-leave" role="alertdialog" aria-labelledby="mk-leave-q" onClick={(e) => e.stopPropagation()}>
        <p id="mk-leave-q" className="mk-leave-q">
          {zh ? "这个头像还没用上，不要了吗？" : "Leave without using this avatar?"}
        </p>
        <div className="mk-leave-acts">
          <button ref={stay} className="btn btn-primary" onClick={onStay}>
            {zh ? "继续做" : "Keep going"}
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            {zh ? "不要了" : "Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
