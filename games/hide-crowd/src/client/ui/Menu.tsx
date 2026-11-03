// The ⋯ sheet: language, reduced motion, full screen, this device as the big screen, the rules and
// where the art comes from.
import { useEffect, useState } from "preact/hooks";
import type { Lang } from "../../room/protocol";
import { t } from "../i18n";
import { Rules, Sheet, Switch } from "./chrome";
import { CreditsText } from "./Credits";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  onLang: (lang: Lang) => void;
  reduced: boolean;
  onReduced: (on: boolean) => void;
  /** full screen, where the page may ask for it */
  fullscreen?: { on: boolean; toggle: () => void; help: boolean };
  /** this game's big screen, to open on this device */
  screenHref?: string | null;
  custom: string;
}

export function Menu(props: MenuProps) {
  const [credits, setCredits] = useState(false);
  useEffect(() => {
    if (!props.open) setCredits(false);
  }, [props.open]);
  return (
    <Sheet open={props.open} title={t(credits ? "credits" : "menu")} onClose={props.onClose}>
      {credits ? (
        <>
          <CreditsText />
          <button type="button" class="btn btn-ghost btn-block" onClick={() => setCredits(false)}>
            {t("back")}
          </button>
        </>
      ) : (
        <>
          <div class="menu-list">
            <div class="lang-switch" role="group" aria-label={t("languageName")}>
              <button type="button" class="lang-option" aria-pressed={props.lang === "zh"} onClick={() => props.onLang("zh")} lang="zh-CN">
                中文
              </button>
              <button type="button" class="lang-option" aria-pressed={props.lang === "en"} onClick={() => props.onLang("en")} lang="en">
                English
              </button>
            </div>
            <Switch label={t("reduceMotion")} on={props.reduced} onChange={props.onReduced} />
            {props.fullscreen && (
              <>
                <button type="button" class="btn btn-quiet btn-block" onClick={props.fullscreen.toggle}>
                  {t(props.fullscreen.on ? "exitFullscreen" : "fullscreen")}
                </button>
                {props.fullscreen.help && (
                  <p class="hint" role="status">
                    {t("fullscreenHelp")}
                  </p>
                )}
              </>
            )}
            {props.screenHref && (
              <a class="btn btn-quiet btn-block" href={props.screenHref}>
                {t("openScreenHere")}
              </a>
            )}
            <button type="button" class="btn btn-ghost btn-block" onClick={() => setCredits(true)}>
              {t("credits")}
            </button>
          </div>
          <h3 class="menu-heading">{t("rulesTitle")}</h3>
          <Rules custom={props.custom} />
        </>
      )}
    </Sheet>
  );
}
