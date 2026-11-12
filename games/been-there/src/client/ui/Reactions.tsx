// Reactions (表情): a team's player taps its character's face in a mood (好耶！ 不会吧！ 呜呜… 嗯？ 嘿嘿),
// and every screen in the room shows it for a moment, rising off the board's corner: no typing, so
// nothing to watch over. On a phone the round button in the board's top left corner opens the five;
// the big screen only shows them, bigger, with a small sound. One a player every 1.5 s (the room
// drops quicker ones), never kept. Decoration: with reduced motion they appear and fade, nothing moves.
import { useEffect, useRef, useState } from "preact/hooks";
import { REACTIONS, TIMING, type ReactionId, type RoomView } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { onReactions, reactionsNow } from "../reactions";
import { sfx } from "../sound";
import { send } from "../store";
import { TEAM_COLORS, TEAM_LETTERS, TeamFace } from "./common";

const word = (r: ReactionId) => t(`react_${r}` as Key);

/** The reactions showing now, as they come and go. */
function useReactions() {
  const [list, setList] = useState(reactionsNow);
  useEffect(() => onReactions(() => setList(reactionsNow())), []);
  return list;
}

/** The reactions rising off the board's corner (a phone's bottom left; the big screen's, bigger). */
export function ReactBubbles({ v, big }: { v: RoomView; big?: boolean }) {
  const list = useReactions();
  // The big screen gives each new one a small sound (phones stay quiet: they're in everyone's hands).
  const last = useRef(0);
  useEffect(() => {
    const newest = list.at(-1)?.id ?? 0;
    if (big && newest > last.current && last.current !== 0) sfx.tap();
    last.current = Math.max(last.current, newest, 1);
  }, [list, big]);
  if (!list.length) return null;
  return (
    <div class={`reactions${big ? " big" : ""}`} aria-hidden="true">
      {list.map((x) => {
        const team = v.teams.find((tm) => tm.id === x.team);
        if (!team) return null;
        return (
          <div key={x.id} class="reaction" style={{ "--team": TEAM_COLORS[team.color] }}>
            <TeamFace color={team.color} size={big ? 54 : 32} mood={x.r} />
            <b class="reaction-word">{word(x.r)}</b>
            <span class="reaction-who">{TEAM_LETTERS[team.color]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A phone's button for its own team's reactions, in the board's top left corner. */
export function ReactButton({ v, hidden }: { v: RoomView; hidden?: boolean }) {
  const team = v.teams.find((tm) => tm.id === v.you.team);
  const [open, setOpen] = useState(false);
  const [resting, setResting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A tap anywhere else closes the row; so does a while without one.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const quiet = setTimeout(() => setOpen(false), 8_000);
    document.addEventListener("pointerdown", away, true);
    return () => {
      clearTimeout(quiet);
      document.removeEventListener("pointerdown", away, true);
    };
  }, [open]);
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);
  if (!team || v.settings.hotseat || v.you.role !== "player") return null;
  if (hidden) return null;
  const react = (r: ReactionId) => {
    send({ t: "react", r });
    setOpen(false);
    setResting(true);
    setTimeout(() => setResting(false), TIMING.reactEvery);
  };
  return (
    <div class={`react-pick${open ? " open" : ""}`} ref={box} style={{ "--team": TEAM_COLORS[team.color] }}>
      <button
        type="button"
        class="react-btn"
        aria-expanded={open}
        aria-label={t("reactOpen")}
        title={t("reactOpen")}
        disabled={resting}
        onClick={() => setOpen(!open)}
      >
        <TeamFace color={team.color} size={28} mood="happy" />
      </button>
      {open && (
        <div class="react-row" role="group" aria-label={t("reactOpen")}>
          {REACTIONS.map((r) => (
            <button key={r} type="button" class="react-opt" aria-label={t("reactSend", { word: word(r) })} title={word(r)} onClick={() => react(r)}>
              <TeamFace color={team.color} size={30} mood={r} />
              <small>{word(r)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
