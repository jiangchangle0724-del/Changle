import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useStore } from "../store";
import { randInt } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { Glass } from "../components/Glass";
import { Die } from "../components/Dice";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI } from "../i18n";

type Outcome = "seven" | "eight" | "nine" | "ones" | "safe";

export function Dice789({ onBack }: { onBack: () => void }) {
  const { players, ui, lang, sound } = useStore();
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  const [level, setLevel] = useState(0.3);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [assigning, setAssigning] = useState(false);
  const turn = useTurnOrder();
  const penalty = usePenalty();
  const me = turn.current;

  const roll = () => {
    if (rolling) return;
    setOutcome(null);
    setRolling(true);
    if (sound) sfx.dice(0.95);
    haptic([8, 30, 8, 30, 8]);
    const a = randInt(1, 6);
    const b = randInt(1, 6);
    window.setTimeout(() => {
      setDice([a, b]);
      setRolling(false);
      const sum = a + b;
      const o: Outcome = a === 1 && b === 1 ? "ones" : sum === 7 ? "seven" : sum === 8 ? "eight" : sum === 9 ? "nine" : "safe";
      if (sound) {
        if (o === "seven") sfx.pour(0.6);
        else if (o === "ones") sfx.gong("small");
        else if (o === "safe") sfx.settle();
        else sfx.drum();
      }
      setOutcome(o);
      if (o === "seven") setLevel((l) => Math.min(1, l + 0.25));
    }, 950);
  };

  const resolve = () => {
    if (!outcome) return;
    const note = outcomeLabel(outcome);
    switch (outcome) {
      case "seven":
      case "safe":
        nextTurn();
        return;
      case "eight":
        penalty.show({ who: [me.name], kind: "two", note }, () => {
          setLevel((l) => l / 2);
          nextTurn();
        });
        return;
      case "nine":
        penalty.show({ who: [me.name], kind: "full", note }, () => {
          setLevel(0.3);
          nextTurn();
        });
        return;
      case "ones":
        setAssigning(true);
        return;
    }
  };

  const nextTurn = () => {
    setOutcome(null);
    setAssigning(false);
    turn.next();
  };

  function outcomeLabel(o: Outcome) {
    switch (o) {
      case "seven":
        return lang === "zh" ? "七，加酒" : "Seven. Pour more in.";
      case "eight":
        return lang === "zh" ? "八，喝一半" : "Eight. Drink half.";
      case "nine":
        return lang === "zh" ? "九，全喝" : "Nine. Drink it all.";
      case "ones":
        return lang === "zh" ? "双一，指定一人全喝" : "Snake eyes. Pick someone to drink it all.";
      case "safe":
        return lang === "zh" ? "安全，下一位" : "Safe. Next.";
    }
  }

  const rules = (
    <p>
      {lang === "zh"
        ? "桌子中间放一个公杯。轮流掷两颗骰子：点数加起来是 7，往公杯里加酒；8，喝掉一半；9，全部喝完；掷出两个 1，指定一个人把公杯喝完。其他点数安全，传给下一位。"
        : "A shared glass sits in the middle. Take turns rolling two dice: a total of 7 pours more into the glass; 8, drink half of it; 9, drink all of it. Double ones: pick someone to finish the glass. Anything else is safe, pass the dice."}
    </p>
  );

  return (
    <GameShell title={UI.gameDice} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done}>
      <div className="turn-line">
        <span className="hint">{ui("yourTurn")}</span>
        <span className="turn-name">{me?.name}</span>
      </div>

      <div className="dice-stage">
        <Glass level={level} size={110} label={lang === "zh" ? "公杯" : "Shared glass"} />
        <div className="bowl">
          <div className="bowl-dice">
            <Die value={dice[0]} rolling={rolling} size={84} />
            <Die value={dice[1]} rolling={rolling} size={84} delay={0.08} />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {assigning ? (
          <motion.div key="assign" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="hint" style={{ textAlign: "center" }}>
              {ui("chooseTarget")}
            </p>
            <PlayerPicker
              players={players}
              onPick={(p) =>
                penalty.show({ who: [p.name], kind: "full", note: outcomeLabel("ones") }, () => {
                  setLevel(0.3);
                  nextTurn();
                })
              }
            />
          </motion.div>
        ) : outcome ? (
          <motion.div key={`out-${outcome}`} className="stack" style={{ gap: 12, alignItems: "center" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={`dice-sum tabular ${outcome === "safe" || outcome === "seven" ? "" : "dice-hot"}`}>
              {dice[0] + dice[1]}
            </p>
            <p className="dice-outcome">{outcomeLabel(outcome)}</p>
            <button type="button" className={`btn btn-lg btn-block ${outcome === "safe" || outcome === "seven" ? "btn-porcelain" : "btn-penalty"}`} onClick={resolve}>
              {outcome === "safe" || outcome === "seven" ? ui("next") : outcome === "ones" ? ui("pickOne") : ui("drink")}
            </button>
          </motion.div>
        ) : (
          <motion.div key="roll" className="stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={roll} disabled={rolling}>
              {rolling ? (lang === "zh" ? "骰子还在转" : "Rolling") : lang === "zh" ? "掷骰子" : "Roll"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
