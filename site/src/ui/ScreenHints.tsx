import { Maximize, Smartphone } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import type { ScreenHintsProps } from "./types";
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
// Safari 26 moved Hide Toolbar into the page menu's More (Apple's iPhone User Guide)
const SAFARI_26 = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0) >= 26;

const isPhone = () => window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 520;
const sideways = () => window.matchMedia("(orientation: landscape)").matches;
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// Android's browsers can go full screen from a tap; an iPhone only lets a video do that
const canFull = () => !IPHONE && !WECHAT && !!document.fullscreenEnabled;
// what the toolbar hint can say here (an Android in-app browser that can't go full screen: nothing)
const toolbarHelp = () => SAFARI || IPHONE || WECHAT || canFull();

/**
 * On a phone in a game (GameShell, NetFrame): held upright, a card says turning it sideways gives a
 * bigger picture; sideways, a sheet shows how to hide the browser's toolbar (or goes full screen).
 * Each waits until the phone has settled, shows once a visit, and has 不再提醒.
 */
export function ScreenHints({ lang, rotate = true }: ScreenHintsProps) {
  const zh = lang === "zh";
  const [shown, setShown] = useState<Hint | null>(null);
  const [never, setNever] = useState(false);
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

  const close = () => {
    if (shown && never) put("local", OFF(shown));
    setShown(null);
  };
  const full = () => {
    // in the tap itself, or the browser says no
    void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    close();
  };
  const neverBox = (
    <label className="ui-hint-never">
      <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
      <span>{zh ? "不再提醒" : "Don't remind me again"}</span>
    </label>
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
          <div className="ui-hint-row">
            {neverBox}
            <Button tone="primary" size="sm" onClick={close}>
              {zh ? "知道了" : "Got it"}
            </Button>
          </div>
        </div>
      </div>
    );

  const fullscreen = canFull();
  return (
    <Sheet
      open={shown === "toolbar"}
      onClose={close}
      lang={lang}
      title={zh ? "把工具栏藏起来，画面更大" : "Hide the toolbar for a bigger picture"}
      footer={
        <div className="ui-hint-row">
          {neverBox}
          {fullscreen ? (
            <Button tone="primary" size="sm" icon={Maximize} onClick={full}>
              {zh ? "全屏" : "Full screen"}
            </Button>
          ) : (
            <Button tone="primary" size="sm" onClick={close}>
              {zh ? "知道了" : "Got it"}
            </Button>
          )}
        </div>
      }
    >
      <ToolbarSteps zh={zh} fullscreen={fullscreen} />
    </Sheet>
  );
}

/** How to hide the toolbar in the browser this is, in its own words for its menus. */
function ToolbarSteps({ zh, fullscreen }: { zh: boolean; fullscreen: boolean }) {
  if (WECHAT)
    return (
      <p className="ui-hint-text">
        {zh
          ? "微信里藏不了工具栏。点右上角的 ···，选「在 Safari 中打开」（安卓是「在浏览器打开」），再横过来玩。"
          : "WeChat can't hide its toolbar. Tap ··· at the top right, choose Open in Safari (Open in Browser on Android), then turn the phone sideways."}
      </p>
    );
  if (IPHONE && !SAFARI)
    return (
      <p className="ui-hint-text">
        {zh ? "这个浏览器藏不了工具栏。用 Safari 打开 changle.ca，就能把它藏起来。" : "This browser can't hide its toolbar. Open changle.ca in Safari and you can."}
      </p>
    );
  if (SAFARI)
    return (
      <>
        <ol className="ui-hint-steps">
          {SAFARI_26 ? (
            <>
              <li>{zh ? "点地址栏左边的页面菜单按钮。" : "Tap the page menu button at the left of the address bar."}</li>
              <li>{zh ? "点「更多」，再点「隐藏工具栏」。" : "Tap More, then Hide Toolbar."}</li>
              <li>{zh ? "要叫回来，点一下屏幕底部。" : "To bring it back, tap the bottom of the screen."}</li>
            </>
          ) : (
            <>
              <li>{zh ? "点地址栏左边的「aA」。" : "Tap aA at the left of the address bar."}</li>
              <li>{zh ? "点「隐藏工具栏」。" : "Tap Hide Toolbar."}</li>
              <li>{zh ? "要叫回来，点一下屏幕顶部。" : "To bring it back, tap the top of the screen."}</li>
            </>
          )}
        </ol>
        <p className="ui-hint-text ui-hint-also">
          {zh
            ? "更省事：点分享，选「添加到主屏幕」，以后从桌面上的图标打开，就没有工具栏。"
            : "Easier still: tap Share, then Add to Home Screen, and open it from the icon: no toolbar at all."}
        </p>
      </>
    );
  return (
    <>
      <p className="ui-hint-text">
        {fullscreen
          ? zh
            ? "点下面的「全屏」，地址栏就藏起来了。要退出，从屏幕边上往里划。"
            : "Tap Full screen below and the address bar goes away. To leave, swipe in from the edge."
          : ""}
      </p>
      <p className="ui-hint-text ui-hint-also">
        {zh
          ? "也可以在浏览器的菜单里选「添加到主屏幕」，以后从图标打开，就没有地址栏。"
          : "Or choose Add to Home screen in the browser's menu and open it from the icon: no address bar at all."}
      </p>
    </>
  );
}
