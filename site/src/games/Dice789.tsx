import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { randInt } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { Glass } from "../components/Glass";
import { Die } from "../components/Dice";
import { PlayerPicker } from "../components/PlayerPicker";
import { UI } from "../i18n";
import { potStep } from "../shared/engine/games/dice";

type Outcome = "seven" | "eight" | "nine" | "ones" | "safe";

/** What a game under way keeps on the phone, to pick up after a reload: the shared glass and whose roll it is. */
type Kept = { dice: [number, number]; level: number; pot: number; outcome: Outcome | null; assigning: boolean; turn: number };

export function Dice789({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="dice" version={1}>
      {(saved) => <DiceGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function DiceGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, lang, sound } = useStore();
  const [dice, setDice] = useState<[number, number]>(saved?.dice ?? [3, 4]);
  const [rolling, setRolling] = useState(false);
  const [level, setLevel] = useState(saved?.level ?? 0.3);
  // with the table's own penalty the glass is a pot of it, counted in times (from 1)
  const [pot, setPot] = useState(saved?.pot ?? 1);
  const [outcome, setOutcome] = useState<Outcome | null>(saved?.outcome ?? null);
  const [assigning, setAssigning] = useState(saved?.assigning ?? false);
  const turn = useTurnOrder(saved?.turn ?? 0);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;
  const me = turn.current;
  // kept from the first roll on (the game has no end: leaving from the tally drops it)
  const [rolled, setRolled] = useState(!!saved);
  useKeepProgress<Kept>({ dice, level, pot, outcome, assigning, turn: turn.index }, rolled);

  const roll = () => {
    if (rolling) return;
    setRolled(true);
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
      if (o === "seven") {
        setLevel((l) => Math.min(1, l + 0.25));
        setPot((p) => potStep(p, "seven").pot);
      }
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
      case "nine": {
        const step = potStep(pot, outcome);
        penalty.show({ who: [me.name], kind: outcome === "eight" ? "two" : "full", note, times: custom ? step.take : undefined }, () => {
          setLevel((l) => (outcome === "eight" ? l / 2 : 0.3));
          setPot(step.pot);
          nextTurn();
        });
        return;
      }
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
    // with a penalty of its own the shared glass is a pot of that penalty: half of it, or all of it
    if (custom)
      switch (o) {
        case "seven":
          return lang === "zh" ? "七，罚池加一次" : "Seven. One more in the pot.";
        case "eight":
          return lang === "zh" ? "八，罚一半" : "Eight. Take half the pot.";
        case "nine":
          return lang === "zh" ? "九，全罚" : "Nine. Take the whole pot.";
        case "ones":
          return lang === "zh" ? "双一，指定一人全罚" : "Snake eyes. Pick someone to take the whole pot.";
        case "safe":
          return lang === "zh" ? "安全，下一位" : "Safe. Next.";
      }
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

  const actions = assigning ? undefined : outcome ? (
    <button type="button" className={`btn btn-lg ${outcome === "safe" || outcome === "seven" ? "btn-porcelain" : "btn-penalty"}`} onClick={resolve}>
      {outcome === "safe" || outcome === "seven" ? ui("next") : outcome === "ones" ? ui("pickOne") : custom ? ui("takePenalty") : ui("drink")}
    </button>
  ) : (
    <button type="button" className="btn btn-primary btn-lg" onClick={roll} disabled={rolling}>
      {rolling ? (lang === "zh" ? "骰子还在转" : "Rolling") : lang === "zh" ? "掷骰子" : "Roll"}
    </button>
  );

  const rules = (
    <p>
      {custom
        ? lang === "zh"
          ? "屏幕中间是大家共用的罚池，上面的数字是惩罚要做几次，从 1 开始。轮流掷两颗骰子：点数加起来是 7，罚池加一次；8，罚一半（3 次就罚 2 次）；9，全罚；掷出两个 1，指定一个人全罚。罚空了，罚池回到 1。其他点数安全，传给下一位。"
          : "A shared pot sits in the middle of the screen. Its number is how many times the penalty is done, starting at 1. Take turns rolling two dice: a total of 7 adds one to the pot; 8, take half of it (half of 3 is 2); 9, take all of it. Double ones: pick someone to take the whole pot. An emptied pot goes back to 1. Anything else is safe, pass the dice."
        : lang === "zh"
          ? "桌子中间放一个公杯。轮流掷两颗骰子：点数加起来是 7，往公杯里加酒；8，喝掉一半；9，全部喝完；掷出两个 1，指定一个人把公杯喝完。其他点数安全，传给下一位。"
          : "A shared glass sits in the middle. Take turns rolling two dice: a total of 7 pours more into the glass; 8, drink half of it; 9, drink all of it. Double ones: pick someone to finish the glass. Anything else is safe, pass the dice."}
    </p>
  );

  return (
    <GameShell title={UI.gameDice} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: me?.id }} actions={actions}>
      <div className="turn-line">
        <span className="hint">{ui("yourTurn")}</span>
        <span className="turn-name">{me?.name}</span>
      </div>

      <div className="dice-stage">
        <Glass level={level} size={110} label={custom ? (lang === "zh" ? `罚池 ×${pot}` : `The pot ×${pot}`) : lang === "zh" ? "公杯" : "Shared glass"} />
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
                penalty.show({ who: [p.name], kind: "full", note: outcomeLabel("ones"), times: custom ? potStep(pot, "ones").take : undefined }, () => {
                  setLevel(0.3);
                  setPot(1);
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

          </motion.div>
        ) : null}
      </AnimatePresence>
    </GameShell>
  );
}
