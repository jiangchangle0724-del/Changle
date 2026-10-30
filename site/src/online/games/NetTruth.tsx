import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cloche } from "../../components/Cloche";
import { PorcelainDefs } from "../../components/Dish";
import { polar } from "../../lib/geom";
import { UI } from "../../i18n";
import type { TruthView } from "../../shared/protocol";
import { useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom } from "../RoomContext";
import { useNetSpin } from "../useNetSpin";
import { HostButton, HostRow, TurnLine, useYourTurn, Waiting } from "./common";

export function NetTruth({ v, onLeave }: { v: TruthView; onLeave: () => void }) {
  const { room, me, isHost, g, nameOf } = useRoom();
  const { ui, tr, lang } = useStore();
  const seats = room?.seats ?? [];
  const count = Math.max(2, seats.length);

  // the bottle rests where it last pointed
  const last = useRef(0);
  const chosenIndex = v.chosen ? seats.findIndex((s) => s.id === v.chosen) : -1;
  if (chosenIndex >= 0) last.current = chosenIndex;
  const rest = Math.min(last.current, count - 1);

  const mySpin = v.phase === "spin" && v.spinner === me;
  const { table, weak } = useNetSpin({ scope: "truth", count, canSpin: mySpin, rest, friction: 1.1, tick: 0.55 });
  const landed = useReached(v.revealAt) && !table.spinning;
  const chosenMe = v.chosen === me;
  useYourTurn(mySpin);
  useYourTurn(v.phase === "choose" && landed && chosenMe);

  const bottleRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => bottleRef.current?.setAttribute("transform", `rotate(${-r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);

  const ring = useMemo(() => seats.map((s, i) => ({ ...s, ...polar(180, 180, 132, -90 + i * (360 / count)) })), [seats, count]);

  const [lid, setLid] = useState(false);
  useEffect(() => setLid(false), [v.prompt?.zh, v.phase]);

  const [nudged, setNudged] = useState(false);
  useEffect(() => {
    if (!weak) return;
    setNudged(true);
    const id = window.setTimeout(() => setNudged(false), 1800);
    return () => window.clearTimeout(id);
  }, [weak]);

  const lit = (pid: string) => pid === v.chosen && (v.phase !== "choose" || landed);

  const rules = (
    <p>
      {lang === "zh"
        ? "轮到谁，谁的手机上可以拨瓶子，所有人的手机上瓶子一起转。瓶口指到谁，谁在自己手机上选真心话或大冒险，点开念出来。不做就认罚。被指到的人下一轮转瓶子。"
        : "Whoever's turn it is flicks the bottle on their phone; it spins on every phone at once. Whoever it points at picks truth or dare on their own phone, lifts the lid and reads it out. Refuse and take the penalty. The one it picked spins next."}
    </p>
  );

  return (
    <NetFrame title={UI.gameTruth} rules={rules} onLeave={onLeave}>
      <div className="segmented-row" style={{ justifyContent: "center" }}>
        <span className="hint">{ui("heat")}</span>
        <div className="lang-tab heat-tab" role="group" aria-label={ui("heat")}>
          <button aria-pressed={v.heat === 1} disabled={!isHost} onClick={() => g("heat", { heat: 1 })}>
            {ui("mild")}
          </button>
          <button aria-pressed={v.heat === 2} disabled={!isHost} onClick={() => g("heat", { heat: 2 })} className="heat-spicy">
            {ui("spicy")}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {v.phase !== "card" ? (
          <motion.div key="bottle" className="bottle-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <svg viewBox="0 0 360 360" className="bottle-svg" {...table.handlers} style={{ touchAction: "none", cursor: mySpin ? "grab" : "default" }}>
              <PorcelainDefs />
              <defs>
                <linearGradient id="netBottleGlass" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0f7a55" />
                  <stop offset="40%" stopColor="#3be0a4" />
                  <stop offset="60%" stopColor="#1fb683" />
                  <stop offset="100%" stopColor="#0b5a3f" />
                </linearGradient>
              </defs>
              <circle cx={180} cy={180} r={170} fill="url(#lampPool)" />
              <circle cx={180} cy={180} r={100} fill="url(#plate)" filter="url(#dishShadow)" />
              <circle cx={180} cy={180} r={92} fill="none" stroke="var(--line)" strokeWidth={1.6} opacity={0.9} />
              <circle cx={180} cy={180} r={86} fill="none" stroke="var(--line)" strokeWidth={0.8} opacity={0.6} />
              {ring.map((s) => (
                <g key={s.id} transform={`translate(${s.x} ${s.y})`} opacity={s.on ? 1 : 0.45}>
                  <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} animate={{ scale: lit(s.id) ? 1.25 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
                    <circle
                      r={22}
                      fill={lit(s.id) ? "var(--gel)" : "rgba(255,255,255,0.07)"}
                      stroke={s.id === me ? "var(--moon)" : lit(s.id) ? "var(--moon)" : "rgba(181,178,220,0.3)"}
                      strokeWidth={s.id === me ? 2.2 : 1.5}
                    />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={seats.length > 8 ? 9 : 10.5} fontWeight={700} fill={lit(s.id) ? "var(--night)" : "var(--moon)"}>
                      {s.name.length > 5 ? s.name.slice(0, 4) + "…" : s.name}
                    </text>
                  </motion.g>
                </g>
              ))}
              <g ref={bottleRef}>
                <g filter="url(#dishShadow)">
                  <path d="M 164 236 L 164 152 C 164 134 170 130 174 118 L 174 98 L 186 98 L 186 118 C 190 130 196 134 196 152 L 196 236 Q 180 246 164 236 Z" fill="url(#netBottleGlass)" />
                  <rect x={171} y={86} width={18} height={14} rx={3} fill="var(--moon)" />
                  <rect x={169} y={100} width={22} height={3} fill="rgba(0,0,0,0.25)" />
                  <rect x={168} y={166} width={24} height={42} rx={3} fill="var(--moon)" opacity={0.95} />
                  <rect x={172} y={176} width={16} height={2} fill="var(--night)" opacity={0.7} />
                  <rect x={174} y={184} width={12} height={2} fill="var(--gel)" opacity={1} />
                  <rect x={172} y={192} width={16} height={2} fill="var(--night)" opacity={0.7} />
                  <rect x={169} y={140} width={4} height={80} rx={2} fill="rgba(255,255,255,0.35)" />
                </g>
              </g>
            </svg>

            <div className="bottle-actions">
              {v.phase === "spin" &&
                (mySpin ? (
                  <>
                    <button type="button" className="btn btn-primary btn-lg" onClick={() => table.flick()} disabled={table.spinning}>
                      {table.spinning ? ui("spinning") : lang === "zh" ? "转瓶子" : "Spin the bottle"}
                    </button>
                    <p className="hint">{nudged ? (lang === "zh" ? "再用力一点" : "Harder than that") : lang === "zh" ? "也可以直接用手拨" : "Or flick it with a finger"}</p>
                  </>
                ) : (
                  <>
                    <TurnLine pid={v.spinner} />
                    <Waiting>{lang === "zh" ? `等 ${nameOf(v.spinner)} 转瓶子` : `Waiting for ${nameOf(v.spinner)} to spin`}</Waiting>
                  </>
                ))}
              {v.phase === "choose" &&
                (!landed ? (
                  <Waiting>{ui("spinning")}</Waiting>
                ) : chosenMe ? (
                  <motion.div className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <p className="choose-who">
                      <span className="turn-name">{ui("yourTurnNow")}</span>
                    </p>
                    <div className="row" style={{ gap: 10, width: "100%" }}>
                      <button type="button" className="btn btn-porcelain btn-lg btn-block" onClick={() => g("pick", { kind: "truth" })}>
                        {lang === "zh" ? "真心话" : "Truth"}
                      </button>
                      <button type="button" className="btn btn-gold btn-lg btn-block" onClick={() => g("pick", { kind: "dare" })}>
                        {lang === "zh" ? "大冒险" : "Dare"}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <p className="choose-who">
                      <span className="turn-name">{nameOf(v.chosen)}</span>
                    </p>
                    <Waiting>{lang === "zh" ? "正在选真心话还是大冒险" : "is choosing truth or dare"}</Waiting>
                  </motion.div>
                ))}
            </div>
          </motion.div>
        ) : (
          v.prompt && (
            <motion.div key={`card-${v.prompt.zh}`} className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="turn-line">
                <span className="turn-name">{chosenMe ? ui("yourTurnNow") : nameOf(v.chosen)}</span>
                <span className={`kind-tag ${v.kind}`}>{v.kind === "truth" ? (lang === "zh" ? "真心话" : "Truth") : lang === "zh" ? "大冒险" : "Dare"}</span>
              </p>
              <Cloche open={lid} onOpen={() => setLid(true)}>
                <div className="prompt-card">
                  <p className="prompt-text">{tr(v.prompt)}</p>
                  <p className="hint-ink prompt-other">{lang === "zh" ? v.prompt.en : v.prompt.zh}</p>
                </div>
              </Cloche>
              <AnimatePresence>
                {lid &&
                  (chosenMe ? (
                    <motion.div className="row" style={{ gap: 10 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                      <button type="button" className="btn btn-penalty btn-block" onClick={() => g("pass")}>
                        {ui("pass")}
                      </button>
                      <button type="button" className="btn btn-jade btn-block" onClick={() => g("done")}>
                        {lang === "zh" ? "做完了" : "Done it"}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                      <Waiting>{lang === "zh" ? `看 ${nameOf(v.chosen)} 做` : `Over to ${nameOf(v.chosen)}`}</Waiting>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </motion.div>
          )
        )}
      </AnimatePresence>

      <HostRow>
        {v.phase === "spin" && !mySpin && <HostButton onClick={() => g("skip")}>{ui("skip")}</HostButton>}
        {v.phase !== "spin" && !chosenMe && <HostButton onClick={() => g(v.phase === "card" ? "done" : "skip")}>{ui("skip")}</HostButton>}
      </HostRow>
    </NetFrame>
  );
}
