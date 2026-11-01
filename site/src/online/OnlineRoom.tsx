import { MotionConfig } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { TopBar } from "../components/TopBar";
import { TablePenalty, useStore } from "../store";
import { isCode, lastRoom, newCode, readIntent, savedName, setIntent } from "./config";
import { JoinScreen } from "./JoinScreen";
import { Lobby } from "./Lobby";
import { NetPenaltyLayer, ReactionLayer, ToastLayer } from "./Overlays";
import { RoomProvider, useRoom } from "./RoomContext";
import { useTableSounds } from "./useTableSounds";
import { NetGame } from "./games/NetGame";
import { ScreenGuard } from "../components/ScreenGuard";
import { siteNotice } from "../lib/api";
import { navigate } from "../routes";

type Session = { name: string; create: boolean; n: number };

/**
 * /t/CODE: one table on the room server. Decides whether this phone sits straight down
 * (it opened the table, or it was here a moment ago) or sees the place card first.
 */
export function OnlineRoom({ code, onExit }: { code: string; onExit: () => void }) {
  const { ui } = useStore();
  const [session, setSession] = useState<Session | null>(() => {
    const intent = readIntent(code);
    if (intent?.name) return { name: intent.name, create: intent.create, n: 0 };
    if (lastRoom() === code && savedName()) return { name: savedName(), create: false, n: 0 };
    return null;
  });

  if (!isCode(code)) {
    return (
      <Notice title={ui("errNoRoom")} onBack={onExit}>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onExit}>
          {ui("back")}
        </button>
      </Notice>
    );
  }
  if (!session) return <JoinScreen code={code} onBack={onExit} onJoin={(name) => setSession({ name, create: false, n: 0 })} />;

  return (
    <RoomProvider key={`${code}:${session.n}`} code={code} name={session.name} create={session.create}>
      <Stage
        create={session.create}
        name={session.name}
        onExit={onExit}
        onRejoin={() => setSession((s) => (s ? { ...s, create: false, n: s.n + 1 } : s))}
        onForget={() => setSession(null)}
      />
    </RoomProvider>
  );
}

function Stage({ create, name, onExit, onRejoin, onForget }: { create: boolean; name: string; onExit: () => void; onRejoin: () => void; onForget: () => void }) {
  const { room, stopped, status, code, leave } = useRoom();
  const { ui } = useStore();
  useTableSounds();

  // a fresh code that turned out to be taken: quietly try another
  useEffect(() => {
    if (stopped?.kind === "error" && stopped.code === "exists" && create) {
      const next = newCode();
      setIntent({ code: next, create: true, name });
      navigate(`/t/${next}`, { replace: true });
    }
    if (stopped?.kind === "left") onExit();
    // the whole site paused, or this phone banned: the app shows its own sign
    if (stopped?.kind === "error" && (stopped.code === "paused" || stopped.code === "banned")) siteNotice(stopped.code);
  }, [stopped, create, name, onExit]);

  // after a while without ever getting in, say so (the socket keeps trying underneath)
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (room) return;
    const id = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(id);
  }, [room]);

  if (stopped && stopped.kind === "error" && !(stopped.code === "exists" && create)) {
    const text =
      stopped.code === "kicked"
        ? ui("errKicked")
        : stopped.code === "full"
          ? ui("errFull")
          : stopped.code === "exists"
            ? ui("errBusy")
            : stopped.code === "paused"
              ? ui("errPaused")
              : stopped.code === "banned"
                ? ui("errBanned")
                : ui("errNoRoom");
    return (
      <Notice title={text} onBack={onExit}>
        {stopped.code === "no-room" && (
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              const next = newCode();
              setIntent({ code: next, create: true, name });
              navigate(`/t/${next}`, { replace: true });
            }}
          >
            {ui("openTable")}
          </button>
        )}
        {stopped.code === "full" && (
          <button type="button" className="btn btn-ghost btn-block" onClick={onForget}>
            {ui("tryAgain")}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={onExit}>
          {ui("back")}
        </button>
      </Notice>
    );
  }
  if (stopped?.kind === "replaced") {
    return (
      <Notice title={ui("errReplaced")} onBack={onExit}>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onRejoin}>
          {ui("continueHere")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onExit}>
          {ui("back")}
        </button>
      </Notice>
    );
  }
  if (!room) {
    return (
      <Notice title={slow || status === "reconnecting" ? ui("errUnreachable") : `${ui("connecting")}…`} onBack={onExit} spinning>
        <p className="hint" style={{ textAlign: "center" }}>
          {ui("tableCode")} {code}
        </p>
        {(slow || status === "reconnecting") && (
          <button type="button" className="btn btn-ghost btn-block" onClick={onRejoin}>
            {ui("tryAgain")}
          </button>
        )}
      </Notice>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* every phone at the table plays for the host's penalty, whatever its own settings say */}
      <TablePenalty value={room.penalty ?? ""}>
        <ScreenGuard key={room.game?.id ?? "lobby"} compact>
          {room.game ? <NetGame view={room.game} onLeave={leave} /> : <Lobby onLeave={leave} />}
        </ScreenGuard>
        <ReactionLayer />
        <ToastLayer />
        <NetPenaltyLayer />
      </TablePenalty>
    </MotionConfig>
  );
}

/** A ring of light that turns while we wait, or holds still under bad news. */
function Notice({ title, children, onBack, spinning }: { title: string; children?: ReactNode; onBack: () => void; spinning?: boolean }) {
  return (
    <div className="screen notice-screen">
      <TopBar onBack={onBack} />
      <div className="notice-body">
        <svg viewBox="-40 -40 80 80" width={112} height={112} aria-hidden="true" className={`notice-ring ${spinning ? "is-spinning" : ""}`}>
          <circle r={30} fill="none" stroke="var(--line)" strokeWidth={5} />
          <circle r={30} fill="none" stroke="var(--light)" strokeWidth={5} strokeLinecap="round" strokeDasharray={spinning ? "48 140" : "190 0"} className="notice-arc" />
        </svg>
        <p className="notice-title">{title}</p>
        <div className="stack" style={{ gap: 10, width: "100%" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
