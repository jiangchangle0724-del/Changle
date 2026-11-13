// An iPhone can't make a web page full screen: Safari keeps its bars. Opened from the Home Screen,
// changle.ca (and this game with it) gets the whole screen. This shows how, with a little iPhone that
// acts out the four taps; once by itself the first time an iPhone reaches a lobby, then from the
// lobby's line, the menu and the full-screen button.
import { useEffect, useState } from "preact/hooks";
import { inAppBrowser, wantsHomeScreen } from "../device";
import { t, type Key } from "../i18n";
import { Icon, Sheet } from "./chrome";

const SEEN = "hc.homeGuide";

export interface HomeGuide {
  /** this device would gain the whole screen from it (an iPhone in Safari, not opened from the Home Screen) */
  wanted: boolean;
  open: boolean;
  show: () => void;
  close: () => void;
}

/** `auto`: may open by itself now (a lobby, not a round). It does so once per device. */
export function useHomeGuide(auto: boolean): HomeGuide {
  const [wanted] = useState(wantsHomeScreen);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!wanted || !auto) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {
      // (no storage: don't keep asking)
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [wanted, auto]);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // fine
    }
  };
  return { wanted, open, show: () => setOpen(true), close };
}

/** The little iPhone: Safari's menu, the share sheet, Open as Web App, the Home Screen. */
function MiniPhone() {
  return (
    <div class="mini-phone" aria-hidden="true">
      <div class="mini-screen">
        <div class="mini-scene mini-1">
          <span class="mini-page">
            <i />
            <i />
            <i class="is-short" />
          </span>
          <span class="mini-pop">
            <span class="mini-row is-target">
              <Icon name="share" size={14} />
              {t("homeShare")}
            </span>
          </span>
          <span class="mini-bar">
            <span class="mini-address">changle.ca</span>
            <span class="mini-more">···</span>
          </span>
          <span class="mini-tap" />
        </div>
        <div class="mini-scene mini-2">
          <span class="mini-page">
            <i />
            <i class="is-short" />
          </span>
          <span class="mini-sheet">
            <span class="mini-row">{t("homeCopy")}</span>
            <span class="mini-row">{t("homeBookmark")}</span>
            <span class="mini-row is-target">
              <Icon name="addSquare" size={14} />
              {t("homeAdd")}
            </span>
          </span>
          <span class="mini-tap" />
        </div>
        <div class="mini-scene mini-3">
          <span class="mini-sheet is-full">
            <span class="mini-addbar">
              <b class="is-target">{t("homeAddButton")}</b>
            </span>
            <span class="mini-app">
              <span class="mini-icon" />
              {t("homeIcon")}
            </span>
            <span class="mini-row mini-switch">
              {t("homeWebApp")}
              <i />
            </span>
          </span>
          <span class="mini-tap" />
        </div>
        <div class="mini-scene mini-4">
          <span class="mini-home">
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} class="mini-app is-other">
                <span class="mini-icon" />
              </span>
            ))}
            <span class="mini-app is-new">
              <span class="mini-icon" />
              {t("homeIcon")}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The guide itself (in its own sheet, or inside the menu's). */
export function HomeGuideBody(props: { onDone: () => void; doneLabel?: string }) {
  const steps: { key: Key; scene: number }[] = [
    ...(inAppBrowser() ? [{ key: "homeSafari" as Key, scene: 0 }] : []),
    { key: "homeStep1", scene: 1 },
    { key: "homeStep2", scene: 2 },
    { key: "homeStep3", scene: 3 },
    { key: "homeStep4", scene: 4 }
  ];
  return (
    <div class="home-guide">
      <MiniPhone />
      <div class="home-guide-text">
        <p class="sheet-text">{t("homeWhy")}</p>
        <ol class="home-steps">
          {steps.map((step) => (
            <li key={step.key} class={`home-step${step.scene ? ` home-step-${step.scene}` : ""}`}>
              {t(step.key)}
            </li>
          ))}
        </ol>
        <button type="button" class="btn btn-primary btn-block" onClick={props.onDone}>
          {props.doneLabel ?? t("homeGotIt")}
        </button>
      </div>
    </div>
  );
}

export function HomeScreenGuide(props: { guide: HomeGuide }) {
  return (
    <Sheet open={props.guide.open} title={t("homeTitle")} onClose={props.guide.close} wide>
      <HomeGuideBody onDone={props.guide.close} />
    </Sheet>
  );
}

/** The lobby's line about it, on an iPhone that would gain the whole screen. */
export function HomeTip(props: { onShow: () => void }) {
  return (
    <section class="panel home-tip">
      <span class="panel-icon">
        <Icon name="phone" />
      </span>
      <p class="panel-line">{t("homeTip")}</p>
      <button type="button" class="btn btn-quiet" onClick={props.onShow}>
        {t("homeShow")}
      </button>
    </section>
  );
}
