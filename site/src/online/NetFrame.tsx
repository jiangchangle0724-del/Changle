import { ChevronLeft, CircleHelp, Eye, Users } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GAME_BY_ID } from "../games/registry";
import { setLight } from "../lib/anim";
import { Sheet } from "../components/Sheet";
import { BiTitle } from "../components/TopBar";
import type { T } from "../i18n";
import { useStore } from "../store";
import { InviteSheet } from "./Invite";
import { ConnectionBanner, ReactionDock } from "./Overlays";
import { useRoom } from "./RoomContext";
import { GameExitSheet, LeaveSheet, TableSheet } from "./TableSheet";

type Frame = { openInvite: () => void; openTable: () => void };
const FrameCtx = createContext<Frame>({ openInvite: () => {}, openTable: () => {} });
export const useFrame = () => useContext(FrameCtx);

/**
 * The frame every online screen sits in: back (leave), the title, who's at the table,
 * the rules; and along the bottom edge, the reactions anyone can throw.
 */
export function NetFrame({
  title,
  center,
  rules,
  children,
  className = "",
  onLeave,
  dock = true,
}: {
  title?: T;
  center?: ReactNode;
  rules?: ReactNode;
  children: ReactNode;
  className?: string;
  onLeave: () => void;
  /** The reactions row; the drawer's plate needs the room. */
  dock?: boolean;
}) {
  const { room, me, act } = useRoom();
  const { ui, lang } = useStore();
  const watching = !!room?.game && !!room.seats.find((s) => s.id === me)?.watch;
  const [tableOpen, setTableOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const online = room?.seats.filter((s) => s.on).length ?? 0;
  const gid = room?.game?.id;
  const gel = gid ? GAME_BY_ID[gid]?.gel : undefined;
  useEffect(() => {
    if (gel) setLight(gel);
  }, [gel]);

  return (
    <FrameCtx.Provider value={{ openInvite: () => setInviteOpen(true), openTable: () => setTableOpen(true) }}>
      <div className={`screen net-screen ${className}`} style={gel ? ({ ["--gel" as string]: gel } as React.CSSProperties) : undefined}>
        <header className="topbar">
          <div className="topbar-side">
            <button className="icon-btn" onClick={() => setLeaveOpen(true)} aria-label={ui("leaveTable")}>
              <ChevronLeft size={22} />
            </button>
          </div>
          <div className="topbar-title">{center ?? (title && <BiTitle name={title} size="sm" />)}</div>
          <div className="topbar-side topbar-right">
            <button className="table-btn" onClick={() => setTableOpen(true)} aria-label={`${ui("thisTable")} ${room?.code ?? ""}`}>
              <Users size={17} />
              <span className="tabular">{online}</span>
            </button>
            {rules && (
              <button className="icon-btn" onClick={() => setRulesOpen(true)} aria-label={ui("rules")}>
                <CircleHelp size={21} />
              </button>
            )}
          </div>
        </header>
        <ConnectionBanner />
        {watching && (
          <div className="watch-strip" role="status">
            <Eye size={15} aria-hidden="true" />
            <span>{lang === "zh" ? "旁观中：这局你不参加，画面可以投到电视上" : "Watching: you sit this one out. Mirror this screen to a TV"}</span>
            <button type="button" className="link-btn" onClick={() => act({ a: "watch", on: false })}>
              {lang === "zh" ? "上桌" : "Play"}
            </button>
          </div>
        )}
        <div className="game-body net-body">{children}</div>
        {dock && <ReactionDock />}
      </div>

      {rules && (
        <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title={ui("rules")} gel={gel}>
          <div className="rules-text">{rules}</div>
        </Sheet>
      )}
      <TableSheet open={tableOpen} onClose={() => setTableOpen(false)} onInvite={() => setInviteOpen(true)} onLeave={() => setLeaveOpen(true)} />
      {room && <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} />}
      {/* in a game, back means "back to the lobby" (for the host); in the lobby it means leaving */}
      {gid ? <GameExitSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} onLeave={onLeave} /> : <LeaveSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} onLeave={onLeave} />}
    </FrameCtx.Provider>
  );
}
