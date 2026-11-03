import { Crown } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { PlayerPicker } from "../../components/PlayerPicker";
import { haptic, sfx } from "../../lib/sfx";
import { useStore } from "../../store";
import { useCue, useRoom } from "../RoomContext";
import { usePlayers } from "../players";
import { Figure } from "../../components/Figure";

/** Whose move it is, said in words: your own name never appears, "your turn" does. */
export function TurnLine({ pid, lead, extra, mineText }: { pid: string | null | undefined; lead?: string; extra?: ReactNode; mineText?: string }) {
  const { me, nameOf, room } = useRoom();
  const { ui } = useStore();
  const mine = !!pid && pid === me;
  // whoever's turn it is stands beside their name (and pops up when the turn moves on)
  const seat = pid ? room?.seats.find((s) => s.id === pid) : undefined;
  return (
    <p className="turn-line">
      {seat && (
        <span className="turn-fig" key={seat.id} aria-hidden="true">
          <Figure seat={seat} />
        </span>
      )}
      {mine ? (
        <span className="turn-name turn-mine">{mineText ?? ui("yourTurnNow")}</span>
      ) : (
        <>
          <span className="hint">{lead ?? ui("yourTurn")}</span>
          <span className="turn-name">{nameOf(pid)}</span>
        </>
      )}
      {extra}
    </p>
  );
}

/** What the rest of the table is waiting on. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="net-wait" role="status">
      <motion.span className="net-wait-dot" aria-hidden="true" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      {children}
    </p>
  );
}

/** Host-only buttons carry the crown, so everyone knows why only one phone has them. */
export function HostButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  const { isHost } = useRoom();
  if (!isHost) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm host-btn" onClick={onClick} disabled={disabled}>
      <Crown size={14} strokeWidth={2.4} />
      {children}
    </button>
  );
}

export function HostRow({ children }: { children: ReactNode }) {
  const { isHost } = useRoom();
  if (!isHost) return null;
  return <div className="host-row">{children}</div>;
}

/** Tap a name at this table. */
export function SeatPicker({
  exclude,
  selected,
  only,
  onPick,
  tone = "lacquer",
}: {
  exclude?: string[];
  selected?: string[];
  only?: string[];
  onPick: (pid: string) => void;
  tone?: "lacquer" | "porcelain";
}) {
  // (players only: someone just watching is never picked or voted for)
  const seats = usePlayers().filter((s) => !only || only.includes(s.id));
  return <PlayerPicker players={seats} exclude={exclude} selected={selected} tone={tone} onPick={(p) => onPick(p.id)} />;
}

/** Your phone chimes when the turn comes round to you. */
export function useYourTurn(mine: boolean) {
  useCue(mine, () => {
    sfx.yourTurn();
    haptic([12, 40, 12]);
  });
}

export function useNames(ids: string[] | null | undefined) {
  const { nameOf } = useRoom();
  return (ids ?? []).map((id) => nameOf(id));
}

/** "Amy, Ben and Cat" / "Amy、Ben、Cat" */
export function joinNames(names: string[], lang: "zh" | "en") {
  if (lang === "zh") return names.join("、");
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
