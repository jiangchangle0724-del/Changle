import { Pencil, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PorcelainDefs } from "../../components/Dish";
import { Sheet } from "../../components/Sheet";
import { sliceLabel } from "../../data/wheel";
import { polar } from "../../lib/geom";
import { UI } from "../../i18n";
import type { WheelSliceView, WheelView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom } from "../RoomContext";
import { useNetSpin } from "../useNetSpin";
import { HostButton, HostRow, SeatPicker, TurnLine, useYourTurn, Waiting } from "./common";

/* deep fills only, so porcelain text reads at 4.5:1 or better on every slice */
const COLORS = ["#ff5fa2", "#ffb82e", "#31b9ff", "#4be38f", "#b072ff", "#ff8c42", "#2ed3d9", "#f5df3b", "#8c86ff", "#ff6b5e"];

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function NetWheel({ v, onLeave }: { v: WheelView; onLeave: () => void }) {
  const { me, isHost, g, nameOf } = useRoom();
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  // a built-in drinking slice reads as the table's own penalty, when the host set one
  const label = (s: WheelSliceView) => tr(sliceLabel(s, custom));
  const mine = v.turn === me;
  const canAct = mine || isHost;
  const count = v.slices.length;

  const last = useRef(0);
  if (v.result !== null) last.current = v.result;
  const rest = Math.min(last.current, count - 1);

  const mySpin = v.phase === "spin" && mine;
  const { table, weak } = useNetSpin({ scope: "wheel", count, canSpin: mySpin, rest, friction: 1.2, tick: 0.7 });
  const landed = useReached(v.revealAt) && !table.spinning;
  useYourTurn(mySpin);

  const wheelRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => wheelRef.current?.setAttribute("transform", `rotate(${r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);

  const step = 360 / Math.max(1, count);
  const wedges = useMemo(() => {
    const R = 150;
    return v.slices.map((s, i) => {
      const a0 = 90 + i * step - step / 2;
      const a1 = a0 + step;
      const p0 = polar(180, 180, R, a0);
      const p1 = polar(180, 180, R, a1);
      const mid = 90 + i * step;
      return { s, i, d: `M 180 180 L ${p0.x} ${p0.y} A ${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`, mid, color: COLORS[i % COLORS.length] };
    });
  }, [v.slices, step]);

  const [nudged, setNudged] = useState(false);
  useEffect(() => {
    if (!weak) return;
    setNudged(true);
    const id = window.setTimeout(() => setNudged(false), 1800);
    return () => window.clearTimeout(id);
  }, [weak]);

  const [editing, setEditing] = useState(false);
  const result = v.result !== null ? v.slices[v.result] : null;
  const showResult = v.phase !== "spin" && v.phase !== "spinning" && landed;

  const rules = (
    <p>
      {lang === "zh"
        ? "轮到谁谁转，转盘在每部手机上一起转，停在指针上的那一格就是惩罚。主人可以把转盘改成你们桌自己的规矩。"
        : "Whoever's turn it is spins; the wheel turns on every phone at once. The slice that stops at the pointer is the penalty. The host can rewrite the slices with your own table rules."}
    </p>
  );

  return (
    <NetFrame title={UI.gameWheel} rules={rules} onLeave={onLeave}>
      <TurnLine pid={v.turn} />

      <svg viewBox="0 0 360 380" className="wheel-svg" {...table.handlers} style={{ touchAction: "none", cursor: mySpin ? "grab" : "default" }}>
        <PorcelainDefs />
        <circle cx={180} cy={180} r={172} fill="url(#lampPool)" />
        <circle cx={180} cy={180} r={160} fill="var(--dusk-2)" filter="url(#dishShadow)" />
        <g ref={wheelRef}>
          {wedges.map((w) => (
            <g key={w.s.id + w.i}>
              <path d={w.d} fill={w.color} stroke="var(--night)" strokeWidth={2.5} />
              <text
                transform={
                  Math.cos((w.mid * Math.PI) / 180) >= 0
                    ? `rotate(${w.mid} 180 180) translate(${180 + 54} 180)`
                    : `rotate(${w.mid + 180} 180 180) translate(${180 - 54} 180)`
                }
                textAnchor={Math.cos((w.mid * Math.PI) / 180) >= 0 ? "start" : "end"}
                dominantBaseline="central"
                fontSize={lang === "zh" ? (count > 10 ? 13 : 15) : count > 10 ? 11.5 : 13}
                fontWeight={800}
                fill="var(--night)"
              >
                {trim(label(w.s), lang === "zh" ? (count > 10 ? 5 : 6) : count > 10 ? 10 : 12)}
              </text>
            </g>
          ))}
        </g>
        <circle cx={180} cy={180} r={30} fill="url(#plate)" filter="url(#softShadow)" />
        <circle cx={180} cy={180} r={10} fill="var(--moon)" />
        <circle cx={180} cy={180} r={160} fill="none" stroke="var(--moon)" strokeWidth={3} opacity={0.9} />
        <path d="M 180 330 L 166 362 Q 180 356 194 362 Z" fill="var(--moon)" filter="url(#softShadow)" />
      </svg>

      <AnimatePresence mode="wait">
        {showResult && v.phase === "prompt" && v.prompt ? (
          <motion.div key="prompt" className="porcelain rule-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="hint-ink">{result ? label(result) : ""}</p>
            <p className="prompt-text">{tr(v.prompt)}</p>
            <p className="hint-ink prompt-other">{lang === "zh" ? v.prompt.en : v.prompt.zh}</p>
            {canAct ? (
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                {mine && (
                  <button type="button" className="btn btn-penalty btn-block" onClick={() => g("pass")}>
                    {ui("pass")}
                  </button>
                )}
                <button type="button" className="btn btn-jade btn-block" onClick={() => g("done")}>
                  {lang === "zh" ? "做完了" : "Done"}
                </button>
              </div>
            ) : (
              <p className="hint-ink" style={{ marginTop: 10 }}>
                {lang === "zh" ? `看 ${nameOf(v.turn)} 做` : `Over to ${nameOf(v.turn)}`}
              </p>
            )}
          </motion.div>
        ) : showResult && v.phase === "pick" ? (
          <motion.div key="pick" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className={`wheel-result ${lang === "zh" ? "zh-display" : "en-display"}`}>{result ? label(result) : ""}</p>
            {canAct ? (
              <>
                <p className="hint" style={{ textAlign: "center" }}>
                  {ui("chooseTarget")}
                </p>
                <SeatPicker exclude={[v.turn]} onPick={(pid) => g("pick", { target: pid })} />
              </>
            ) : (
              <Waiting>
                {custom
                  ? lang === "zh"
                    ? `${nameOf(v.turn)} 在挑谁受罚`
                    : `${nameOf(v.turn)} is choosing who takes the penalty`
                  : lang === "zh"
                    ? `${nameOf(v.turn)} 在挑谁喝`
                    : `${nameOf(v.turn)} is choosing who drinks`}
              </Waiting>
            )}
          </motion.div>
        ) : showResult && v.phase === "result" ? (
          <motion.div key={`result-${v.result}`} className="stack" style={{ gap: 10, alignItems: "center" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={`wheel-result ${lang === "zh" ? "zh-display" : "en-display"}`}>{result ? label(result) : ""}</p>
            {canAct ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {ui("next")}
              </button>
            ) : (
              <Waiting>{ui("waitingFor", { name: nameOf(v.turn) })}</Waiting>
            )}
          </motion.div>
        ) : (
          <motion.div key="spin" className="stack" style={{ gap: 6 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {mySpin ? (
              <>
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => table.flick()} disabled={table.spinning}>
                  {table.spinning ? ui("spinning") : ui("spin")}
                </button>
                {nudged && (
                  <p className="hint" style={{ textAlign: "center" }}>
                    {lang === "zh" ? "再用力一点" : "Harder than that"}
                  </p>
                )}
              </>
            ) : v.phase === "spin" ? (
              <Waiting>{lang === "zh" ? `等 ${nameOf(v.turn)} 转` : `Waiting for ${nameOf(v.turn)} to spin`}</Waiting>
            ) : (
              <Waiting>{ui("spinning")}</Waiting>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HostRow>
        {v.phase !== "spinning" && !mine && <HostButton onClick={() => g("skip")}>{ui("skip")}</HostButton>}
        {(v.phase === "spin" || v.phase === "result") && (
          <HostButton onClick={() => setEditing(true)}>
            <Pencil size={14} />
            {lang === "zh" ? "改转盘" : "Edit the wheel"}
          </HostButton>
        )}
      </HostRow>

      {isHost && <SliceEditor open={editing} onClose={() => setEditing(false)} slices={v.slices} onSave={(list) => g("slices", { slices: list })} onReset={() => g("reset")} />}
    </NetFrame>
  );
}

function SliceEditor({ open, onClose, slices, onSave, onReset }: { open: boolean; onClose: () => void; slices: WheelSliceView[]; onSave: (s: WheelSliceView[]) => void; onReset: () => void }) {
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const [draft, setDraft] = useState(slices);
  useEffect(() => {
    if (open) setDraft(slices);
  }, [open, slices]);
  return (
    <Sheet open={open} onClose={onClose} title={lang === "zh" ? "改转盘" : "Edit the wheel"}>
      <div className="stack" style={{ gap: 8 }}>
        {draft.map((s, i) => (
          <div key={s.id + i} className="field">
            <span className="wedge-dot" style={{ background: COLORS[i % COLORS.length] }} />
            <input
              value={tr(sliceLabel(s, custom))}
              maxLength={16}
              aria-label={`${i + 1}`}
              onChange={(e) => setDraft((all) => all.map((x, k) => (k === i ? { id: x.kind === "custom" ? x.id : `c${i}`, kind: "custom", label: { zh: e.target.value, en: e.target.value } } : x)))}
            />
            <button type="button" className="icon-btn" disabled={draft.length <= 2} onClick={() => setDraft((all) => all.filter((_, k) => k !== i))} aria-label={ui("close")}>
              <X size={16} />
            </button>
          </div>
        ))}
        <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={draft.length >= 12}
            onClick={() => setDraft((all) => [...all, { id: `c${Date.now() % 100000}`, kind: "custom", label: { zh: "新惩罚", en: "New penalty" } }])}
          >
            <Plus size={16} /> {lang === "zh" ? "加一格" : "Add a slice"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            {ui("reset")}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            onSave(draft.filter((s) => tr(s.label).trim()));
            onClose();
          }}
        >
          {ui("save")}
        </button>
      </div>
    </Sheet>
  );
}
