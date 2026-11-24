import type { LangSwitchProps } from "./types";
import "./LangSwitch.css";

/**
 * The page's language, in plain sight on every game's bar (Steve 2026-11-23, from 戏精大赏: a
 * mixed table switches mid-game, and the switch was hidden in the rules or the table sheet). Both
 * shown, the one in use lit, as on the home page; one tap switches.
 */
export function LangSwitch({ lang, onSwitch }: LangSwitchProps) {
  return (
    <button type="button" className="ui-lang" onClick={onSwitch} aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}>
      <span className="ui-lang-pill" aria-hidden="true">
        <span className={lang === "zh" ? "is-on" : undefined}>中</span>
        <span className={lang === "en" ? "is-on" : undefined}>EN</span>
      </span>
    </button>
  );
}
