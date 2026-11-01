import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Die } from "../../components/Dice";
import { Glass } from "../../components/Glass";
import { haptic } from "../../lib/sfx";
import type { DiceOutcome, DiceView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { UI } from "../../i18n";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom } from "../RoomContext";
import { HostButton, HostRow, SeatPicker, TurnLine, useYourTurn, Waiting } from "./common";

const ROLL_MS = 950;

export function NetDice({ v, onLeave }: { v: DiceView; onLeave: () => void }) {
  const { me, isHost, g, nameOf } = useRoom();
  const { ui, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const mine = v.turn === me;
  const canAct = mine || isHost;
  const landed = useReached(v.rolledAt + ROLL_MS);
  const rolling = v.roll > 0 && !landed;
  useYourTurn(mine && v.phase === "roll");

  // the shared glass only moves once the dice have landed
  const [level, setLevel] = useState(v.level);
  useEffect(() => {
    if (landed) setLevel(v.level);
  }, [landed, v.level]);
  // with the table's own penalty the glass is a pot of it, counted in times; it moves when the glass does
  const [pot, setPot] = useState(v.pot ?? 1);
  useEffect(() => {
    if (landed) setPot(v.pot ?? 1);
  }, [landed, v.pot]);

  const label = (o: DiceOutcome) => {
    // with the table's own penalty the shared glass is a pot of that penalty: half of it, or all of it
    if (custom)
      switch (o) {
        case "seven":
          return lang === "zh" ? "七，罚池加一次" : "Seven. One more in the pot.";
        case "eight":
          return lang === "zh" ? "八，罚一半" : "Eight. Take half the pot.";
        case "nine":
          return lang === "zh" ? "九，全罚" : "Nine. Take the whole pot.";
        case "ones":
          return lang === "zh" ? "双一，指定一个人全罚" : "Snake eyes. Pick someone to take the whole pot.";
        case "safe":
          return lang === "zh" ? "安全，传给下一位" : "Safe. Pass the dice.";
      }
    switch (o) {
      case "seven":
        return lang === "zh" ? "七，往公杯里加酒" : "Seven. Pour more into the glass.";
      case "eight":
        return lang === "zh" ? "八，喝掉一半" : "Eight. Drink half of it.";
      case "nine":
        return lang === "zh" ? "九，全部喝完" : "Nine. Drink all of it.";
      case "ones":
        return lang === "zh" ? "双一，指定一个人喝完公杯" : "Snake eyes. Pick someone to finish the glass.";
      case "safe":
        return lang === "zh" ? "安全，传给下一位" : "Safe. Pass the dice.";
    }
  };

  const rules = (
    <p>
      {custom
        ? lang === "zh"
          ? "屏幕中间是大家共用的罚池，每部手机上看到的是同一个，上面的数字是惩罚要做几次，从 1 开始。轮到你就掷两颗骰子：加起来 7，罚池加一次；8，罚一半（3 次就罚 2 次）；9，全罚；两个 1，指定一个人全罚。罚空了，罚池回到 1。其他点数安全。"
          : "One shared pot sits in the middle of the screen; every phone shows the same one. Its number is how many times the penalty is done, starting at 1. On your turn, roll two dice: a total of 7 adds one to the pot; 8, take half of it (half of 3 is 2); 9, take all of it; double ones, pick someone to take the whole pot. An emptied pot goes back to 1. Anything else is safe."
        : lang === "zh"
          ? "桌子中间一个公杯，每部手机上看到的是同一个。轮到你就掷两颗骰子：加起来 7，往公杯里加酒；8，喝掉一半；9，全部喝完；两个 1，指定一个人把公杯喝完。其他点数安全。"
          : "One shared glass sits in the middle; every phone shows the same one. On your turn, roll two dice: a total of 7 pours more in; 8, drink half; 9, drink it all; double ones, pick someone to finish the glass. Anything else is safe."}
    </p>
  );

  const showResult = v.roll > 0 && landed && v.outcome;

  return (
    <NetFrame title={UI.gameDice} rules={rules} onLeave={onLeave}>
      <TurnLine pid={v.turn} />

      <div className="dice-stage">
        <Glass level={level} size={110} label={custom ? (lang === "zh" ? `罚池 ×${pot}` : `The pot ×${pot}`) : lang === "zh" ? "公杯" : "Shared glass"} />
        <motion.button
          type="button"
          className="bowl"
          disabled={!canAct || v.phase !== "roll" || rolling}
          onClick={() => {
            g("roll");
            haptic([8, 30, 8, 30, 8]);
          }}
          whileTap={{ scale: 0.97 }}
          aria-label={lang === "zh" ? "掷骰子" : "Roll"}
          style={{ cursor: canAct && v.phase === "roll" ? "pointer" : "default" }}
        >
          <div className="bowl-dice">
            <Die value={v.dice[0]} rolling={rolling} size={84} />
            <Die value={v.dice[1]} rolling={rolling} size={84} delay={0.08} />
          </div>
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {v.phase === "assign" && landed ? (
          <motion.div key="assign" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="dice-outcome">{label("ones")}</p>
            {canAct ? (
              <>
                <p className="hint" style={{ textAlign: "center" }}>
                  {ui("chooseTarget")}
                </p>
                <SeatPicker onPick={(pid) => g("assign", { target: pid })} />
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
          <motion.div key={`out-${v.roll}`} className="stack" style={{ gap: 12, alignItems: "center" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={`dice-sum tabular ${v.outcome === "safe" || v.outcome === "seven" ? "" : "dice-hot"}`}>{v.dice[0] + v.dice[1]}</p>
            <p className="dice-outcome">{label(v.outcome!)}</p>
            {canAct ? (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
                {ui("next")}
              </button>
            ) : (
              <Waiting>{ui("waitingFor", { name: nameOf(v.turn) })}</Waiting>
            )}
          </motion.div>
        ) : (
          <motion.div key="roll" className="stack" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {canAct && v.phase === "roll" ? (
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                disabled={rolling}
                onClick={() => {
                  g("roll");
                  haptic([8, 30, 8, 30, 8]);
                }}
              >
                {rolling ? (lang === "zh" ? "骰子还在转" : "Rolling") : lang === "zh" ? "掷骰子" : "Roll"}
              </button>
            ) : rolling ? (
              <Waiting>{lang === "zh" ? "骰子还在转" : "Rolling"}</Waiting>
            ) : (
              <Waiting>{lang === "zh" ? `等 ${nameOf(v.turn)} 掷骰子` : `Waiting for ${nameOf(v.turn)} to roll`}</Waiting>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HostRow>
        {!mine && v.phase === "roll" && <HostButton onClick={() => g("skip")}>{ui("skip")}</HostButton>}
      </HostRow>
    </NetFrame>
  );
}
