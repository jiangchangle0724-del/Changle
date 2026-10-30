import { ChevronLeft, CircleHelp, Users } from "lucide-react";
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
import { LeaveSheet, TableSheet } from "./TableSheet";

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
  const { room } = useRoom();
  const { ui } = useStore();
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
      <LeaveSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} onLeave={onLeave} />
    </FrameCtx.Provider>
  );
}
