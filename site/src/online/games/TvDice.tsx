import { useEffect, useState } from "react";
import { Die } from "../../components/Dice";
import { Glass } from "../../components/Glass";
import type { T } from "../../i18n";
import type { DiceOutcome, DiceView } from "../../shared/protocol";
import { usePenaltyText } from "../../store";
import { Bi, TvLineup, TvShow, useLang, useSeats, type PersonState } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { useReached } from "../RoomContext";
import "../../styles/tv-dice.css";

/** how long the dice tumble (the server's ROLL_MS) */
const ROLL_MS = 1000;
const t = (zh: string, en: string): T => ({ zh, en });

const SAYS: Record<DiceOutcome, T> = {
  seven: t("七！往公杯里加酒", "Seven! Pour more in"),
  eight: t("八！喝掉一半", "Eight! Drink half"),
  nine: t("九！全部喝完", "Nine! Drink it all"),
  ones: t("双一！指定一个人喝完", "Snake eyes! Pick who finishes it"),
  safe: t("安全", "Safe"),
};
/** with the table's own penalty the glass is a pot of it */
const SAYS_POT: Record<DiceOutcome, T> = {
  seven: t("七！罚池加一次", "Seven! One more in the pot"),
  eight: t("八！罚一半", "Eight! Half the pot"),
  nine: t("九！全罚", "Nine! The whole pot"),
  ones: t("双一！指定一个人全罚", "Snake eyes! Pick who takes the pot"),
  safe: t("安全", "Safe"),
};
const STRIP: { o: DiceOutcome; n: string; say: T; pot: T }[] = [
  { o: "seven", n: "7", say: t("加酒", "Pour"), pot: t("加一次", "+1") },
  { o: "eight", n: "8", say: t("喝一半", "Half"), pot: t("罚一半", "Half") },
  { o: "nine", n: "9", say: t("全喝", "All of it"), pot: t("全罚", "All of it") },
  { o: "ones", n: "1+1", say: t("指定一人", "Pick one"), pot: t("指定一人", "Pick one") },
  { o: "safe", n: "", say: t("其他安全", "Else safe"), pot: t("其他安全", "Else safe") },
];

/**
 * 七八九 on the big screen: the shared glass the whole table drinks from (or the pot of the table's
 * own penalty), the two dice tumbling the moment a phone rolls them, what the roll means, and the
 * rules along the bottom so anyone glancing up can follow.
 */
export default function TvDice({ v }: TvViewProps<DiceView>) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const custom = usePenaltyText().isCustom;
  const landed = useReached(v.rolledAt + ROLL_MS);
  const rolling = v.roll > 0 && !landed;

  // the glass only moves once the dice have landed
  const [level, setLevel] = useState(v.level);
  const [pot, setPot] = useState(v.pot ?? 1);
  useEffect(() => {
    if (!landed) return;
    setLevel(v.level);
    setPot(v.pot ?? 1);
  }, [landed, v.level, v.pot]);

  const out = v.roll > 0 && landed && v.phase !== "roll" ? v.outcome : null;
  const hot = out === "eight" || out === "nine" || out === "ones";
  const who = seat(v.turn);
  const state: PersonState = rolling ? "speaking" : !out ? "speaking" : out === "safe" ? "win" : hot ? "lose" : "spot";
  const says = custom ? SAYS_POT : SAYS;

  return (
    <TvShow game="dice" className={`tvdc is-${v.phase} ${hot ? "is-hot" : ""}`} phase={v.phase}>
      <div className="tvdc-glass">
        <Glass level={level} size={210} />
        <p className="tvdc-glass-name">{custom ? <Bi t={t(`罚池 ×${pot}`, `The pot ×${pot}`)} /> : <Bi t={t("公杯", "The shared glass")} />}</p>
      </div>

      <div className={`tvdc-bowl ${rolling ? "is-rolling" : ""}`}>
        <div className="tvdc-dice">
          <Die value={v.dice[0]} rolling={rolling} size={190} />
          <Die value={v.dice[1]} rolling={rolling} size={190} delay={0.08} />
        </div>
        {out && (
          <p className={`tvdc-sum tabular ${hot ? "is-hot" : ""}`} key={`sum-${v.roll}`}>
            {v.dice[0] + v.dice[1]}
          </p>
        )}
      </div>

      <div className="tvdc-side" key={`${v.phase}-${v.roll}-${out ?? ""}-${v.turn}`}>
        {out ? (
          <h1 className={`tvdc-head is-${out}`}>
            <Bi t={says[out]} />
          </h1>
        ) : (
          <h1 className="tvdc-head">{rolling ? <Bi t={t("骰子在转……", "Rolling…")} /> : <Bi t={t("掷骰子", "Roll the dice")} />}</h1>
        )}
        {who && <TvLineup people={[{ seat: who, state }]} big={220} className="tvdc-who" />}
        <p className="tvdc-line">
          {v.phase === "assign" && out
            ? custom
              ? tx(`${name(v.turn)} 在挑谁受罚`, `${name(v.turn)} is choosing who takes it`)
              : tx(`${name(v.turn)} 在挑谁喝完`, `${name(v.turn)} is choosing who finishes it`)
            : out
              ? tx(`${name(v.turn)} 掷的`, `${name(v.turn)}'s roll`)
              : tx(`轮到 ${name(v.turn)}，在手机上掷`, `${name(v.turn)}'s turn: rolling on their phone`)}
        </p>
      </div>

      <ol className="tvdc-rules">
        {STRIP.map((r) => (
          <li key={r.o} className={out === r.o ? "is-now" : ""}>
            {r.n && <b className="tabular">{r.n}</b>}
            <span>{tr(custom ? r.pot : r.say)}</span>
          </li>
        ))}
      </ol>
    </TvShow>
  );
}
