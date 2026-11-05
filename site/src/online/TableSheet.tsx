import { Crown, Eye, LogOut, Music, Tv, UserPlus, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import { LangTab } from "../components/TopBar";
import { setSoundEnabled } from "../lib/sound";
import { useStore } from "../store";
import { useRoom } from "./RoomContext";
import { SeatFace } from "./People";

/**
 * Everything about the table that is not the game: who is seated, the host's tools,
 * this phone's name and settings, and the way out.
 */
export function TableSheet({ open, onClose, onInvite, onLeave }: { open: boolean; onClose: () => void; onInvite: () => void; onLeave: () => void }) {
  const { room, me, isHost, act, rename } = useRoom();
  const { ui, sound, setSound, music, setMusic, lang } = useStore();
  const zh = lang === "zh";
  const myName = room?.seats.find((s) => s.id === me)?.name ?? "";
  const [name, setName] = useState(myName);
  const [penalty, setPenalty] = useState(room?.penalty ?? "");
  const [confirmKick, setConfirmKick] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(myName);
      setPenalty(room?.penalty ?? "");
      setConfirmKick(null);
    }
    // refresh the fields each time the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!room) return null;

  return (
    <Sheet open={open} onClose={onClose} title={`${ui("thisTable")} ${room.code}`}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="hint">{ui("atTable", { n: room.seats.length })}</span>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          onClick={() => {
            onClose();
            onInvite();
          }}
        >
          <UserPlus size={16} />
          {ui("invite")}
        </button>
      </div>

      <ul className="seat-list" aria-label={ui("players")}>
        {room.seats.map((s) => {
          const isMe = s.id === me;
          const isHostSeat = s.id === room.host;
          return (
            <li key={s.id} className={`seat-row ${s.on ? "" : "is-away"}`}>
              <span className="seat-face">
                <SeatFace seat={s} size={36} />
                <span className={`seat-dot ${s.on ? "on" : ""}`} aria-hidden="true" />
              </span>
              <span className="seat-row-name">
                {s.name}
                {isHostSeat && (
                  <span className="seat-tag seat-tag-host">
                    <Crown size={12} strokeWidth={2.6} />
                    {ui("host")}
                  </span>
                )}
                {isMe && <span className="seat-tag">{ui("you")}</span>}
                {s.watch && <span className="seat-tag">{zh ? "旁观" : "Watching"}</span>}
                {!s.on && <span className="seat-tag seat-tag-away">{ui("away")}</span>}
              </span>
              {isHost && !isMe && (
                <span className="seat-row-actions">
                  {confirmKick === s.id ? (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmKick(null)}>
                        {ui("stay")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-porcelain btn-sm"
                        onClick={() => {
                          act({ a: "kick", pid: s.id });
                          setConfirmKick(null);
                        }}
                      >
                        {ui("kick")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act({ a: "watch", pid: s.id, on: !s.watch })}>
                        {s.watch ? (zh ? "上桌" : "Play") : zh ? "旁观" : "Watch"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act({ a: "makeHost", pid: s.id })}>
                        {ui("makeHost")}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmKick(s.id)}>
                        {ui("kick")}
                      </button>
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <WatchRow />

      <div className="settings-row table-tv">
        <span className="table-tv-text">
          <span className="table-tv-title">
            <Tv size={16} />
            {zh ? "大屏幕" : "Big screen"}
          </span>
          <small className="hint">
            {room.screens
              ? zh
                ? "已连上，电视正在显示这桌"
                : "Connected: a TV is showing this table"
              : zh
                ? `电视或电脑的浏览器打开 ${window.location.host}/tv/${room.code}，整局都在大屏幕上看。手机想只看不玩，也打开这个地址，再投屏到电视`
                : `On a TV or computer, open ${window.location.host}/tv/${room.code} to watch the whole game big. A phone that only wants to watch opens it too, then mirrors to a TV`}
          </small>
        </span>
        {!room.screens && window.matchMedia("(min-width: 900px) and (hover: hover)").matches && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.open(`${window.location.origin}/tv/${room.code}`, "_blank")}>
            {zh ? "新窗口打开" : "Open it here"}
          </button>
        )}
      </div>

      {isHost && room.game && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 16 }}
          onClick={() => {
            act({ a: "end" });
            onClose();
          }}
        >
          {ui("endGame")}
        </button>
      )}

      <form
        className="stack"
        style={{ gap: 8, marginTop: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== myName) rename(name);
        }}
      >
        <span>{ui("rename")}</span>
        <div className="field">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={14} autoComplete="nickname" enterKeyHint="done" aria-label={ui("yourName")} />
          <button type="submit" className="btn btn-gold btn-sm" disabled={!name.trim() || name.trim() === myName}>
            {ui("save")}
          </button>
        </div>
      </form>

      {isHost ? (
        <form
          className="stack"
          style={{ gap: 8, marginTop: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            act({ a: "penalty", text: penalty });
          }}
        >
          <span>{ui("tablePenalty")}</span>
          <div className="field">
            <input value={penalty} onChange={(e) => setPenalty(e.target.value)} placeholder={ui("penaltyCustomPlaceholder")} maxLength={24} aria-label={ui("tablePenalty")} />
            <button type="submit" className="btn btn-gold btn-sm" disabled={penalty.trim() === (room.penalty ?? "")}>
              {ui("save")}
            </button>
          </div>
          <p className="hint">{ui("tablePenaltyHelp")}</p>
        </form>
      ) : (
        <div className="settings-row" style={{ marginTop: 14 }}>
          <span>{ui("tablePenalty")}</span>
          <span className="table-penalty-text">{room.penalty || ui("penaltyDefault")}</span>
        </div>
      )}

      <div className="settings-row" style={{ marginTop: 14 }}>
        <span>{ui("language")}</span>
        <LangTab />
      </div>
      <div className="settings-row">
        <span>{ui("sound")}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={sound}
          onClick={() => {
            setSound(!sound);
            setSoundEnabled(!sound);
          }}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {sound ? ui("soundOn") : ui("soundOff")}
        </button>
      </div>
      <div className="settings-row">
        <span>{ui("music")}</span>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={music} disabled={!sound} onClick={() => setMusic(!music)}>
          <Music size={16} />
          {music && sound ? ui("soundOn") : ui("soundOff")}
        </button>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 22 }}
        onClick={() => {
          onClose();
          onLeave();
        }}
      >
        <LogOut size={16} />
        {ui("leaveTable")}
      </button>
      <p className="hint" style={{ marginTop: 14 }}>
        {ui("adultsOnly")} · {ui("responsible")}
      </p>
    </Sheet>
  );
}

/**
 * Back, from inside a game. For the host it ends the game and the whole table goes back to the
 * lobby to pick the next one (nobody leaves the table); leaving the table is the quieter choice.
 * Anyone else is asked whether they want to leave the table, and told the host can end the game.
 */
export function GameExitSheet({ open, onClose, onLeave }: { open: boolean; onClose: () => void; onLeave: () => void }) {
  const { ui, lang } = useStore();
  const { isHost, act } = useRoom();
  const zh = lang === "zh";
  if (!isHost)
    return (
      <Sheet open={open} onClose={onClose} title={ui("leaveTable")}>
        <p className="hint" style={{ fontSize: "var(--text-md)", marginBottom: 18 }}>
          {zh ? "想换个游戏的话，主人点左上角的返回，结束这局，大家会一起回到大厅。" : "Want a different game? The host taps back to end this one, and everyone goes back to the lobby together."}
        </p>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            {ui("stay")}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onLeave}>
            <LogOut size={16} />
            {ui("leaveTable")}
          </button>
        </div>
      </Sheet>
    );
  return (
    <Sheet open={open} onClose={onClose} title={zh ? "结束这局？" : "End this game?"}>
      <p className="hint" style={{ fontSize: "var(--text-md)", marginBottom: 18 }}>
        {zh ? "大家一起回到大厅，选下一个游戏。没有人会离开这桌。" : "Everyone goes back to the lobby to pick the next game. Nobody leaves the table."}
      </p>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          {zh ? "接着玩" : "Keep playing"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            act({ a: "end" });
            onClose();
          }}
        >
          {zh ? "回大厅" : "To the lobby"}
        </button>
      </div>
      <button type="button" className="link-btn" style={{ marginTop: 16, alignSelf: "center" }} onClick={onLeave}>
        <LogOut size={14} /> {zh ? "我要离开这桌" : "I'm leaving the table"}
      </button>
    </Sheet>
  );
}

export function LeaveSheet({ open, onClose, onLeave }: { open: boolean; onClose: () => void; onLeave: () => void }) {
  const { ui } = useStore();
  return (
    <Sheet open={open} onClose={onClose} title={ui("leaveTable")}>
      <p className="hint" style={{ fontSize: "var(--text-md)", marginBottom: 18 }}>
        {ui("leaveConfirm")}
      </p>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          {ui("stay")}
        </button>
        <button type="button" className="btn btn-primary btn-block" onClick={onLeave}>
          <LogOut size={16} />
          {ui("leaveTable")}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Just watching: you stay at the table but sit out every game (no turns, no penalties), and your
 * phone shows the game as the big screen does, to mirror to a TV.
 */
function WatchRow() {
  const { room, me, act } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const watching = !!room?.seats.find((s) => s.id === me)?.watch;
  return (
    <div className="settings-row table-watch">
      <span className="table-tv-text">
        <span className="table-tv-title">
          <Eye size={16} />
          {zh ? "我只看，不参加" : "Just watch"}
        </span>
        <small className="hint">{zh ? "留在这桌，但每个游戏都不参加，手机显示给大家看的画面，适合投到电视。" : "Stay at the table but sit out every game. Your phone shows the game as the big screen does, for mirroring to a TV."}</small>
      </span>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={watching} onClick={() => act({ a: "watch", on: !watching })}>
        <Eye size={16} />
        {watching ? (zh ? "旁观中" : "Watching") : zh ? "只看" : "Watch"}
      </button>
    </div>
  );
}
