import { useId, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  CircleHelp,
  MoreHorizontal,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "./Button";
import { labels } from "./labels";
import type { GameHeaderProps } from "./types";
import "./GameHeader.css";

const desktopQuery = "(min-width: 720px)";
function subscribeLayout(notify: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
export function GameHeader({
  title,
  lang,
  onBack,
  status,
  sound,
  onTv,
  onHelp,
  extra,
}: GameHeaderProps) {
  const other = lang === "zh" ? "en" : "zh";
  const menuId = useId();
  const desktop = useSyncExternalStore(
    subscribeLayout,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const controls = (
    <>
      {sound && (
        <Button
          tone="icon"
          icon={sound.on ? Volume2 : VolumeX}
          label={labels.sound[lang]}
          pressed={sound.on}
          onClick={sound.onToggle}
        />
      )}
      {onTv && (
        <Button tone="icon" icon={Tv} label={labels.tv[lang]} onClick={onTv} />
      )}
      {onHelp && (
        <Button
          tone="icon"
          icon={CircleHelp}
          label={labels.rules[lang]}
          onClick={onHelp}
        />
      )}
      {extra}
    </>
  );
  // Preserve the 56px bar and centred title on phones; desktop has room for all actions.
  const many =
    !desktop && [sound, onTv, onHelp, extra].filter(Boolean).length > 1;
  return (
    <header className="ui-game-header">
      <Button
        tone="icon"
        icon={ArrowLeft}
        label={labels.back[lang]}
        onClick={onBack}
      />
      <div className="ui-game-header-center">
        <h1 title={`${title[lang]} · ${title[other]}`}>
          <span lang={lang === "zh" ? "zh-CN" : "en"}>{title[lang]}</span>
          <small lang={other === "zh" ? "zh-CN" : "en"}>{title[other]}</small>
        </h1>
        {status && (
          <span
            className={`ui-game-status${status.kind === "timer" && status.secondsLeft <= (status.urgentAt ?? 10) ? " ui-game-status-urgent" : ""}`}
          >
            <span className="ui-visually-hidden">
              {labels[status.kind === "round" ? "round" : "secondsLeft"][lang]}
              :{" "}
            </span>
            {status.kind === "round"
              ? `${status.current}${status.total !== undefined ? ` / ${status.total}` : ""}`
              : Math.max(0, status.secondsLeft)}
          </span>
        )}
      </div>
      <div className="ui-game-header-actions">
        {many ? (
          <>
            <button
              type="button"
              className="ui-button ui-button-icon ui-button-sm ui-game-menu-trigger"
              popoverTarget={menuId}
              aria-label={labels.more[lang]}
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            <div id={menuId} className="ui-game-menu" popover="auto">
              {controls}
            </div>
          </>
        ) : (
          controls
        )}
      </div>
    </header>
  );
}
