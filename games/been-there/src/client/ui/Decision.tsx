import { useEffect, useRef, useState } from "preact/hooks";
import {
  BOARD_SIZE,
  CAIRO,
  CITY_AT,
  JOURNEY_CARDS,
  ROUTE_SPACES,
  TRASH_QUIZ,
  activePlayers,
  canBuildFree,
  canSell,
  priceOf,
  rentAt,
  type Action,
  type Pending,
} from "../../engine";
import { TIMING, type RoomView } from "../../room/protocol";
import { cardTitle, colon, getLang, money, spaceName, t, tx, type Key } from "../i18n";
import { BUZZ, allowShake, buzz, onShake } from "../controls";
import { send } from "../store";
import { placeTag } from "../art/stamps";
import { Assets } from "./Assets";
import { Btn, Countdown, GroupIcon, HapticBtn, Money, SeatChip, moneyOrHidden, seatName, useCountdown, useShakeState } from "./common";
import { sfx } from "../sound";
import { startThrow } from "./throwing";
import { SambaLesson, useDanceClock } from "./Samba";
import { quizItemText } from "./feedText";
import { IdleNote, useIdleWarn, type IdleWarn } from "./TurnClock";
import { LocalMoney } from "./Local";

/** One line saying what the table is waiting for (for people who aren't deciding, and the big screen). */
export function pendingSummary(v: RoomView): string {
  const g = v.game!;
  const s = g.s;
  const pd = s.pending;
  if (!pd) return "";
  const name = (seat: number) => seatName(v, seat);
  switch (pd.k) {
    case "auction":
      return t("auction", { space: spaceName(pd.at) });
    case "water":
      return t("waterAsk");
    case "scores":
      return t("scoreAsk", { team: name(pd.dancer) });
    case "freeze":
      return t("freezeAsk", { team: name(pd.who) });
    case "splash":
      return t("splashAsk");
    case "coe":
      return t("coeAsk");
    case "quiz":
      return g.quiz ? t("quizWatch", { team: name(pd.visitor), item: quizItemText(g.quiz.item) }) : "";
    case "silence":
      return t("silenceTitle");
    case "buy":
      return `${name(pd.who)} · ${t("buyAsk", { space: spaceName(pd.at) })}`;
    case "barrier":
      return t("barrierAsk", { team: name(pd.visitor) });
    case "tango-reply":
      return `${name(pd.who)} · ${t("tangoReply", { from: name(pd.from) })}`;
    case "debt":
      return `${name(pd.who)} · ${t("debtTitle", { amount: money(pd.amount), cash: moneyOrHidden(s.ps[pd.who].cash) })}`;
    default:
      return t("waitingFor", { who: name((pd as { who: number }).who) });
  }
}

const SIMULTANEOUS = ["water", "scores", "freeze", "splash", "coe"];

/**
 * Whether `key` has stayed the same for a moment. A question that has just come up takes no taps until
 * then, so the second half of a quick double tap on the button before it can't answer it.
 */
function useSettled(key: unknown, ms = 350) {
  const [settled, setSettled] = useState<unknown>(undefined);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), ms);
    return () => clearTimeout(t);
  }, [key]);
  return settled === key;
}

export function Decision({ v }: { v: RoomView }) {
  const g = v.game!;
  const acting = v.you.seats.find((x) => g.mustAct.includes(x));
  // Each question of ours comes in fresh (its own state, its slide-in) and settles before it takes a
  // tap. While we only watch, the panel stays put, so its live updates are read out.
  const key = acting === undefined ? "watch" : `${g.decision}:${acting}`;
  const settled = useSettled(key);
  // One answer per decision and team: a quick second tap would only come back as "too late". (A
  // refused answer can be tried again after a moment.)
  const sent = useRef({ key: "", at: 0 });
  const act = (a: Action) => {
    if (sent.current.key === key && performance.now() - sent.current.at < 1500) return;
    sent.current = { key, at: performance.now() };
    buzz(BUZZ.tap);
    send({ t: "act", d: g.decision, a, seat: acting });
  };
  // (the turn clock's last 15 seconds, at the top of the question it's about)
  const idle = useIdleWarn(v);
  return (
    <div key={key} class={settled ? "settle" : "settle settling"}>
      <Panel v={v} acting={acting} act={act} idle={idle} />
    </div>
  );
}

function Panel({ v, acting, act, idle }: { v: RoomView; acting: number | undefined; act: (a: Action) => void; idle: IdleWarn | null }) {
  const g = v.game!;
  const s = g.s;
  const pd = s.pending;
  const mine = v.you.seats;
  if (g.paused) return <div class="decide waiting">{t("paused")}</div>;
  if (!pd) return null;
  if (pd.k === "auction" && g.auction) return <AuctionPanel v={v} />;
  if (pd.k === "quiz" && g.quiz) return <QuizPanel v={v} />;
  if (pd.k === "silence") return <SilencePanel v={v} acting={acting} act={act} pd={pd} />;
  if (acting === undefined) return <Waiting v={v} idle={idle} />;
  return (
    <div class="decide" data-kind={pd.k}>
      <Strip label={t("boardingPass")} at={s.ps[acting]?.pos} />
      {idle && <IdleNote v={v} warn={idle} />}
      {mine.length > 1 && (
        <p class="acting">
          <SeatChip v={v} seat={acting} />
        </p>
      )}
      <Ask v={v} pd={pd} seat={acting} act={act} />
      {SIMULTANEOUS.includes(pd.k) && <Votes v={v} />}
    </div>
  );
}

/**
 * Shake the phone to roll: listening while the roll is up. Before that, a tap on "turn on", from which
 * an iPhone asks whether the page may feel motion; and where the phone said no (or asked nothing), how
 * to let it ask again, open at once after a tap that didn't work.
 */
function ShakeToRoll({ roll }: { roll: () => void }) {
  const state = useShakeState();
  const [tried, setTried] = useState(false);
  const latest = useRef(roll);
  latest.current = roll;
  useEffect(() => onShake(() => latest.current()), [state]);
  // (straight from the tap: nothing may come before the question, or an iPhone won't ask it)
  const ask = () => void allowShake().then((s) => setTried(s !== "on"));
  if (state === "off") return null;
  if (state === "on") return <span class="shake-hint">📳 {t("shakeHint")}</span>;
  if (state === "ask" && !tried)
    return (
      <Btn kind="ghost" class="shake-ask" onClick={ask}>
        📳 {t("shakeEnable")}
      </Btn>
    );
  return (
    <details class="shake-no" open={tried}>
      <summary>📳 {t("shakeNo")}</summary>
      <p>{t("shakeFix")}</p>
      <Btn kind="ghost" onClick={ask}>
        {t("shakeAgain")}
      </Btn>
    </details>
  );
}

/** The dark strip across the top of a decision, like the top of a boarding pass. */
function Strip({ label, at }: { label: string; at?: number }) {
  const city = at !== undefined ? CITY_AT[at] : undefined;
  return (
    <p class="pass-strip">
      <span>{label}</span>
      {at !== undefined && <span>{city ? placeTag(city.id, getLang()) : spaceName(at)}</span>}
    </p>
  );
}

/**
 * Rio's judges: the 1 to 10 buttons light up once the dance is over (the vote's 25 s start then). Until
 * then the lesson plays small above them: the dancing team getting ready, the countdown, the dance.
 */
function Scores({ v, dancer, act }: { v: RoomView; dancer: number; act: (a: Action) => void }) {
  const dance = useDanceClock(v);
  const dancing = dance !== null && !dance.over;
  // (the one-phone demo: this phone is the dancing team's too, and shows the lesson full screen over
  // these buttons until it's over; a second teacher dancing unseen under it would only cost frames)
  const covered = dancing && v.you.seats.includes(dance.seat);
  return (
    <>
      {dance && !covered && <SambaLesson v={v} size="small" />}
      <p class="ask">{dancing ? t("sambaWatch", { team: seatName(v, dancer) }) : t("scoreAsk", { team: seatName(v, dancer) })}</p>
      <div class="choices grid5">
        {Array.from({ length: 10 }, (_, i) => (
          <Btn key={i} disabled={dancing} onClick={() => act({ score: i + 1 })}>
            {i + 1}
          </Btn>
        ))}
      </div>
    </>
  );
}

function Votes({ v }: { v: RoomView }) {
  const g = v.game!;
  const total = g.answered.length + g.mustAct.length;
  return (
    <p class="votes">
      {t("answered", { n: g.answered.length, total })} · <Countdown until={g.deadline} />
    </p>
  );
}

function Waiting({ v, idle }: { v: RoomView; idle?: IdleWarn | null }) {
  const g = v.game!;
  const pd = g.s.pending!;
  const simultaneous = SIMULTANEOUS.includes(pd.k);
  return (
    <div class="decide waiting" aria-live="polite">
      <p>{pendingSummary(v)}</p>
      {idle && <IdleNote v={v} warn={idle} />}
      {simultaneous && <Votes v={v} />}
      {!simultaneous && g.mustAct.length > 0 && (
        <p class="muted">
          {g.mustAct.map((seat) => (
            <SeatChip key={seat} v={v} seat={seat} small />
          ))}
        </p>
      )}
    </div>
  );
}

function Choices<T>({ items, label, pick }: { items: T[]; label: (x: T) => string | preact.JSX.Element; pick: (x: T) => void }) {
  return (
    <div class="choices">
      {items.map((x, i) => (
        <Btn key={i} onClick={() => pick(x)}>
          {label(x)}
        </Btn>
      ))}
    </div>
  );
}

export function CityBrief({ v, at }: { v: RoomView; at: number }) {
  const s = v.game!.s;
  const city = CITY_AT[at];
  if (!city) return null;
  const r = s.cfg.rents[city.id];
  return (
    <div class="brief">
      <p>
        <GroupIcon group={city.group} size={14} /> <b>{tx(city.name)}</b> · <Money n={priceOf(s, at)} />
        <LocalMoney city={city.id} n={priceOf(s, at)} /> · {t("rent")} {money(r[0])}–{money(r[6])}
      </p>
      <p class="muted">
        <b>{tx(city.rule.title)}</b>{colon()}{tx(city.rule.text)}
      </p>
    </div>
  );
}

function Ask({ v, pd, seat, act }: { v: RoomView; pd: Pending; seat: number; act: (a: Action) => void }) {
  const [sure, setSure] = useState(false);
  const sureSettled = useSettled(sure);
  const g = v.game!;
  const s = g.s;
  const me = s.ps[seat];
  const others = activePlayers(s).filter((q) => q !== seat);
  const name = (q: number) => seatName(v, q);
  switch (pd.k) {
    case "roll": {
      const waiver = me.keep.some((c) => c === "waiver" || c === "waiver2");
      // The dice leave the hand at once: tumbling on the board, a click and a tick, before the server answers.
      const throwDice = (a: Action) => {
        startThrow();
        sfx.tap();
        act(a);
      };
      // (no "your turn" line: the banner over the board says it)
      return (
        <>
          {pd.jail ? (
            <>
              <p class="muted">{t("jailNote")}</p>
              <HapticBtn kind="primary" wide onClick={() => throwDice({ how: "roll" })}>
                {t("rollJail")}
              </HapticBtn>
              <Btn wide onClick={() => act({ how: "pay" })}>
                {t("payOut")}
              </Btn>
              {waiver && (
                <Btn wide onClick={() => act({ how: "waiver" })}>
                  {t("useWaiver")}
                </Btn>
              )}
            </>
          ) : (
            <HapticBtn kind="primary" wide onClick={() => throwDice({})}>
              {/* (one item in the button's grid: held down, the die rattles in the hand, styles.css) */}
              <span>
                <span class="roll-die">🎲</span> {t("roll")}
              </span>
            </HapticBtn>
          )}
          {me.jetlag && <p class="muted">{t("jetlag")}</p>}
          {/* (one line under the dice where they fit: shaking, and where building is) */}
          <div class="roll-more hint">
            <ShakeToRoll roll={() => throwDice(pd.jail ? { how: "roll" } : {})} />
            <span>{t("manageFirst")}</span>
          </div>
        </>
      );
    }
    case "end":
      return (
        <>
          <Btn kind="primary" wide onClick={() => act({})}>
            {t("endTurn")}
          </Btn>
          <p class="hint">{t("manageFirst")}</p>
        </>
      );
    case "permit": {
      const at = (d: number) => spaceName((((me.pos + pd.steps + d) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE);
      return (
        <>
          <p class="ask">{t("permitAsk")}</p>
          <div class="choices col">
            <Btn onClick={() => act({ delta: -1 })}>{t("permitLess", { space: at(-1) })}</Btn>
            <Btn kind="primary" onClick={() => act({ delta: 0 })}>
              {t("permitSame", { space: at(0) })}
            </Btn>
            <Btn onClick={() => act({ delta: 1 })}>{t("permitMore", { space: at(1) })}</Btn>
          </div>
        </>
      );
    }
    case "buy":
      return (
        <>
          <p class="ask">{t("buyAsk", { space: spaceName(pd.at) })}</p>
          <CityBrief v={v} at={pd.at} />
          {pd.price !== priceOf(s, pd.at) && <p class="muted">{t("pointsNote")}</p>}
          <div class="choices answers">
            <HapticBtn kind="primary" disabled={me.cash < pd.price} onClick={() => act({ yes: true })}>
              {t("buyYes", { price: money(pd.price) })}
            </HapticBtn>
            <Btn onClick={() => act({ yes: false })}>{t("buyNo")}</Btn>
          </div>
          {me.cash < pd.price && <p class="muted">{t("cantAfford")}</p>}
        </>
      );
    case "debt":
      return (
        <>
          <p class="ask">{t("debtTitle", { amount: money(pd.amount), cash: money(me.cash) })}</p>
          <p class="muted">{t("debtHint")}</p>
          <div class="choices">
            <Btn kind="primary" disabled={me.cash < pd.amount} onClick={() => act({ pay: true })}>
              {t("pay", { amount: money(pd.amount) })}
            </Btn>
            {!sure && (
              <Btn kind="danger" onClick={() => setSure(true)}>
                {t("goBroke")}
              </Btn>
            )}
          </div>
          {sure && (
            <div class={sureSettled ? "confirm" : "confirm settling"} role="alertdialog" aria-label={t("confirmBroke")}>
              <p>{t("confirmBroke")}</p>
              <div class="choices">
                <Btn kind="danger" onClick={() => act({ bankrupt: true })}>
                  {t("confirmBrokeYes")}
                </Btn>
                <Btn onClick={() => setSure(false)}>{t("keepPlaying")}</Btn>
              </div>
            </div>
          )}
          <Assets v={v} seat={seat} compact />
        </>
      );
    case "card-route":
      return (
        <>
          <p class="ask">{t("pickRoute")}</p>
          <Choices
            items={ROUTE_SPACES}
            label={(at) => {
              const d = s.deeds[at]!;
              return `${spaceName(at)}${d.owner >= 0 ? ` · ${name(d.owner)}` : ` · ${money(priceOf(s, at))}`}`;
            }}
            pick={(at) => act({ at })}
          />
        </>
      );
    case "card-player":
      return (
        <>
          <p class="ask">{t("pickPlayer")}</p>
          <Choices items={others} label={name} pick={(player) => act({ player })} />
        </>
      );
    case "card-house": {
      const options = s.deeds
        .map((d, at) => ({ d, at }))
        .filter(({ d, at }) => d && d.owner === seat && (pd.card === "review" ? canBuildFree(s, seat, at) : canSell(s, seat, at) && at !== CAIRO))
        .map((x) => x.at);
      const key: Key = pd.card === "review" ? "pickReview" : pd.card === "typhoon" ? "pickTyphoon" : "pickCash";
      return (
        <>
          <p class="ask">{t(key)}</p>
          <Choices items={options} label={spaceName} pick={(at) => act({ at })} />
        </>
      );
    }
    case "koi":
      return (
        <>
          <p class="ask">{t("koiAsk", { rent: money(pd.rent) })}</p>
          <div class="choices">
            <Btn kind="primary" onClick={() => act({ yes: true })}>
              {t("useIt")}
            </Btn>
            <Btn onClick={() => act({ yes: false })}>{t("keepIt")}</Btn>
          </div>
        </>
      );
    case "water":
      return (
        <>
          <p class="ask">{t("waterAsk")}</p>
          <div class="choices">
            <Btn onClick={() => act({ use: false })}>💧 {t("save_water")}</Btn>
            <Btn onClick={() => act({ use: true })}>🚿 {t("use_water")}</Btn>
          </div>
        </>
      );
    case "tango":
      return (
        <>
          <p class="ask">{t("tangoAsk")}</p>
          <Choices items={[...others, -1]} label={(q) => (q < 0 ? t("noTango") : `💃 ${name(q)} · ${spaceName(s.ps[q].pos)}`)} pick={(q) => act({ partner: q < 0 ? null : q })} />
        </>
      );
    case "tango-reply":
      return (
        <>
          <p class="ask">{t("tangoReply", { from: name(pd.from) })}</p>
          <p class="muted">
            {spaceName(s.ps[pd.from].pos)} ⇄ {spaceName(me.pos)}
          </p>
          <div class="choices">
            <Btn kind="primary" onClick={() => act({ yes: true })}>
              {t("accept")}
            </Btn>
            <Btn onClick={() => act({ yes: false })}>{t("refuse50")}</Btn>
          </div>
        </>
      );
    case "ban":
      return (
        <>
          <p class="ask">{t("banAsk")}</p>
          <Choices items={[0, 1, 2]} label={(p) => t("banPair", { a: 2 * p + 1, b: 2 * p + 2 })} pick={(pair) => act({ pair })} />
        </>
      );
    case "dance":
      return (
        <>
          <p class="ask">{t("danceAsk", { secs: TIMING.dance / 1000 })}</p>
          <div class="choices">
            <HapticBtn kind="primary" onClick={() => act({ yes: true })}>
              {t("dance")}
            </HapticBtn>
            <Btn onClick={() => act({ yes: false })}>{t("noDance")}</Btn>
          </div>
        </>
      );
    case "scores":
      return <Scores v={v} dancer={pd.dancer} act={act} />;
    case "mumbai":
      return <Mumbai v={v} seat={seat} act={act} />;
    case "peek":
      return <Peek cards={g.peek ?? []} act={act} />;
    case "bet": {
      const max = Math.min(200, me.cash);
      const amounts = [50, 100, 150, 200].filter((x) => x <= max);
      return (
        <>
          <p class="ask">{t("betAsk")}</p>
          <div class="choices">
            <Btn onClick={() => act({ bet: 0 })}>{t("betNone")}</Btn>
            {amounts.map((n) => (
              <Btn key={n} onClick={() => act({ bet: n })}>
                🎰 {t("bet", { n: money(n) })}
              </Btn>
            ))}
          </div>
        </>
      );
    }
    case "freeze": {
      const owner = s.deeds[pd.at]!.owner;
      return (
        <>
          <p class="ask">{t("freezeAsk", { team: name(pd.who) })}</p>
          <p class="muted">
            {spaceName(pd.at)} · {money(rentAt(s, pd.at, 0))} → {money(s.cfg.rents[CITY_AT[pd.at]!.id][0])} · {t("owner")} {owner >= 0 ? name(owner) : ""}
          </p>
          <div class="choices">
            <Btn onClick={() => act({ yes: true })}>✋ {t("yesVote")}</Btn>
            <Btn onClick={() => act({ yes: false })}>{t("noVote")}</Btn>
          </div>
        </>
      );
    }
    case "jump":
      return (
        <>
          <p class="ask">{t("jumpAsk", { space: spaceName((me.pos + BOARD_SIZE / 2) % BOARD_SIZE) })}</p>
          <div class="choices">
            <Btn kind="primary" onClick={() => act({ yes: true })}>
              {t("jump")}
            </Btn>
            <Btn onClick={() => act({ yes: false })}>{t("stay")}</Btn>
          </div>
        </>
      );
    case "splash":
      return (
        <>
          <p class="ask">{t("splashAsk")}</p>
          <Choices items={others} label={(q) => `💦 ${name(q)}`} pick={(target) => act({ target })} />
        </>
      );
    case "reverse":
      return (
        <>
          <p class="ask">{t("reverseAsk")}</p>
          <div class="choices">
            <Btn onClick={() => act({ yes: true })}>🔄 {t("reverse")}</Btn>
            <Btn onClick={() => act({ yes: false })}>{t("keepOrder")}</Btn>
          </div>
        </>
      );
    case "coe":
      return <SealedBid cash={me.cash} act={act} />;
    case "barrier":
      return (
        <>
          <p class="ask">{t("barrierAsk", { team: name(pd.visitor) })}</p>
          <div class="choices">
            <Btn kind="primary" disabled={me.cash < 50} onClick={() => act({ yes: true })}>
              {t("raise")}
            </Btn>
            <Btn onClick={() => act({ yes: false })}>{t("noRaise")}</Btn>
          </div>
        </>
      );
    case "sales":
      return (
        <>
          <p class="ask">{t("salesAsk")}</p>
          <div class="choices">
            <Btn onClick={() => act({ yes: true })}>🛍️ {t("callSales")}</Btn>
            <Btn onClick={() => act({ yes: false })}>{t("notNow")}</Btn>
          </div>
        </>
      );
    case "policy":
      return (
        <>
          <p class="ask">{t("policyAsk")}</p>
          <div class="choices">
            <Btn onClick={() => act({ yes: true })}>{t("buyPolicy")}</Btn>
            <Btn onClick={() => act({ yes: false })}>{t("notNow")}</Btn>
          </div>
        </>
      );
    default:
      return <p>{pd.k}</p>;
  }
}

function Mumbai({ v, seat, act }: { v: RoomView; seat: number; act: (a: Action) => void }) {
  const s = v.game!.s;
  const [from, setFrom] = useState<number | null>(null);
  const froms = s.deeds.map((d, at) => ({ d, at })).filter(({ d, at }) => d && d.owner === seat && canSell(s, seat, at)).map((x) => x.at);
  const tos =
    from === null
      ? []
      : s.deeds
          .map((d, at) => ({ d, at }))
          .filter(({ d, at }) => {
            if (!d || d.owner !== seat || at === from) return false;
            const copy: typeof s = JSON.parse(JSON.stringify(s));
            copy.deeds[from]!.houses -= 1;
            return canBuildFree(copy, seat, at);
          })
          .map((x) => x.at);
  return (
    <>
      <p class="ask">{t("mumbaiAsk")}</p>
      <p class="muted">{t("mumbaiFrom")}</p>
      <Choices items={froms} label={(at) => `${from === at ? "✓ " : ""}${spaceName(at)}`} pick={setFrom} />
      {from !== null && (
        <>
          <p class="muted">{t("mumbaiTo")}</p>
          <Choices items={tos} label={spaceName} pick={(to) => act({ from, to })} />
        </>
      )}
      <Btn def onClick={() => act({})}>
        {t("noMove")}
      </Btn>
    </>
  );
}

function Peek({ cards, act }: { cards: number[]; act: (a: Action) => void }) {
  const [order, setOrder] = useState(cards);
  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  // `cards` are indexes into the Journey deck.
  const deck = (i: number) => cardTitle(JOURNEY_IDS[i] ?? "");
  return (
    <>
      <p class="ask">{t("peekAsk")}</p>
      <ol class="peek">
        {order.map((c, i) => (
          <li key={c}>
            <span>{deck(c)}</span>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="↑">
              ↑
            </button>
            <button type="button" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="↓">
              ↓
            </button>
          </li>
        ))}
      </ol>
      <Btn kind="primary" onClick={() => act({ order })}>
        {t("putBack")}
      </Btn>
    </>
  );
}

const JOURNEY_IDS = JOURNEY_CARDS.map((c) => c.id);

function SealedBid({ cash, act }: { cash: number; act: (a: Action) => void }) {
  const [amount, setAmount] = useState(0);
  return (
    <>
      <p class="ask">{t("coeAsk")}</p>
      <div class="choices">
        {[20, 50, 100].filter((n) => n <= cash).map((n) => (
          <Btn key={n} onClick={() => setAmount(n)}>
            {money(n)}
          </Btn>
        ))}
      </div>
      <label class="field">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={cash}
          step={10}
          value={amount}
          onInput={(e) => setAmount(Math.max(0, Math.min(cash, Math.floor(Number((e.target as HTMLInputElement).value) || 0))))}
        />
      </label>
      <div class="choices">
        <Btn kind="primary" onClick={() => act({ bid: amount })}>
          {t("bidSecret", { n: money(amount) })}
        </Btn>
        <Btn onClick={() => act({ bid: 0 })}>{t("noBid")}</Btn>
      </div>
    </>
  );
}

function AuctionPanel({ v }: { v: RoomView }) {
  const g = v.game!;
  const a = g.auction!;
  const s = g.s;
  const seats = v.you.seats.filter((x) => !s.ps[x].out);
  const min = a.price === 0 ? 10 : a.price + 10;
  return (
    <div class="decide auction" aria-live="polite">
      <Strip label={t("stripAuction")} at={a.at} />
      <p class="ask">{t("auction", { space: spaceName(a.at) })}</p>
      <CityBrief v={v} at={a.at} />
      <p class="big num">
        {a.leader === null
          ? t("auctionNone")
          : seats.includes(a.leader)
            ? t("auctionYouLead", { price: money(a.price) })
            : t("auctionLead", { team: seatName(v, a.leader), price: money(a.price) })}
      </p>
      <p>
        <Countdown until={a.endsAt} label="soldIn" />
      </p>
      {seats.map((seat) => (
        <div class="choices" key={seat}>
          {seats.length > 1 && <SeatChip v={v} seat={seat} small />}
          {[min, min + 40, min + 90].map((amount, i) => (
            <Btn
              key={i}
              kind={i === 0 ? "primary" : undefined}
              disabled={a.leader === seat || s.ps[seat].cash < amount}
              onClick={() => send({ t: "bid", aid: a.id, amount, seat })}
            >
              {t("bidAt", { price: money(amount) })}
            </Btn>
          ))}
        </div>
      ))}
    </div>
  );
}

function QuizPanel({ v }: { v: RoomView }) {
  const g = v.game!;
  const q = g.quiz!;
  const mine = v.you.seats.includes(q.visitor);
  return (
    <div class="decide quiz" aria-live="polite">
      <Strip label={t("stripQuiz")} />
      <p class="ask">{mine ? t("quizAsk", { item: quizItemText(q.item) }) : t("quizWatch", { team: seatName(v, q.visitor), item: quizItemText(q.item) })}</p>
      <p>
        <Countdown until={q.endsAt} />
      </p>
      {mine && (
        <div class="choices grid2">
          {TRASH_QUIZ.map((b, i) => (
            <Btn key={i} onClick={() => send({ t: "quiz", qid: q.id, choice: i })}>
              {tx(b.bin)}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

function SilencePanel({ v, acting, act, pd }: { v: RoomView; acting: number | undefined; act: (a: Action) => void; pd: Extract<Pending, { k: "silence" }> }) {
  const g = v.game!;
  const left = useCountdown(g.silenceUntil);
  const others = activePlayers(g.s).filter((q) => q !== pd.who);
  if (left !== null && left > 0)
    return (
      <div class="decide silence" aria-live="polite">
        <p class="ask">🤫 {t("silenceTitle")}</p>
        <p class="huge num">{left}</p>
        <p class="muted">{t("silencePull")}</p>
      </div>
    );
  if (acting !== pd.who) return <Waiting v={v} />;
  return (
    <div class="decide silence">
      <Strip label={t("stripSilence")} />
      <p class="ask">{t("silenceAsk")}</p>
      <Choices items={[-1, ...others]} label={(q) => (q < 0 ? t("nobody") : seatName(v, q))} pick={(q) => act({ sound: q < 0 ? null : q })} />
    </div>
  );
}
