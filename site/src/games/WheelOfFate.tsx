import { Pencil, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import { DEFAULT_SLICES, sliceLabel, type Slice } from "../data/wheel";
import { DARES, TRUTHS, type Prompt } from "../data/truthDare";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { Sheet } from "../components/Sheet";
import { DareTimer } from "../components/DareTimer";
import { durationOf } from "../lib/duration";
import { PlayerPicker } from "../components/PlayerPicker";
import { PorcelainDefs } from "../components/Dish";
import { polar } from "../lib/geom";
import { UI } from "../i18n";

const KEY = "lazysusan.wheel.v2";
/* deep fills only, so porcelain text reads at ≥4.5:1 on every slice */
const COLORS = ["#ff5fa2", "#ffb82e", "#31b9ff", "#4be38f", "#b072ff", "#ff8c42", "#2ed3d9", "#f5df3b", "#8c86ff", "#ff6b5e"];

function loadSlices(): Slice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Slice[];
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    }
  } catch {
    /* defaults */
  }
  return DEFAULT_SLICES;
}

export function WheelOfFate({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang, sound } = useStore();
  const [slices, setSlices] = useState<Slice[]>(loadSlices);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<Slice | null>(null);
  const [picking, setPicking] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  /** each card drawn gets a fresh countdown */
  const [drawn, setDrawn] = useState(0);
  const truths = useRef(new Deck(TRUTHS.filter((p) => p.heat === 1)));
  const dares = useRef(new Deck(DARES.filter((p) => p.heat === 1)));
  const turn = useTurnOrder();
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  // a built-in drinking slice reads as the penalty set in settings, when there is one
  const label = (s: Slice) => tr(sliceLabel(s, custom));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(slices));
    } catch {
      /* fine */
    }
  }, [slices]);

  const table = useTurntable({
    count: slices.length,
    friction: 1.2,
    onTick: () => {
      if (sound) sfx.tick(0.7);
      haptic(5);
    },
    onSettle: (i) => {
      const s = slices[i];
      setResult(s);
      if (sound) sfx.settle();
      haptic([12, 40, 18]);
    },
  });

  const wheelRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (r: number) => wheelRef.current?.setAttribute("transform", `rotate(${r} 180 180)`);
    apply(table.rotation.get());
    return table.rotation.on("change", apply);
  }, [table.rotation]);
  useSpinSound(table.rotation);

  const step = table.step;
  const wedges = useMemo(() => {
    const R = 150;
    return slices.map((s, i) => {
      const a0 = 90 + i * step - step / 2;
      const a1 = a0 + step;
      const p0 = polar(180, 180, R, a0);
      const p1 = polar(180, 180, R, a1);
      const mid = 90 + i * step;
      return { s, i, d: `M 180 180 L ${p0.x} ${p0.y} A ${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`, mid, color: COLORS[i % COLORS.length] };
    });
  }, [slices, step]);

  const me = turn.current;

  const act = () => {
    if (!result) return;
    const note = label(result);
    const finish = () => {
      setResult(null);
      setPicking(false);
      setPrompt(null);
      turn.next();
    };
    switch (result.id) {
      case "sip":
        penalty.show({ who: [me.name], kind: "sip", note }, finish);
        return;
      case "full":
        penalty.show({ who: [me.name], kind: "full", note }, finish);
        return;
      case "two":
        penalty.show({ who: [me.name], kind: "two", note }, finish);
        return;
      case "neighbors":
        penalty.show({ who: [turn.left.name, turn.right.name].filter((n, i, a) => a.indexOf(n) === i), kind: "sip", note }, finish);
        return;
      case "all":
        penalty.show({ who: [], kind: "everyone", note }, finish);
        return;
      case "safe":
        penalty.show({ who: [me.name], kind: "safe", note }, finish);
        return;
      case "pick":
        setPicking(true);
        return;
      case "truth":
        setPrompt(truths.current.draw().card);
        setDrawn((n) => n + 1);
        return;
      case "dare":
        setPrompt(dares.current.draw().card);
        setDrawn((n) => n + 1);
        return;
      case "again":
        setResult(null);
        window.setTimeout(() => table.flick(), 250);
        return;
      default:
        // a custom penalty the host wrote
        penalty.show({ who: [me.name], kind: "sip", note }, finish);
    }
  };

  const rules = (
    <p>
      {lang === "zh"
        ? "轮到谁谁转，转盘停在指针上的那一格就是惩罚。点右上角的铅笔可以改成你们桌上自己的规矩。"
        : "Whoever's turn it is spins. The slice that stops at the pointer is the penalty. Tap the pencil to write your own table rules into the wheel."}
    </p>
  );

  return (
    <GameShell
      title={UI.gameWheel}
      rules={rules}
      onBack={onBack}
      penalty={penalty.call}
      onPenaltyDone={penalty.done}
      right={
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label={lang === "zh" ? "改转盘" : "Edit the wheel"}>
          <Pencil size={18} />
        </button>
      }
    >
      <div className="turn-line">
        <span className="hint">{ui("yourTurn")}</span>
        <span className="turn-name">{me?.name}</span>
      </div>

      <svg viewBox="0 0 360 380" className="wheel-svg" {...table.handlers} style={{ touchAction: "none" }}>
        <PorcelainDefs />
        <circle cx={180} cy={180} r={172} fill="url(#lampPool)" />
        <circle cx={180} cy={180} r={160} fill="var(--dusk-2)" filter="url(#dishShadow)" />
        <g ref={wheelRef}>
          {wedges.map((w) => (
            <g key={w.s.id + w.i}>
              <path d={w.d} fill={w.color} stroke="var(--night)" strokeWidth={2.5} />
              {/* labels run along the radius; on the left half they are flipped so nothing reads upside down */}
              <text
                transform={
                  Math.cos((w.mid * Math.PI) / 180) >= 0
                    ? `rotate(${w.mid} 180 180) translate(${180 + 54} 180)`
                    : `rotate(${w.mid + 180} 180 180) translate(${180 - 54} 180)`
                }
                textAnchor={Math.cos((w.mid * Math.PI) / 180) >= 0 ? "start" : "end"}
                dominantBaseline="central"
                fontSize={lang === "zh" ? (slices.length > 10 ? 13 : 15) : slices.length > 10 ? 11.5 : 13}
                fontWeight={800}
                fill="var(--night)"
              >
                {trim(label(w.s), lang === "zh" ? (slices.length > 10 ? 5 : 6) : slices.length > 10 ? 10 : 12)}
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
        {prompt && result ? (
          <motion.div key="prompt" className="porcelain rule-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="hint-ink">{label(result)}</p>
            <p className="prompt-text">{tr(prompt)}</p>
            <p className="hint-ink prompt-other">{lang === "zh" ? prompt.en : prompt.zh}</p>
            {durationOf(prompt) !== null && <DareTimer seconds={durationOf(prompt)!} lang={lang} resetKey={drawn} />}
            <div className="row" style={{ gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ color: "var(--haze)" }}
                onClick={() =>
                  penalty.show({ who: [me.name], kind: "sip" }, () => {
                    setResult(null);
                    setPrompt(null);
                    turn.next();
                  })
                }
              >
                {ui("pass")}
              </button>
              <button
                type="button"
                className="btn btn-jade btn-block"
                onClick={() => {
                  setResult(null);
                  setPrompt(null);
                  turn.next();
                }}
              >
                {lang === "zh" ? "做完了" : "Done"}
              </button>
            </div>
          </motion.div>
        ) : picking ? (
          <motion.div key="pick" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="hint" style={{ textAlign: "center" }}>
              {ui("chooseTarget")}
            </p>
            <PlayerPicker
              players={players}
              onPick={(p) =>
                penalty.show({ who: [p.name], kind: "sip", note: result ? label(result) : undefined }, () => {
                  setResult(null);
                  setPicking(false);
                  turn.next();
                })
              }
            />
          </motion.div>
        ) : result ? (
          <motion.div key="result" className="stack" style={{ gap: 10, alignItems: "center" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={`wheel-result ${lang === "zh" ? "zh-display" : "en-display"}`}>{label(result)}</p>
            <button type="button" className={`btn btn-lg btn-block ${result.kind === "safe" ? "btn-jade" : result.kind === "drink" || result.kind === "custom" ? "btn-penalty" : "btn-primary"}`} onClick={act}>
              {result.kind === "again" ? ui("spin") : ui("continue")}
            </button>
          </motion.div>
        ) : (
          <motion.div key="spin" className="stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => table.flick()} disabled={table.spinning}>
              {table.spinning ? ui("spinning") : ui("spin")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={editing} onClose={() => setEditing(false)} title={lang === "zh" ? "改转盘" : "Edit the wheel"}>
        <div className="stack" style={{ gap: 8 }}>
          {slices.map((s, i) => (
            <div key={s.id + i} className="field">
              <span className="wedge-dot" style={{ background: COLORS[i % COLORS.length] }} />
              <input
                value={label(s)}
                maxLength={16}
                onChange={(e) =>
                  setSlices((all) =>
                    all.map((x, k) => (k === i ? { ...x, id: x.kind === "custom" ? x.id : `custom-${i}`, kind: "custom", label: { zh: e.target.value, en: e.target.value } } : x)),
                  )
                }
              />
              <button type="button" className="icon-btn" disabled={slices.length <= 2} onClick={() => setSlices((all) => all.filter((_, k) => k !== i))} aria-label={ui("close")}>
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={slices.length >= 12}
              onClick={() => setSlices((all) => [...all, { id: `custom-${Date.now()}`, kind: "custom", label: { zh: "新惩罚", en: "New penalty" } }])}
            >
              <Plus size={16} /> {lang === "zh" ? "加一格" : "Add a slice"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSlices(DEFAULT_SLICES)}>
              {ui("reset")}
            </button>
          </div>
        </div>
      </Sheet>
    </GameShell>
  );
}

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
