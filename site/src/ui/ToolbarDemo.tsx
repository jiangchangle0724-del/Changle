import { ChevronLeft, Compass, Copy, Ellipsis, EllipsisVertical, House, Lock, TextAlignStart, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { tokenMs } from "./tokenTime";
import type { ToolbarDemoKind, ToolbarDemoProps } from "./types";
import "./ToolbarDemo.css";

/** where the fingertip goes: an element in the picture with this data-spot */
type Spot = "rest" | "glyph" | "more" | "hide" | "mini" | "full" | "edge" | "swipe" | "dots" | "open";
type Frame = {
  at: Spot;
  /** pressing */
  down?: boolean;
  /** 1: the menu (WeChat: its panel) is open; 2: Safari 26's More is open over it */
  menu?: 1 | 2;
  /** it has worked: the toolbar is out of the way (WeChat: the page is in the browser) */
  done?: boolean;
  /** how long the frame stays, in --dur-emphasis */
  beats: number;
  /** the line of the steps it shows */
  step: number;
};

// tap the button, tap Hide Toolbar, look at the bigger game, tap what's left of the bar to bring it back
const SAFARI: Frame[] = [
  { at: "rest", beats: 3, step: 0 },
  { at: "glyph", beats: 2, step: 0 },
  { at: "glyph", down: true, beats: 1, step: 0 },
  { at: "glyph", menu: 1, beats: 2, step: 0 },
  { at: "hide", menu: 1, beats: 2, step: 1 },
  { at: "hide", menu: 1, down: true, beats: 1, step: 1 },
  { at: "rest", done: true, beats: 5, step: 1 },
  { at: "mini", done: true, beats: 2, step: 2 },
  { at: "mini", done: true, down: true, beats: 1, step: 2 },
  { at: "rest", beats: 3, step: 2 },
];
// Safari 26 keeps Hide Toolbar behind the page menu's More
const SAFARI_26: Frame[] = [
  { at: "rest", beats: 3, step: 0 },
  { at: "glyph", beats: 2, step: 0 },
  { at: "glyph", down: true, beats: 1, step: 0 },
  { at: "glyph", menu: 1, beats: 2, step: 0 },
  { at: "more", menu: 1, beats: 2, step: 1 },
  { at: "more", menu: 1, down: true, beats: 1, step: 1 },
  { at: "more", menu: 2, beats: 2, step: 1 },
  { at: "hide", menu: 2, beats: 2, step: 1 },
  { at: "hide", menu: 2, down: true, beats: 1, step: 1 },
  { at: "rest", done: true, beats: 5, step: 1 },
  { at: "mini", done: true, beats: 2, step: 2 },
  { at: "mini", done: true, down: true, beats: 1, step: 2 },
  { at: "rest", beats: 3, step: 2 },
];
// the card's 全屏, then a swipe in from the side to leave
const ANDROID: Frame[] = [
  { at: "rest", beats: 3, step: 0 },
  { at: "full", beats: 2, step: 0 },
  { at: "full", down: true, beats: 1, step: 0 },
  { at: "rest", done: true, beats: 5, step: 0 },
  { at: "edge", done: true, beats: 2, step: 1 },
  { at: "edge", done: true, down: true, beats: 1, step: 1 },
  { at: "swipe", done: true, down: true, beats: 2, step: 1 },
  { at: "rest", beats: 3, step: 1 },
];
// ···, then Open in Safari (Open in Browser on Android): there it can hide its toolbar
const WECHAT: Frame[] = [
  { at: "rest", beats: 3, step: 0 },
  { at: "dots", beats: 2, step: 0 },
  { at: "dots", down: true, beats: 1, step: 0 },
  { at: "dots", menu: 1, beats: 2, step: 0 },
  { at: "open", menu: 1, beats: 2, step: 1 },
  { at: "open", menu: 1, down: true, beats: 1, step: 1 },
  { at: "rest", done: true, beats: 6, step: 2 },
];
const FRAMES: Record<ToolbarDemoKind, Frame[]> = {
  safari18: SAFARI,
  safari26: SAFARI_26,
  safari27: SAFARI,
  android: ANDROID,
  wechat: WECHAT,
  "wechat-android": WECHAT,
};
/** with reduced motion it holds one picture: the menu open, the finger on what to tap */
const STILL: Record<ToolbarDemoKind, Frame> = {
  safari18: { at: "hide", menu: 1, beats: 0, step: -1 },
  safari26: { at: "hide", menu: 2, beats: 0, step: -1 },
  safari27: { at: "hide", menu: 1, beats: 0, step: -1 },
  android: { at: "full", beats: 0, step: -1 },
  wechat: { at: "open", menu: 1, beats: 0, step: -1 },
  "wechat-android": { at: "open", menu: 1, beats: 0, step: -1 },
};

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * A phone held sideways, drawn in 3D, that shows where to tap to hide this browser's toolbar: a
 * fingertip goes to each button in turn and the page grows when the bar goes. It loops, and says
 * which step it is at, for the steps written beside it. Only a picture: the steps are the words.
 */
export function ToolbarDemo({ lang, kind, play = true, onStep }: ToolbarDemoProps) {
  const zh = lang === "zh";
  const frames = FRAMES[kind];
  const [n, setN] = useState(0);
  const [still, setStill] = useState(() => window.matchMedia(REDUCED).matches);
  const screen = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    const q = window.matchMedia(REDUCED);
    const change = () => setStill(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  // another browser starts from the top
  useEffect(() => {
    setN(0);
    placed.current = false;
  }, [kind]);

  const f = still ? STILL[kind] : frames[n % frames.length];
  useEffect(() => onStep?.(f.step), [f.step, onStep]);
  useEffect(() => {
    if (!play || still) return;
    const beat = tokenMs("--dur-emphasis") || 400;
    const next = window.setTimeout(() => setN((i) => (i + 1) % frames.length), f.beats * beat);
    return () => window.clearTimeout(next);
  }, [n, play, still, frames, f.beats]);

  // the fingertip goes over its spot, and presses down onto the layer the spot is on
  useLayoutEffect(() => {
    const box = screen.current;
    const el = box?.querySelector<HTMLElement>(`[data-spot="${f.at}"]`);
    if (!box || !el) return;
    // where it is laid out: offsets leave out the tilt and the menus' pop
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    for (let e: HTMLElement | null = el; e && e !== box; e = e.offsetParent as HTMLElement | null) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    const z = Number(el.closest<HTMLElement>("[data-z]")?.dataset.z ?? 0);
    // the first time it's put in place, not slid there from a corner
    const jump = !placed.current;
    if (jump) box.setAttribute("data-jump", "");
    box.style.setProperty("--fx", `${x}px`);
    box.style.setProperty("--fy", `${y}px`);
    box.style.setProperty("--fz", `${z + 2}px`);
    box.style.setProperty("--tz", `${z + 1}px`);
    if (jump) {
      void box.offsetWidth;
      box.removeAttribute("data-jump");
      placed.current = true;
    }
  }, [f, kind]);

  // a spot the finger can be over (it's ringed) or pressing (it lights up)
  const spot = (s: Spot) => ({
    "data-spot": s,
    "data-near": f.at === s && !f.down ? "" : undefined,
    "data-hit": f.at === s && f.down ? "" : undefined,
  });
  const ios = kind !== "android" && kind !== "wechat-android";
  const safari = kind === "safari18" || kind === "safari26" || kind === "safari27";
  const wechat = kind === "wechat" || kind === "wechat-android";
  const url = <span className="ui-demo-url">changle.ca</span>;
  const pageMenu = (
    <span className="ui-demo-glyph" {...spot("glyph")}>
      <TextAlignStart />
    </span>
  );
  const hide = (
    <span className="ui-demo-row" {...spot("hide")}>
      <b>{zh ? "隐藏工具栏" : "Hide Toolbar"}</b>
    </span>
  );
  const skeleton = (key: string) => (
    <span key={key} className="ui-demo-row">
      <i />
    </span>
  );
  // the browser's bar: where the button to tap sits
  const bar = (lead: ReactNode, end: ReactNode, then = false) => (
    <div className="ui-demo-bar" data-z="2" data-then={then ? "" : undefined}>
      {lead}
      {end}
    </div>
  );
  const field = (lead: ReactNode) => (
    <span className="ui-demo-field">
      {lead}
      {url}
    </span>
  );

  return (
    <div className="ui-demo" data-kind={kind} aria-hidden="true">
      <i className="ui-demo-shadow" />
      <div className="ui-demo-phone">
        <div
          ref={screen}
          className="ui-demo-screen"
          data-at={f.at}
          data-menu={f.menu}
          data-done={f.done ? "" : undefined}
          data-down={f.down ? "" : undefined}
        >
          <i className={ios ? "ui-demo-island" : "ui-demo-camera"} />
          {/* the game: its card in its own light, and tonight's people */}
          <div className="ui-demo-page">
            <span className="ui-demo-card">
              <i />
              <i />
            </span>
            <span className="ui-demo-seats">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>

          {kind === "safari18" && (
            <>
              {bar(
                <>
                  <ChevronLeft className="ui-demo-icon" />
                  {field(
                    <span className="ui-demo-glyph ui-demo-aa" {...spot("glyph")}>
                      <small>A</small>A
                    </span>,
                  )}
                </>,
                <Copy className="ui-demo-icon" />,
              )}
              {/* sideways, Safari 18 shows the tabs under the address */}
              <span className="ui-demo-tabs" data-z="2">
                <i />
                <i />
              </span>
              <div className="ui-demo-menu" data-level="1" data-z="12">
                <span className="ui-demo-row ui-demo-size">
                  <small>A</small>
                  <b>100%</b>A
                </span>
                {skeleton("a")}
                {hide}
                {skeleton("b")}
              </div>
            </>
          )}
          {kind === "safari26" && (
            <>
              {bar(
                <>
                  <ChevronLeft className="ui-demo-icon" />
                  {field(pageMenu)}
                </>,
                <Ellipsis className="ui-demo-icon" />,
              )}
              <div className="ui-demo-menu" data-level="1" data-z="12">
                {skeleton("a")}
                {skeleton("b")}
                <span className="ui-demo-row" {...spot("more")}>
                  <b>{zh ? "更多" : "More"}</b>
                </span>
              </div>
              <div className="ui-demo-menu" data-level="2" data-z="18">
                {skeleton("c")}
                {hide}
                {skeleton("d")}
              </div>
            </>
          )}
          {kind === "safari27" && (
            <>
              {bar(
                <>
                  <ChevronLeft className="ui-demo-icon" />
                  {field(pageMenu)}
                </>,
                <Copy className="ui-demo-icon" />,
              )}
              <div className="ui-demo-menu" data-level="1" data-z="12">
                {skeleton("a")}
                {skeleton("b")}
                {hide}
                {skeleton("c")}
              </div>
            </>
          )}
          {safari && (
            <span className="ui-demo-mini" data-z="2" {...spot("mini")}>
              changle.ca
            </span>
          )}

          {kind === "android" && (
            <>
              {bar(
                <>
                  <House className="ui-demo-icon" />
                  {field(<Lock className="ui-demo-icon" />)}
                </>,
                <EllipsisVertical className="ui-demo-icon" />,
              )}
              {/* this card, with its 全屏 */}
              <span className="ui-demo-ask" data-z="6">
                <i />
                <span className="ui-demo-pill" {...spot("full")}>
                  {zh ? "全屏" : "Full screen"}
                </span>
              </span>
              <i className="ui-demo-mark ui-demo-edge" data-spot="edge" />
              <i className="ui-demo-mark ui-demo-swipe" data-spot="swipe" />
            </>
          )}

          {wechat && (
            <>
              {bar(
                <>
                  <X className="ui-demo-icon" />
                  <span className="ui-demo-title">changle.ca</span>
                </>,
                <span className="ui-demo-glyph" {...spot("dots")}>
                  <Ellipsis />
                </span>,
              )}
              {/* and where it opens: Safari, or the phone's own browser */}
              {bar(
                <>
                  <ChevronLeft className="ui-demo-icon" />
                  {field(ios ? <Compass className="ui-demo-icon" /> : <Lock className="ui-demo-icon" />)}
                </>,
                ios ? <Copy className="ui-demo-icon" /> : <EllipsisVertical className="ui-demo-icon" />,
                true,
              )}
              <div className="ui-demo-panel" data-z="10">
                <span className="ui-demo-tile">
                  <i className="ui-demo-dot" />
                  <i />
                </span>
                <span className="ui-demo-tile">
                  <i className="ui-demo-dot" />
                  <i />
                </span>
                <span className="ui-demo-tile">
                  <span className="ui-demo-dot" {...spot("open")}>
                    <Compass />
                  </span>
                  <b>{ios ? (zh ? "在 Safari 中打开" : "Open in Safari") : zh ? "在浏览器打开" : "Open in Browser"}</b>
                </span>
              </div>
            </>
          )}

          <i className="ui-demo-mark ui-demo-rest" data-spot="rest" />
          <i className="ui-demo-touch" />
          <i className="ui-demo-finger" />
        </div>
      </div>
    </div>
  );
}
