// The ⋯ sheet: language, sound, music, reduced motion, full screen (on an iPhone, how to add it to the Home
// Screen instead), this device as the big screen, the way back (during a round too), the rules and
// where the art comes from.
import { useEffect, useState } from "preact/hooks";
import type { Lang } from "../../room/protocol";
import { t } from "../i18n";
import { musicOn, setMusic, setSound, soundOn } from "../sound";
import { Rules, Sheet, Switch } from "./chrome";
import { CreditsText } from "./Credits";
import { HomeGuideBody } from "./HomeScreen";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  onLang: (lang: Lang) => void;
  reduced: boolean;
  onReduced: (on: boolean) => void;
  /** full screen, where the page may ask for it */
  fullscreen?: { on: boolean; toggle: () => void };
  /** an iPhone that would get the whole screen from its Home Screen: the guide, inside this sheet */
  homeScreen?: boolean;
  /** this game's big screen, to open on this device */
  screenHref?: string | null;
  /** the way out: back to the table (or the game's card); `ask` first when it ends the game for everyone (the host) */
  leave?: { label: string; ask: boolean; go: () => void };
  custom: string;
}

export function Menu(props: MenuProps) {
  const [credits, setCredits] = useState(false);
  const [sound, setSoundOn] = useState(soundOn);
  const [music, setMusicOn] = useState(musicOn);
  const [asking, setAsking] = useState(false);
  const [home, setHome] = useState(false);
  useEffect(() => {
    if (props.open) return;
    setCredits(false);
    setAsking(false);
    setHome(false);
  }, [props.open]);
  // (the question is asked here, not in a sheet of its own: one sheet closing as another opens would trip over the back button)
  if (asking && props.leave)
    return (
      <Sheet open={props.open} title={t("endTitle")} onClose={props.onClose}>
        <p class="sheet-text">{t("endBody")}</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-quiet" onClick={() => setAsking(false)}>
            {t("stay")}
          </button>
          <button type="button" class="btn btn-primary" onClick={props.leave.go}>
            {t("endYes")}
          </button>
        </div>
      </Sheet>
    );
  if (home)
    return (
      <Sheet open={props.open} title={t("homeTitle")} onClose={props.onClose} wide>
        <HomeGuideBody onDone={() => setHome(false)} doneLabel={t("back")} />
      </Sheet>
    );
  const leave = props.leave;
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
            <Switch
              label={t("sound")}
              hint={t("soundHint")}
              on={sound}
              onChange={(value) => {
                setSound(value);
                setSoundOn(value);
              }}
            />
            <Switch
              label={t("music")}
              hint={t("musicHint")}
              on={music}
              onChange={(value) => {
                setMusic(value);
                setMusicOn(value);
              }}
            />
            <Switch label={t("reduceMotion")} on={props.reduced} onChange={props.onReduced} />
            {props.homeScreen ? (
              <button type="button" class="btn btn-quiet btn-block" onClick={() => setHome(true)}>
                {t("homeTitle")}
              </button>
            ) : (
              props.fullscreen && (
                <button type="button" class="btn btn-quiet btn-block" onClick={props.fullscreen.toggle}>
                  {t(props.fullscreen.on ? "exitFullscreen" : "fullscreen")}
                </button>
              )
            )}
            {props.screenHref && (
              <a class="btn btn-quiet btn-block" href={props.screenHref}>
                {t("openScreenHere")}
              </a>
            )}
            <button type="button" class="btn btn-ghost btn-block" onClick={() => setCredits(true)}>
              {t("credits")}
            </button>
            {leave && (
              <button type="button" class="btn btn-ghost btn-block" onClick={() => (leave.ask ? setAsking(true) : leave.go())}>
                {leave.label}
              </button>
            )}
          </div>
          <h3 class="menu-heading">{t("rulesTitle")}</h3>
          <Rules custom={props.custom} />
        </>
      )}
    </Sheet>
  );
}
