import { Camera, Layers } from "lucide-react";
import { RULE_BY_RANK, ruleWords, type Rank } from "../../data/rogue13";
import { PlayingCard } from "../../games/Rogue13";
import type { T } from "../../i18n";
import type { RogueHolders, RogueView } from "../../shared/protocol";
import { usePenaltyText } from "../../store";
import { Bi, FacesIn, TvClock, TvShow, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../People";
import "../../styles/tv-rogue.css";

const t = (zh: string, en: string): T => ({ zh, en });
const GARDENS: T[] = [t("蔬菜园", "Vegetables"), t("水果园", "Fruits"), t("动物园", "Animals")];
/** the standing powers, by the card that gives them */
const POWERS: [keyof RogueHolders, Rank][] = [
  ["buddy", "2"],
  ["camera", "5"],
  ["nose", "6"],
  ["wc", "8"],
  ["trouble", "10"],
];
const noop = () => {};

/**
 * 流氓十三张 on the big screen: the card just drawn, large, with what it means; the deck and
 * whose turn; whatever the card starts (a garden of words, the race for numbers, counting
 * sevens) played out where the room can follow it; who holds which standing power; and the
 * camera and the nose, which stop the whole table, across the whole screen.
 */
export default function TvRogue({ v, sound }: TvViewProps<RogueView>) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const custom = usePenaltyText().isCustom;
  const rule = v.card ? RULE_BY_RANK[v.card.rank] : null;
  const words = rule ? ruleWords(rule, custom) : null;
  const drawing = v.phase === "draw";
  const who = drawing ? v.turn : v.drawer;

  return (
    <TvShow game="rogue" className={`tvr is-${v.phase}`} phase={v.phase} round={<span className="tvr-left tabular"><Layers size={28} strokeWidth={2.4} aria-hidden="true" />{tx(`还剩 ${v.left} 张`, `${v.left} left`)}</span>}>
      <div className="tvr-card" key={v.card ? `${v.card.rank}${v.card.suit}-${v.left}` : "back"}>
        <PlayingCard card={drawing ? null : v.card} onDraw={noop} drawLabel="" canDraw={false} />
      </div>

      <div className="tvr-main">
        <p className="tvr-who">
          {who && <SeatFace seat={seat(who)} size={64} />}
          <span>{drawing ? tx(`轮到 ${name(who)} 抽牌`, `${name(who)} draws next`) : tx(`${name(who)} 抽到`, `${name(who)} drew`)}</span>
        </p>
        {!drawing && words ? (
          <div className="tvr-rule" key={`${v.card?.rank}-${v.left}`}>
            <h1 className="tvr-title">
              <Bi t={words.title} />
            </h1>
            <p className="tvr-text">{tr(words.rule)}</p>
            {v.reshuffled && <p className="tvr-note">{tx("新的一副牌：手上的权力都清空了", "A fresh deck: every power is cleared")}</p>}
          </div>
        ) : (
          <div className="tvr-rule">
            <h1 className="tvr-title">
              <Bi t={t("抽一张牌", "Draw a card")} />
            </h1>
            <p className="tvr-text">{tx("每张牌一条规矩，抽到什么做什么", "Every card is a rule: whatever comes up, the table plays it")}</p>
          </div>
        )}
        <Panel v={v} sound={sound} />
      </div>

      <Powers v={v} custom={custom} />
      <Interrupt v={v} sound={sound} />
    </TvShow>
  );
}

/** What the card asks of the table right now. */
function Panel({ v, sound }: { v: RogueView; sound: boolean }) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const custom = usePenaltyText().isCustom;
  const drawer = name(v.drawer);
  switch (v.phase) {
    case "pick":
      return <p className="tvr-wait">{custom ? tx(`${drawer} 在指定谁受罚`, `${drawer} is choosing who takes the penalty`) : tx(`${drawer} 在指定谁喝`, `${drawer} is choosing who drinks`)}</p>;
    case "garden-pick":
      return <p className="tvr-wait">{tx(`${drawer} 在选园子`, `${drawer} is choosing the garden`)}</p>;
    case "sevens-start":
      return <p className="tvr-wait">{tx(`${drawer} 在选从几开始数`, `${drawer} is picking where the count starts`)}</p>;
    case "garden": {
      const gd = v.garden;
      if (!gd) return null;
      return (
        <div className="tvr-game">
          <TvClock key={`${gd.speaker}-${gd.said}`} endsAt={gd.endsAt} total={7000} sound={sound} size={110} />
          <div className="tvr-game-main">
            <p className="tvr-big">{tr(GARDENS[gd.kind] ?? GARDENS[0])}</p>
            <p className="tvr-game-line">
              <SeatFace seat={seat(gd.speaker)} size={56} />
              {tx(`轮到 ${name(gd.speaker)} 说一个`, `${name(gd.speaker)} names one`)}
              <span className="tvr-count tabular">{tx(`已经说了 ${gd.said} 个`, `${gd.said} so far`)}</span>
            </p>
          </div>
        </div>
      );
    }
    case "grab":
      return v.grab ? <Grab v={v} sound={sound} /> : null;
    case "sevens": {
      const sv = v.sevens;
      if (!sv) return null;
      return (
        <div className="tvr-game is-sevens">
          <TvClock key={`${sv.n}`} endsAt={sv.endsAt} total={5200} sound={sound} size={110} />
          <div className="tvr-game-main">
            <p className="tvr-game-line">
              <SeatFace seat={seat(sv.speaker)} size={56} />
              {tx(`轮到 ${name(sv.speaker)}：报数，逢七就过`, `${name(sv.speaker)}: say it, or pass on a seven`)}
            </p>
            <ol className="tvr-log">
              {sv.log.slice(-7).map((x, i) => (
                <li key={`${i}-${x.n}`} className={x.pass ? "is-pass" : ""}>
                  <b className="tabular">{x.pass ? tx("过", "pass") : x.n}</b>
                  <span>{name(x.pid)}</span>
                </li>
              ))}
              <li className="is-next">
                <b className="tabular">{sv.n}</b>
                <span>{name(sv.speaker)}</span>
              </li>
            </ol>
          </div>
        </div>
      );
    }
    case "done":
      return <p className="tvr-wait">{tx(`${drawer} 传给下一位抽牌`, `${drawer} passes the deck on`)}</p>;
    default:
      return null;
  }
}

/** The race for the next number: who has grabbed which. */
function Grab({ v, sound }: { v: RogueView; sound: boolean }) {
  const { tx } = useLang();
  const { seat } = useSeats();
  const gr = v.grab!;
  const order = Object.entries(gr.claimed).sort((a, b) => a[1] - b[1]);
  return (
    <div className="tvr-game">
      <TvClock endsAt={gr.endsAt} total={15000} sound={sound} size={110} />
      <div className="tvr-game-main">
        <p className="tvr-game-line">
          {tx("抢着按下一个数字：", "Race for the next number:")}
          <b className="tvr-next tabular" key={gr.next}>
            {gr.next}
          </b>
        </p>
        <ol className="tvr-claims">
          {order.map(([pid, n]) => (
            <li key={pid}>
              <b className="tabular">{n}</b>
              <SeatFace seat={seat(pid)} size={48} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Who holds which standing power, along the bottom. */
function Powers({ v, custom }: { v: RogueView; custom: boolean }) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const held = POWERS.filter(([k]) => v.holders[k]);
  if (!held.length) return null;
  return (
    <ul className="tvr-powers" aria-label={tx("手上的权力", "Powers held")}>
      {held.map(([k, rank]) => (
        <li key={k} className={k === "wc" && v.wcUsed ? "is-used" : ""}>
          <span className="tvr-power-rank">{rank}</span>
          <span className="tvr-power-name">{tr(ruleWords(RULE_BY_RANK[rank], custom).badge ?? RULE_BY_RANK[rank].title)}</span>
          <SeatFace seat={seat(v.holders[k])} size={40} />
          <span className="tvr-power-who">{name(v.holders[k])}</span>
          {k === "wc" && v.wcUsed && <span className="tvr-power-used">{tx("已用", "used")}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The camera and the nose stop the whole table: across the whole screen. */
function Interrupt({ v, sound }: { v: RogueView; sound: boolean }) {
  const { tx } = useLang();
  const { seat, name } = useSeats();
  const it = v.interrupt;
  if (!it) return null;
  if (it.kind === "camera")
    return (
      <div className={`tvr-stop is-camera is-${it.phase}`} key={`cam-${it.by}-${it.phase}`}>
        <i className="tvr-flash" aria-hidden="true" />
        <div className="tvr-stop-card">
          <Camera size={86} strokeWidth={2} aria-hidden="true" />
          <Bi t={it.phase === "freeze" ? t("不许动！", "Freeze!") : t("谁动了？", "Who moved?")} />
          <p className="tvr-stop-line">
            <SeatFace seat={seat(it.by)} size={52} />
            {it.phase === "freeze" ? tx(`${name(it.by)} 拍照`, `${name(it.by)} takes a picture`) : tx(`${name(it.by)} 来判`, `${name(it.by)} decides`)}
          </p>
          {it.phase === "freeze" && <TvClock endsAt={it.endsAt} total={3500} sound={sound} size={96} />}
        </div>
      </div>
    );
  return (
    <div className="tvr-stop is-nose" key={`nose-${it.by}`}>
      <div className="tvr-stop-card">
        <Bi t={t("摸鼻子！", "Touch your nose!")} />
        <p className="tvr-stop-line">
          <SeatFace seat={seat(it.by)} size={52} />
          {tx(`${name(it.by)} 喊的，最慢的受罚`, `${name(it.by)} called it: the slowest pays`)}
        </p>
        <div className="tvr-tapped">
          <FacesIn seats={it.tapped.map((pid) => seat(pid))} size={60} />
        </div>
        <TvClock endsAt={it.endsAt} total={6000} sound={sound} size={96} />
      </div>
    </div>
  );
}
