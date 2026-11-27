import type { LangSwitchProps } from "./types";
import "./LangSwitch.css";

/**
 * The page's language, in plain sight on every game's bar (Steve 2026-11-23, from 戏精大赏: a
 * mixed table switches mid-game, and the switch was hidden in the rules or the table sheet). Both
 * shown, the one in use lit, as on the home page; one tap switches. Its name starts with what it
 * shows (中 EN, label in name) and says, in the other language, what a tap does.
 */
export function LangSwitch({ lang, onSwitch }: LangSwitchProps) {
  const zh = lang === "zh";
  return (
    <button
      type="button"
      className="ui-lang"
      onClick={onSwitch}
      lang={zh ? "en" : "zh-CN"}
      aria-label={zh ? "中 EN: switch to English" : "中 EN：切换到中文"}
    >
      <span className="ui-lang-pill">
        <span lang="zh-CN" className={zh ? "is-on" : undefined}>
          中
        </span>{" "}
        <span lang="en" className={zh ? undefined : "is-on"}>
          EN
        </span>
      </span>
    </button>
  );
}
