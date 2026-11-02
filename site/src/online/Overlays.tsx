import { Check, RotateCw, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PenaltyStamp } from "../components/PenaltyStamp";
import { haptic } from "../lib/sfx";
import { REACTIONS, type Reaction } from "../shared/protocol";
import { usePenaltyText, useStore } from "../store";
import type { UIKey } from "../i18n";
import { useRoom, useRoomEvent } from "./RoomContext";
import { SeatFace } from "./People";

/* ---------------- the penalty, on every phone ---------------- */

export function NetPenaltyLayer() {
  const { pens, dismissPen, me, nameOf, room, act, drank } = useRoom();
  const { ui, tr } = useStore();
  const custom = usePenaltyText().isCustom;
  const pen = pens[0] ?? null;
  const [called, setCalled] = useState<string | null>(null);
  const [mineDone, setMineDone] = useState<string | null>(null);

  const mine = !!pen && pen.who.includes(me) && pen.kind !== "safe";
  const drankIds = pen ? drank[pen.id] ?? [] : [];
  const iDrank = !!pen && (drankIds.includes(me) || mineDone === pen.id);
  // One call per penalty. The stamp plays its entrance whenever its call changes, so a fresh
  // object on every render replayed the whole stamp each time someone tapped "I drank".
  const penId = pen?.id ?? "";
  const call = useMemo(
    () => (pen ? { who: pen.kind === "everyone" ? [] : pen.who.map((pid) => nameOf(pid)), kind: pen.kind, note: pen.note ? tr(pen.note) : undefined, say: pen.say ? tr(pen.say) : undefined, times: pen.times } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [penId],
  );

  // a phone that is only watching lets the stamp go by itself
  useEffect(() => {
    if (!pen || mine) return;
    const id = window.setTimeout(() => dismissPen(pen.id), pen.kind === "safe" ? 2600 : 4200);
    return () => window.clearTimeout(id);
  }, [pen, mine, dismissPen]);

  if (!pen || !room || !call) return null;
  const everyone = pen.kind === "everyone";
  // nobody drinks when the table has its own penalty (or the game named one): they did it
  const doneMark = custom || pen.say ? ui("doneMark") : ui("drankMark");

  const names = everyone ? (
    <span className="stamp-name-list">
      <span>{custom ? ui("everyone") : ui("everyoneDrinks")}</span>
      {drankIds.length > 0 && <span className="stamp-drank-count tabular">{`${drankIds.length}/${pen.who.length} ${doneMark}`}</span>}
    </span>
  ) : (
    <span className="stamp-name-list">
      {pen.who.map((pid) => {
        const done = drankIds.includes(pid);
        return (
          <span key={pid} className={`stamp-name ${done ? "is-done" : ""}`}>
            <SeatFace seat={room?.seats.find((x) => x.id === pid)} size={34} className="stamp-face" />
            {nameOf(pid)}
            {pid === me && <span className="stamp-you">{ui("you")}</span>}
            {done && <Check size={22} strokeWidth={3} aria-label={doneMark} />}
          </span>
        );
      })}
    </span>
  );

  const buddyName = pen.buddy ? nameOf(pen.buddy) : "";
  const canBuddy = mine && !!pen.buddy && pen.buddy !== me && called !== pen.id;

  const actions = mine ? (
    iDrank ? (
      <button type="button" className="btn btn-porcelain btn-lg stamp-done" onClick={() => dismissPen(pen.id)}>
        {ui("continue")}
      </button>
    ) : (
      <div className="stack" style={{ gap: 10, width: "100%", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-porcelain btn-lg stamp-done"
          onClick={() => {
            act({ a: "drank", pen: pen.id });
            setMineDone(pen.id);
            haptic(14);
            window.setTimeout(() => dismissPen(pen.id), 900);
          }}
        >
          <Check size={18} strokeWidth={3} />
          {pen.say || custom ? ui("iDidIt") : ui("iDrank")}
        </button>
        {canBuddy && (
          <button
            type="button"
            className="btn btn-penalty stamp-done"
            onClick={() => {
              act({ a: "buddy", pen: pen.id });
              setCalled(pen.id);
              haptic([10, 20, 10]);
            }}
          >
            {custom ? ui("callBuddyPenalty", { name: buddyName }) : ui("callBuddy", { name: buddyName })}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissPen(pen.id)}>
          {ui("later")}
        </button>
      </div>
    )
  ) : undefined;

  return (
    <PenaltyStamp
      key={pen.id}
      call={call}
      onDone={() => dismissPen(pen.id)}
      customText={room.penalty}
      names={names}
      actions={actions}
      volume={mine ? 1 : 0.7}
      emptied={mine && iDrank}
    />
  );
}

/* ---------------- reactions ---------------- */

export const REACTION_KEY: Record<Reaction, UIKey> = {
  cheers: "reactCheers",
  nice: "reactNice",
  haha: "reactHaha",
  drink: "reactDrink",
};

/** A reaction's word; "drink" becomes the penalty call when the table has its own penalty. */
export function useReactionLabel() {
  const { ui } = useStore();
  const custom = usePenaltyText().isCustom;
  return (r: Reaction) => (r === "drink" && custom ? ui("reactPenalty") : ui(REACTION_KEY[r]));
}

type Float = { id: number; r: Reaction; name: string; x: number; mine: boolean };

/** Reactions rise from the table edge on every phone, with who threw them. */
export function ReactionLayer() {
  const { me, nameOf } = useRoom();
  const { lang } = useStore();
  const label = useReactionLabel();
  const [items, setItems] = useState<Float[]>([]);
  const seq = useRef(0);
  useRoomEvent((e) => {
    if (e.k !== "react") return;
    const id = ++seq.current;
    const x = 10 + Math.random() * 56;
    setItems((list) => [...list.slice(-7), { id, r: e.r, name: nameOf(e.pid), x, mine: e.pid === me }]);
    window.setTimeout(() => setItems((list) => list.filter((f) => f.id !== id)), 2600);
  });
  return (
    <div className="react-layer" aria-live="polite">
      <AnimatePresence>
        {items.map((f) => (
          <motion.div
            key={f.id}
            className={`react-float react-${f.r} ${f.mine ? "is-mine" : ""}`}
            style={{ left: `${f.x}%` }}
            initial={{ y: 24, opacity: 0, scale: 0.7 }}
            animate={{ y: -220, opacity: [0, 1, 1, 0], scale: 1, rotate: f.x > 38 ? 3 : -3 }}
            transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1], opacity: { duration: 2.4, times: [0, 0.12, 0.7, 1] } }}
          >
            <span className={`react-label ${lang === "zh" ? "zh-display" : "en-display"}`}>{label(f.r)}</span>
            <span className="react-who">{f.name}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Four things anyone can call out across the table, at any moment. */
export function ReactionDock({ more = false }: { more?: boolean }) {
  const { act } = useRoom();
  const { ui } = useStore();
  const label = useReactionLabel();
  return (
    <div className={`react-dock ${more ? "is-more" : ""}`} role="group" aria-label={ui("reactCheers")}>
      {REACTIONS.map((r) => (
        <motion.button
          key={r}
          type="button"
          className={`react-btn react-${r}`}
          whileTap={{ scale: 0.9, y: -3 }}
          onClick={() => {
            act({ a: "react", r });
            haptic(8);
          }}
        >
          {label(r)}
        </motion.button>
      ))}
    </div>
  );
}

/* ---------------- arrivals and departures ---------------- */

export function ToastLayer() {
  const { me, nameOf } = useRoom();
  const { ui } = useStore();
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const seq = useRef(0);
  const names = useRef(new Map<string, string>());
  // remember names so a departure can still be named after the seat is gone
  const { room } = useRoom();
  useEffect(() => {
    for (const s of room?.seats ?? []) names.current.set(s.id, s.name);
  }, [room]);
  useRoomEvent((e) => {
    let text = "";
    if (e.k === "join" && e.pid !== me) text = ui("joinedT", { name: nameOf(e.pid) });
    else if (e.k === "left" && e.pid !== me) text = ui("leftT", { name: names.current.get(e.pid) ?? nameOf(e.pid) });
    else if (e.k === "host") text = e.pid === me ? ui("youHost") : ui("nowHost", { name: nameOf(e.pid) });
    if (!text) return;
    const id = ++seq.current;
    setToast({ id, text });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2400);
  });
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} className="toast toast-net" role="status" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}>
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A thin band at the top while the line is down. The game keeps its place on the server. */
export function ConnectionBanner() {
  const { status, reconnect, room } = useRoom();
  const { ui } = useStore();
  const show = !!room && (status === "reconnecting" || status === "connecting");
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="net-banner" role="status" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
          <WifiOff size={16} />
          <span>{ui("reconnecting")}</span>
          <button type="button" className="net-banner-btn" onClick={reconnect}>
            <RotateCw size={14} />
            {ui("retryNow")}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
