import { Maximize, Smartphone } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { T } from "../i18n";
import { Button } from "./Button";
import { ToolbarDemo } from "./ToolbarDemo";
import type { ScreenHintsProps, ToolbarDemoKind } from "./types";
import "./ScreenHints.css";

type Hint = "rotate" | "toolbar";

// 不再提醒 stays on this phone; otherwise a hint shows once a visit
const OFF = (h: Hint) => `changle.hint.${h}.off`;
const SEEN = (h: Hint) => `changle.hint.${h}.seen`;
function has(store: "local" | "session", key: string) {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}
function put(store: "local" | "session", key: string) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, "1");
  } catch {
    /* a private window: the hint just shows again */
  }
}

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
const IPHONE = /iPhone|iPod/.test(ua);
const WECHAT = /MicroMessenger/i.test(ua);
// Safari itself: Chrome, Firefox and Edge on an iPhone can't hide their bars
const SAFARI = IPHONE && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger/i.test(ua);
// Safari's own version (iOS 26 on keeps the iOS number in the user agent at 18): Hide Toolbar moved
// from aA into the page menu's More in 26, and straight into the page menu in 27 (Apple's iPhone User Guide)
const SAFARI_VERSION = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);

const isPhone = () => window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 520;
const sideways = () => window.matchMedia("(orientation: landscape)").matches;
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// Android's browsers can go full screen from a tap; an iPhone only lets a video do that
const canFull = () => !IPHONE && !WECHAT && !!document.fullscreenEnabled;
// what the toolbar hint can say here (an Android in-app browser that can't go full screen: nothing)
const toolbarHelp = () => SAFARI || IPHONE || WECHAT || canFull();

// (each fits one line beside the phone, so the card leaves the game some room)
const BACK: T = {
  zh: "要叫回来，点一下剩下的那条小地址栏。",
  en: "Tap what's left of the bar to bring it back.",
};
const PAGE_MENU: T = {
  zh: "点地址栏左边的页面菜单按钮。",
  en: "Tap the page menu, left of the address.",
};
const HOME: T = {
  zh: "更省事：分享里「添加到主屏幕」，从图标打开没有工具栏。",
  en: "Easier still: add it to your Home Screen from Share.",
};

/** How to hide the toolbar in the browser this is, in its own words for its menus, and the picture for it. */
function guide(): { kind: ToolbarDemoKind | null; steps: T[]; also?: T } {
  if (WECHAT)
    return {
      kind: IPHONE ? "wechat" : "wechat-android",
      steps: [
        { zh: "微信里藏不了工具栏。点右上角的 ···。", en: "WeChat can't hide it. Tap ··· at the top right." },
        IPHONE ? { zh: "选「在 Safari 中打开」。", en: "Choose Open in Safari." } : { zh: "选「在浏览器打开」。", en: "Choose Open in Browser." },
        { zh: "到了那边再横过来，照着提示藏起来。", en: "There, turn it sideways and follow the hint." },
      ],
    };
  if (IPHONE && !SAFARI)
    return {
      kind: null,
      steps: [{ zh: "这个浏览器藏不了工具栏。用 Safari 打开 changle.ca，就能把它藏起来。", en: "This browser can't hide its toolbar. Open changle.ca in Safari and you can." }],
    };
  if (SAFARI && SAFARI_VERSION >= 27)
    return { kind: "safari27", steps: [PAGE_MENU, { zh: "在菜单里点「隐藏工具栏」。", en: "Tap Hide Toolbar in the menu." }, BACK], also: HOME };
  if (SAFARI && SAFARI_VERSION >= 26)
    return { kind: "safari26", steps: [PAGE_MENU, { zh: "点「更多」，再点「隐藏工具栏」。", en: "Tap More, then Hide Toolbar." }, BACK], also: HOME };
  if (SAFARI)
    return {
      kind: "safari18",
      steps: [{ zh: "点地址栏左边的「aA」。", en: "Tap aA, left of the address." }, { zh: "点「隐藏工具栏」。", en: "Tap Hide Toolbar." }, BACK],
      also: HOME,
    };
  return {
    kind: "android",
    steps: [
      { zh: "点下面的「全屏」，地址栏就藏起来了。", en: "Tap Full screen below and the address bar goes away." },
      { zh: "要退出，从屏幕边上往里划。", en: "To leave, swipe in from the edge." },
    ],
    also: {
      zh: "也可以在浏览器菜单里选「添加到主屏幕」，从图标打开就没有地址栏。",
      en: "Or Add to Home screen from the browser's menu, and open it from the icon.",
    },
  };
}

/**
 * On a phone in a game (GameShell, NetFrame): held upright, a card says turning it sideways gives a
 * bigger picture; sideways, a card shows how to hide the browser's toolbar, a phone in 3D tapping
 * through it beside the steps (or goes full screen). Each waits until the phone has settled, shows
 * once a visit, and has 不再提醒.
 */
export function ScreenHints({ lang, rotate = true }: ScreenHintsProps) {
  const zh = lang === "zh";
  const [shown, setShown] = useState<Hint | null>(null);
  const [never, setNever] = useState(false);
  const [step, setStep] = useState(-1);
  const titleId = useId();
  useEffect(() => {
    // (a browser a script drives, like the screenshot tests and the games' checks, gets no hints)
    if (!isPhone() || navigator.webdriver) return;
    let timer = 0;
    const decide = () => {
      window.clearTimeout(timer);
      const want: Hint | null = sideways()
        ? !standalone() && !document.fullscreenElement && toolbarHelp()
          ? "toolbar"
          : null
        : rotate
          ? "rotate"
          : null;
      // a hint for the other way of holding it goes away
      setShown((now) => (now && now !== want ? null : now));
      if (!want || has("local", OFF(want)) || has("session", SEEN(want))) return;
      // once the phone has settled, not mid-turn
      timer = window.setTimeout(() => {
        put("session", SEEN(want));
        setNever(false);
        setShown(want);
      }, 1500);
    };
    decide();
    const turn = window.matchMedia("(orientation: landscape)");
    turn.addEventListener("change", decide);
    return () => {
      window.clearTimeout(timer);
      turn.removeEventListener("change", decide);
    };
  }, [rotate]);

  if (!shown) return null;
  const close = () => {
    if (never) put("local", OFF(shown));
    setShown(null);
  };
  const full = () => {
    // in the tap itself, or the browser says no
    void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    close();
  };
  const row = (button: ReactNode) => (
    <div className="ui-hint-row">
      <label className="ui-hint-never">
        <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
        <span>{zh ? "不再提醒" : "Don't remind me again"}</span>
      </label>
      {button}
    </div>
  );
  const gotIt = (
    <Button tone="primary" size="sm" onClick={close}>
      {zh ? "知道了" : "Got it"}
    </Button>
  );

  if (shown === "rotate")
    return (
      <div className="ui-hint" role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <Smartphone className="ui-hint-phone" aria-hidden="true" />
        <div className="ui-hint-body">
          <p id={titleId} className="ui-hint-title">
            {zh ? "横过来玩，画面更大" : "Turn it sideways for a bigger picture"}
          </p>
          <p className="ui-hint-text">
            {IPHONE
              ? zh
                ? "转不过来的话，先在控制中心关掉竖排方向锁定。"
                : "If it won't turn, switch off Portrait Orientation Lock in Control Centre."
              : zh
                ? "转不过来的话，先在快捷设置里打开自动旋转。"
                : "If it won't turn, switch on Auto-rotate in Quick Settings."}
          </p>
          {row(gotIt)}
        </div>
      </div>
    );

  const g = guide();
  return (
    <div className="ui-hint ui-hint-wide" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      {g.kind && <ToolbarDemo lang={lang} kind={g.kind} onStep={setStep} />}
      <div className="ui-hint-body">
        <p id={titleId} className="ui-hint-title">
          {zh ? "把工具栏藏起来，画面更大" : "Hide the toolbar for a bigger picture"}
        </p>
        {g.kind ? (
          <ol className="ui-hint-steps">
            {g.steps.map((s, i) => (
              <li key={s.en} data-on={i === step ? "" : undefined}>
                {s[lang]}
              </li>
            ))}
          </ol>
        ) : (
          <p className="ui-hint-text">{g.steps[0][lang]}</p>
        )}
        {g.also && <p className="ui-hint-text ui-hint-also">{g.also[lang]}</p>}
        {row(
          g.kind === "android" ? (
            <Button tone="primary" size="sm" icon={Maximize} onClick={full}>
              {zh ? "全屏" : "Full screen"}
            </Button>
          ) : (
            gotIt
          ),
        )}
      </div>
    </div>
  );
}
