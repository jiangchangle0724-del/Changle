import { useId, useSyncExternalStore, type CSSProperties } from "react";
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
const canPopover = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
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
      {extra && <Button tone="icon" icon={extra.icon} label={extra.label} onClick={extra.onClick} />}
    </>
  );
  // the same choices folded behind ⋯ on a phone, each with its name: a menu of bare icons is a guess
  const menuItems = (
    <>
      {sound && (
        <Button tone="quiet" size="sm" icon={sound.on ? Volume2 : VolumeX} pressed={sound.on} onClick={sound.onToggle}>
          {labels.sound[lang]}
        </Button>
      )}
      {onTv && (
        <Button tone="quiet" size="sm" icon={Tv} onClick={onTv}>
          {labels.tv[lang]}
        </Button>
      )}
      {onHelp && (
        <Button tone="quiet" size="sm" icon={CircleHelp} onClick={onHelp}>
          {labels.rules[lang]}
        </Button>
      )}
      {extra && (
        <Button tone="quiet" size="sm" icon={extra.icon} onClick={extra.onClick}>
          {extra.label}
        </Button>
      )}
    </>
  );
  // Preserve the 56px bar and centred title on phones; desktop has room for all actions. A browser
  // without popovers (iPhone before iOS 17) keeps them all in the bar rather than behind a menu it
  // couldn't open.
  const count = [sound, onTv, onHelp, extra].filter(Boolean).length;
  const many = !desktop && canPopover && count > 1;
  // both sides as wide as the buttons in the bar, so the title stays centred and clear of them
  const side = many ? 1 : Math.max(1, count);
  return (
    <header className="ui-game-header" style={{ "--ui-game-side": side } as CSSProperties}>
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
          // in words, not a bare number under the title: 第 3 / 10 轮, Round 3 / 10, 还剩 12 秒
          <span
            className={`ui-game-status${status.kind === "timer" && status.secondsLeft <= (status.urgentAt ?? 10) ? " ui-game-status-urgent" : ""}`}
          >
            {status.kind === "round"
              ? labels.round[lang].replace("{n}", `${status.current}${status.total !== undefined ? ` / ${status.total}` : ""}`)
              : labels.secondsLeft[lang].replace("{n}", String(Math.max(0, status.secondsLeft)))}
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
            <div
              id={menuId}
              className="ui-game-menu"
              popover="auto"
              // a choice closes the menu: the rules sheet must not open under it (a popover sits on top
              // of everything); a switch like sound stays open, so you see it flip
              onClick={(e) => {
                const choice = (e.target as Element).closest("button");
                if (choice && !choice.hasAttribute("aria-pressed")) e.currentTarget.hidePopover();
              }}
            >
              {menuItems}
            </div>
          </>
        ) : (
          controls
        )}
      </div>
    </header>
  );
}
