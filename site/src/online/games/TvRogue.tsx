import { Camera, Hand, Layers } from "lucide-react";
import { useRef } from "react";
import { ruleFor, ruleWords, type Rank } from "../../data/rogue13";
import { HeldCard, HouseContext, RogueTable } from "../../games/rogueCards";
import type { T } from "../../i18n";
import type { RogueHolders, RogueView } from "../../shared/protocol";
import { usePenaltyText } from "../../store";
import { Bi, FacesIn, TvClock, TvShow, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { SeatFace } from "../People";
import { useTable } from "./NetRogue";
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
 * 流氓十三张 on the big screen: the phones' own table, large (games/rogueCards.tsx): the deck
 * with its stack, the card lifted off it and turned over, the pile beside, the riffle when the
 * deck runs out, all at the moments the phones show them; what the card means; whose turn;
 * whatever the card starts (a garden of words, the race for numbers, counting sevens) played out
 * where the room can follow it; the standing powers as the phones' small cards; and the camera
 * (its photo developing) and the nose, which stop the whole table, across the whole screen.
 */
const NO_HOUSE = {};

/** (每张牌可换玩法: the cards' words are the table's, not always the classic ones; the deck reads them from this) */
export default function TvRogue(props: TvViewProps<RogueView>) {
  return (
    <HouseContext.Provider value={props.v.house ?? NO_HOUSE}>
      <TvRogueScreen {...props} />
    </HouseContext.Provider>
  );
}

function TvRogueScreen({ v, sound }: TvViewProps<RogueView>) {
  const { tx, tr } = useLang();
  const { seat, name } = useSeats();
  const custom = usePenaltyText().isCustom;
  const rule = v.card ? ruleFor(v.card.rank, v.house) : null;
  const words = rule ? ruleWords(rule, custom) : null;
  const drawing = v.phase === "draw";
  const who = drawing ? v.turn : v.drawer;
  // the table as every phone deals it: a fresh deck's first card waits for the pile to gather and
  // the deck to riffle (NetRogue.tsx)
  const cardKey = v.card ? `${v.card.rank}${v.card.suit}-${v.left}` : "";
  const openedOn = useRef(cardKey);
  const table = useTable(v, cardKey, openedOn.current);
  const up = !!v.card && !table.holding;
  // while the table plays a round of the card, the rule steps back so the round fits (as on the phones)
  const live = v.phase === "garden" || v.phase === "grab" || v.phase === "sevens";

  return (
    <TvShow game="rogue" className={`tvr is-${v.phase}`} phase={v.phase} round={<span className="tvr-left tabular"><Layers size={28} strokeWidth={2.4} aria-hidden="true" />{tx(`还剩 ${v.left} 张`, `${v.left} left`)}</span>}>
      <div className="tvr-card">
        <RogueTable card={up && v.card ? { rank: v.card.rank, suit: v.card.suit } : null} remaining={v.left} drawn={table.drawn} canDraw={false} onDraw={noop} drawLabel="" shuffling={table.shuffling} leaveTo={table.leaveTo} />
      </div>

      <div className="tvr-main">
        <p className="tvr-who">
          {who && <SeatFace seat={seat(who)} size={64} />}
          <span>{drawing ? tx(`轮到 ${name(who)} 抽牌`, `${name(who)} draws next`) : tx(`${name(who)} 抽到`, `${name(who)} drew`)}</span>
        </p>
        {table.holding ? (
          <div className="tvr-rule">
            <h1 className="tvr-title">
              <Bi t={t("新的一副牌", "A fresh deck")} />
            </h1>
            <p className="tvr-text">{tx("洗牌中……手上的权力都清空了", "Shuffling… every power is cleared")}</p>
          </div>
        ) : !drawing && words ? (
          <div className="tvr-rule" key={`${v.card?.rank}-${v.left}`}>
            <h1 className="tvr-title">
              <Bi t={words.title} />
            </h1>
            {!live && <p className="tvr-text">{tr(words.rule)}</p>}
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

      <Powers v={v} />
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

/** Who holds which standing power, along the bottom: the phones' small cards. */
function Powers({ v }: { v: RogueView }) {
  const { tx } = useLang();
  const { seat, name } = useSeats();
  const held = POWERS.filter(([k]) => v.holders[k]);
  if (!held.length) return null;
  return (
    <div className="tvr-powers rg-tray" role="list" aria-label={tx("手上的权力", "Powers held")}>
      {held.map(([k, rank]) => (
        <div role="listitem" key={k}>
          <HeldCard
            rank={rank}
            used={k === "wc" && v.wcUsed}
            who={
              <>
                <SeatFace seat={seat(v.holders[k])} size={28} />
                {name(v.holders[k])}
              </>
            }
          />
        </div>
      ))}
    </div>
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
      <div className={`tvr-stop is-camera is-${it.phase}`} key={`cam-${it.by}`}>
        <i className="tvr-flash" aria-hidden="true" />
        {/* the photo, developing, as on the phones: the table holds still until it's done */}
        <div className="rg-photo tvr-photo" key={it.phase}>
          <div className="rg-photo-pic">
            {it.phase === "freeze" ? (
              <>
                <p className="tvr-photo-big">
                  <Bi t={t("不许动！", "Freeze!")} />
                </p>
                <TvClock endsAt={it.endsAt} total={3500} sound={sound} size={96} />
              </>
            ) : (
              <>
                <Camera size={86} strokeWidth={2} aria-hidden="true" />
                <p className="tvr-photo-big">
                  <Bi t={t("谁动了？", "Who moved?")} />
                </p>
              </>
            )}
          </div>
          <p className="rg-photo-line tvr-photo-line">
            <SeatFace seat={seat(it.by)} size={44} />
            {it.phase === "freeze" ? tx(`${name(it.by)} 拍照了，别动`, `${name(it.by)} took a photo. Don't move.`) : tx(`${name(it.by)} 在看照片，看谁动了`, `${name(it.by)} is checking who moved`)}
          </p>
        </div>
      </div>
    );
  return (
    <div className="tvr-stop is-nose" key={`nose-${it.by}`}>
      <div className="tvr-stop-card">
        <Hand size={96} strokeWidth={2} className="rg-wiggle" aria-hidden="true" />
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
