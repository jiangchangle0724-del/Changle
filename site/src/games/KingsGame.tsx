import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore, type Player } from "../store";
import { Deck, randInt, shuffle } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { COMMANDS, commandText, type Command } from "../data/king";
import { GameShell, usePenalty } from "./GameShell";
import { Cloche } from "../components/Cloche";
import { DareTimer } from "../components/DareTimer";
import { durationOf } from "../lib/duration";
import { PlayerPicker } from "../components/PlayerPicker";
import { PorcelainDefs } from "../components/Dish";
import { UI, fill } from "../i18n";

type Token = "K" | number;
type Phase = "draw" | "king" | "command" | "refusers";

export function KingsGame({ onBack }: { onBack: () => void }) {
  const { players, ui, tr, lang, sound } = useStore();
  const commands = useRef(new Deck<Command>(COMMANDS));
  const [tokens, setTokens] = useState<Token[]>(() => deal(players.length));
  const [dealIndex, setDealIndex] = useState(0);
  const [pulled, setPulled] = useState<number | null>(null); // which stick in the holder was pulled
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<Phase>("draw");
  useEffect(() => {
    if (phase === "king" && sound) sfx.crown();
  }, [phase, sound]);
  /** `seconds`: the command names a time ("对视 30 秒"), so it gets a countdown; `n` tells draws apart */
  const [command, setCommand] = useState<{ text: string; other: string; seconds: number | null; n: number } | null>(null);
  const [lidOpen, setLidOpen] = useState(false);
  const [taken, setTaken] = useState<number[]>([]);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;

  const king = useMemo(() => {
    const i = tokens.indexOf("K");
    return i >= 0 ? players[i] : null;
  }, [tokens, players]);

  const sticks = useMemo(() => Array.from({ length: players.length }, (_, i) => ({ i, h: 150 + ((i * 37) % 5) * 6, x: 60 + (240 / Math.max(1, players.length - 1)) * i })), [players.length]);

  const pull = (stickIndex: number) => {
    if (pulled !== null || taken.includes(stickIndex)) return;
    setPulled(stickIndex);
    if (sound) {
      sfx.woodblock(1.3, 0.7);
      sfx.whoosh(0.3, true);
    }
    haptic(12);
    window.setTimeout(() => {
      setRevealed(true);
      // every stick sounds the same: the table must not hear who is king
      if (sound) sfx.pluck(6, 0.8);
    }, 420);
  };

  // once per player: a double tap on 记住了 (the card still fading out takes the second tap) must
  // not skip the next player, who would never see their number
  const confirmed = useRef(-1);
  const confirm = () => {
    if (confirmed.current === dealIndex) return;
    confirmed.current = dealIndex;
    setTaken((t) => [...t, pulled!]);
    setPulled(null);
    setRevealed(false);
    if (dealIndex + 1 >= players.length) setPhase("king");
    else setDealIndex((i) => i + 1);
  };

  const drawCommand = () => {
    const c = commands.current.draw().card;
    const nums = shuffle(Array.from({ length: players.length - 1 }, (_, i) => i + 1)).slice(0, c.people);
    const vars = { a: nums[0] ?? randInt(1, players.length - 1), b: nums[1] ?? randInt(1, players.length - 1), c: nums[2] ?? randInt(1, players.length - 1) };
    const words = commandText(c, custom);
    setCommand((prev) => ({ text: fill(tr(words), vars), other: fill(lang === "zh" ? words.en : words.zh, vars), seconds: durationOf(words), n: (prev?.n ?? 0) + 1 }));
    setLidOpen(false);
    setPhase("command");
  };

  const newRound = () => {
    setTokens(deal(players.length));
    confirmed.current = -1;
    setDealIndex(0);
    setTaken([]);
    setPulled(null);
    setRevealed(false);
    setCommand(null);
    setPhase("draw");
  };

  const current = players[dealIndex];
  const myToken = tokens[dealIndex];

  const rules = (
    <p>
      {custom
        ? lang === "zh"
          ? "每人抽一支签，只能自己看。一支是国王，其余是号码。国王现身后抽一张命令，命令只说号码不说名字：被叫到的号码自己站出来执行。谁不执行谁受罚。每轮重新抽。"
          : "Everyone draws a stick and looks at it alone. One is the king, the rest are numbers. The king draws a command. Commands call numbers, never names: whoever holds that number steps up. Refuse and take the penalty. Redraw every round."
        : lang === "zh"
          ? "每人抽一支签，只能自己看。一支是国王，其余是号码。国王现身后抽一张命令，命令只说号码不说名字：被叫到的号码自己站出来执行。谁不执行谁喝。每轮重新抽。"
          : "Everyone draws a stick and looks at it alone. One is the king, the rest are numbers. The king draws a command. Commands call numbers, never names: whoever holds that number steps up. Refuse and drink. Redraw every round."}
    </p>
  );

  return (
    <GameShell title={UI.gameKing} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <AnimatePresence mode="wait">
        {phase === "draw" && current && (
          <motion.div key={`draw-${dealIndex}`} className="stack" style={{ gap: 12 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <p className="turn-line">
              <span className="hint">{ui("passPhone")}</span>
              <span className="turn-name">{current.name}</span>
              <span className="hint tabular">
                {dealIndex + 1} / {players.length}
              </span>
            </p>
            <p className="hint" style={{ textAlign: "center" }}>
              {pulled === null ? (lang === "zh" ? "抽一支签，只能自己看" : "Draw a stick. Your eyes only.") : revealed ? (lang === "zh" ? "记住号码" : "Remember your number") : ""}
            </p>

            <svg viewBox="0 0 360 300" className="holder-svg">
              <PorcelainDefs />
              {/* the cup of sticks: back of the rim first, sticks, then the front face in front of them */}
              <ellipse cx={180} cy={170} rx={140} ry={16} fill="var(--dusk-3)" />
              <ellipse cx={180} cy={170} rx={132} ry={11} fill="var(--night)" />
              {sticks.map((s) => {
                const gone = taken.includes(s.i);
                const isPulled = pulled === s.i;
                return (
                  <motion.g
                    key={s.i}
                    style={{ cursor: gone || pulled !== null ? "default" : "pointer" }}
                    initial={false}
                    animate={{ y: isPulled ? -150 : gone ? 40 : 0, opacity: gone ? 0 : 1, rotate: isPulled ? -3 : 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 20 }}
                    onClick={() => pull(s.i)}
                    role="button"
                    aria-label={`stick ${s.i + 1}`}
                    aria-disabled={gone || pulled !== null}
                  >
                    <rect x={s.x - 5} y={170 - s.h} width={10} height={s.h + 110} rx={4} fill="url(#bamboo)" />
                    {/* hidden end: number band or the king's red band */}
                    <AnimatePresence>
                      {isPulled && revealed && (
                        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <rect x={s.x - 9} y={170 + 60} width={18} height={46} rx={5} fill={myToken === "K" ? "var(--gel)" : "var(--moon)"} />
                          <text x={s.x} y={170 + 84} textAnchor="middle" dominantBaseline="central" fontSize={myToken === "K" ? 14 : 15} fontWeight={800} fill="var(--night)" style={{ fontFamily: "var(--font-display)" }}>
                            {myToken === "K" ? "♛" : myToken}
                          </text>
                        </motion.g>
                      )}
                    </AnimatePresence>
                  </motion.g>
                );
              })}
              <path d="M 40 170 L 320 170 L 300 290 L 60 290 Z" fill="url(#plate)" filter="url(#dishShadow)" />
              <path d="M 40 170 A 140 16 0 0 0 320 170" fill="var(--dusk-3)" />
              <path d="M 52 184 L 308 184" stroke="var(--gel)" strokeWidth={2} opacity={0.9} />
              <path d="M 56 196 L 304 196" stroke="var(--gel)" strokeWidth={1} opacity={0.5} />
              <path d="M 70 276 L 290 276" stroke="var(--line)" strokeWidth={1} opacity={0.7} />
            </svg>

            <AnimatePresence>
              {revealed && (
                <motion.div key="tok" className="porcelain reveal-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
                  <p className={`word-big ${myToken === "K" ? "zh-display king-red" : "en-display"}`}>
                    {myToken === "K" ? (lang === "zh" ? "国王" : "King") : lang === "zh" ? `${myToken}号` : `No. ${myToken}`}
                  </p>
                  <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={confirm}>
                    {ui("gotIt")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === "king" && king && (
          <motion.div key="king" className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain reveal-card crown-card">
              <p className="hint-ink">{lang === "zh" ? "国王是" : "The king is"}</p>
              <p className={`word-big king-red ${lang === "zh" ? "zh-display" : "en-display"}`}>{king.name}</p>
              <p className="hint-ink">{lang === "zh" ? "其他人把号码记好，别说出来。" : "Everyone else: keep your number to yourself."}</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={drawCommand}>
              {lang === "zh" ? "国王抽命令" : "King draws a command"}
            </button>
          </motion.div>
        )}

        {phase === "command" && command && king && (
          <motion.div key="command" className="card-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="hint">{lang === "zh" ? "国王" : "King"}</span>
              <span className="turn-name">{king.name}</span>
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)}>
              <div className="prompt-card">
                <p className="prompt-text">{command.text}</p>
                <p className="hint-ink prompt-other">{command.other}</p>
              </div>
            </Cloche>
            {lidOpen && command.seconds !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <DareTimer seconds={command.seconds} lang={lang} resetKey={command.n} />
              </motion.div>
            )}
            {lidOpen && (
              <motion.div className="row" style={{ gap: 10 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setPhase("refusers")}>
                  {lang === "zh" ? "有人不做" : "Someone refuses"}
                </button>
                <button type="button" className="btn btn-jade btn-block" onClick={newRound}>
                  {lang === "zh" ? "执行完毕" : "Done. New round"}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {phase === "refusers" && (
          <motion.div key="refusers" className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="hint">
              {custom
                ? lang === "zh"
                  ? "谁不执行？点一下，他受罚。"
                  : "Who refused? Tap them. They take the penalty."
                : lang === "zh"
                  ? "谁不执行？点一下，他喝。"
                  : "Who refused? Tap them. They drink."}
            </p>
            <PlayerPicker players={players} onPick={(p: Player) => penalty.show({ who: [p.name], kind: "sip" }, newRound)} />
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}

function deal(n: number): Token[] {
  const t: Token[] = ["K", ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1)];
  return shuffle(t);
}
