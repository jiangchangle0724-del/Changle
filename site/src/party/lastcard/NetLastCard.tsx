import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Crown, Hand, Megaphone, Shuffle } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Moment } from "../../components/Figure";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import { haptic, sfx } from "../../lib/sfx";
import { NetFrame } from "../../online/NetFrame";
import { SeatFace } from "../../online/People";
import { useRoom } from "../../online/RoomContext";
import { usePlayers, useWatching } from "../../online/players";
import { HostButton, HostRow, useYourTurn, Waiting } from "../../online/games/common";
import { cardName, COLOR_NAME, faceOf, isWild, LC_COLORS, type LcColor } from "../../shared/lastcard/cards";
import { LC_CALL } from "../../shared/lastcard/name";
import type { LastCardView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { Button } from "../../ui/Button";
import { Tabs } from "../../ui/Tabs";
import { CardArt, Mark } from "./Card";
import { Fan, LcRules } from "./Rules";
import { logLine, momentWord, type Who } from "./words";
import "../../ui/base.css";
import "./lastcard.css";

/**
 * 最后一张 · Last Card on a phone at an online table (the rules: shared/engine/games/lastcard.ts).
 * Before the deal, the host's house rules. Then, top to bottom: everyone in turn order with how many
 * cards they hold (the turn ringed, the way play goes between them), the table (the draw pile, the
 * face-up card, the colour in force, who's next), what's happening, and at the bottom by the thumb
 * this phone's own hand and what it can do now. A tap picks a card up, a second tap (or the button)
 * plays it; a wild asks for its colour first.
 */
export default function NetLastCard({ v, onLeave }: { v: LastCardView; onLeave: () => void }) {
  return (
    <NetFrame title={GAME_BY_ID.lastcard.name} rules={<LcRules stack={v.stack} />} onLeave={onLeave} className="lc-screen">
      <div className={`lc is-${v.phase}`}>{v.phase === "setup" ? <Setup v={v} /> : <Board v={v} />}</div>
    </NetFrame>
  );
}

/* ------------------------------------------------------------------ before the deal */

const TARGET_KEYS = ["1", "3", "5", "0"] as const;

function Setup({ v }: { v: LastCardView }) {
  const { isHost, g, me, room, nameOf } = useRoom();
  const { lang } = useStore();
  const pen = usePenaltyText();
  const zh = lang === "zh";
  const players = usePlayers();
  const over = players.length > v.order.length;
  const targetName = (n: number) => (n === 0 ? (zh ? "不限" : "No limit") : zh ? `${n} 轮` : `${n}`);
  const rows: [string, string][] = pen.isCustom
    ? [
        [zh ? "吃 +2" : "Hit with +2", zh ? "受罚一次" : "the penalty once"],
        [zh ? "吃 +4，或叠到 4 张以上" : "Hit with +4, or a stack of 4+", zh ? "受罚两次" : "the penalty twice"],
        [zh ? "剩一张没喊，被抓到" : "Caught on one card", zh ? "摸 2 张，受罚一次" : "draw 2, the penalty once"],
        [zh ? "一轮结束，手里牌最多" : "Most cards when a round ends", zh ? "受罚一次" : "the penalty once"],
      ]
    : [
        [zh ? "吃 +2" : "Hit with +2", zh ? "喝一口" : "a sip"],
        [zh ? "吃 +4，或叠到 4 张以上" : "Hit with +4, or a stack of 4+", zh ? "喝两口" : "two sips"],
        [zh ? "剩一张没喊，被抓到" : "Caught on one card", zh ? "摸 2 张，喝一口" : "draw 2, and a sip"],
        [zh ? "一轮结束，手里牌最多" : "Most cards when a round ends", zh ? "喝一口" : "a sip"],
      ];

  return (
    <div className="lc-setup">
      <Fan />
      <section className="lc-panel" aria-label={zh ? "这一局的人" : "Who's playing"}>
        <ul className="lc-faces">
          {v.order.map((pid) => (
            <li key={pid}>
              <SeatFace seat={room?.seats.find((s) => s.id === pid)} size={44} />
              <span>{pid === me ? (zh ? "你" : "You") : nameOf(pid)}</span>
            </li>
          ))}
        </ul>
        {over && <p className="lc-note">{zh ? "一局最多 10 人，其余的人这局在旁边看" : "Ten play at most: the rest sit this game out"}</p>}
      </section>

      <section className="lc-panel lc-house">
        <div className="lc-setting">
          <p className="lc-setting-name">
            {zh ? "叠加" : "Stacking"}
            <small>{zh ? "+2 可以接 +2，+4 可以接 +4，接不上的人全摸" : "Answer a +2 with a +2, a +4 with a +4; whoever can't takes the lot"}</small>
          </p>
          {isHost ? (
            <Tabs
              variant="segmented"
              label={zh ? "叠加" : "Stacking"}
              items={[
                { key: "off", label: zh ? "关" : "Off" },
                { key: "on", label: zh ? "开" : "On" },
              ]}
              value={v.stack ? "on" : "off"}
              onChange={(k) => g("stack", { on: k === "on" })}
            />
          ) : (
            <b className="lc-setting-value">{v.stack ? (zh ? "开" : "On") : zh ? "关" : "Off"}</b>
          )}
        </div>
        <div className="lc-setting">
          <p className="lc-setting-name">
            {zh ? "先赢几轮" : "Rounds to win"}
            <small>{zh ? "先出完一手算赢一轮" : "Empty your hand first to win a round"}</small>
          </p>
          {isHost ? (
            <Tabs
              variant="segmented"
              label={zh ? "先赢几轮" : "Rounds to win"}
              items={TARGET_KEYS.map((k) => ({ key: k, label: targetName(Number(k)) }))}
              value={String(v.target) as (typeof TARGET_KEYS)[number]}
              onChange={(k) => g("target", { n: Number(k) })}
            />
          ) : (
            <b className="lc-setting-value">{targetName(v.target)}</b>
          )}
        </div>
      </section>

      <section className="lc-panel" aria-label={zh ? "惩罚" : "Penalties"}>
        <dl className="lc-pens">
          {rows.map(([what, pay]) => (
            <Fragment key={what}>
              <dt>{what}</dt>
              <dd>{pay}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <div className="lc-dock">
        {isHost ? (
          <Button tone="primary" size="lg" block icon={Shuffle} disabled={v.order.length < 2} onClick={() => g("deal")}>
            {zh ? "发牌" : "Deal"}
          </Button>
        ) : (
          <Waiting>{zh ? "等主人发牌" : "Waiting for the host to deal"}</Waiting>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the table */

function Board({ v }: { v: LastCardView }) {
  const { me, g, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const tr = (x: T) => (zh ? x.zh : x.en);
  const watching = useWatching();
  const inRound = v.order.includes(me);
  const playing = v.phase === "play";
  const mine = playing && v.turn === me;
  useYourTurn(mine);
  const who: Who = (pid) => ({ name: nameOf(pid), you: pid === me });

  // the card picked up (a first tap); put down again when the turn moves on
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [v.tn]);
  // one move per turn from this phone: a quick double tap sends nothing twice
  const sent = useRef(-1);
  const send = (x: string, rest: Record<string, unknown> = {}) => {
    if (sent.current === v.tn) return;
    const tn = v.tn;
    sent.current = tn;
    window.setTimeout(() => {
      if (sent.current === tn) sent.current = -1;
    }, 1500);
    g(x, { ...rest, at: tn });
  };
  const playCard = (card: number, color?: LcColor) => {
    send("play", { card, color });
    haptic(10);
  };
  // a card that can't go down says so with a shake
  const [nope, setNope] = useState<{ card: number; n: number } | null>(null);
  const tap = (card: number) => {
    if (!mine) return;
    if (!v.legal.includes(card)) {
      setNope((x) => ({ card, n: (x?.n ?? 0) + 1 }));
      haptic(30);
      return;
    }
    if (sel === card && !isWild(card)) return playCard(card);
    setSel(card);
    sfx.tap();
  };

  const n = v.order.length;
  const at = v.turn ? v.order.indexOf(v.turn) : -1;
  const next = at >= 0 && n ? v.order[(((at + v.dir) % n) + n) % n] : null;
  const myCount = v.counts[me] ?? 0;
  const called = v.called.includes(me);
  const canCall = playing && inRound && !called && (myCount === 1 || (myCount === 2 && mine));
  const urgent = v.open === me;
  const last = v.log[v.log.length - 1];

  return (
    <>
      <Seats v={v} />
      <Felt v={v} next={next} />
      <div className="lc-status" role="status">
        {playing ? (
          mine ? (
            <p className="lc-yours" key={`y${v.tn}`}>
              {zh ? "轮到你了" : "Your turn"}
            </p>
          ) : (
            <p className="lc-turn">{zh ? <>等 <b>{nameOf(v.turn)}</b> 出牌</> : <>Waiting for <b>{nameOf(v.turn)}</b></>}</p>
          )
        ) : null}
        {mine && <p className="lc-hint">{hint(v, zh)}</p>}
        {last && (
          <p className="lc-ticker" key={last.i}>
            {tr(logLine(last, who))}
          </p>
        )}
      </div>

      {playing && v.open && v.open !== me && inRound && (
        <div className="lc-catch" role="alert">
          <p>{zh ? `${nameOf(v.open)} 只剩一张，没喊！` : `${nameOf(v.open)} is on one card and didn't call it!`}</p>
          <Button tone="danger" size="lg" block icon={Hand} onClick={() => g("catch", { pid: v.open })}>
            {zh ? `抓 ${nameOf(v.open)}` : `Catch ${nameOf(v.open)}`}
          </Button>
        </div>
      )}

      {v.phase === "round" || v.phase === "end" ? (
        <RoundEnd v={v} />
      ) : inRound ? (
        <div className={`lc-mine ${mine ? "is-mine" : ""}`}>
          <HandRow v={v} sel={sel} onTap={tap} nope={nope} />
          <div className="lc-actions">
            {canCall && (
              <Button tone={urgent && !mine ? "primary" : "quiet"} size="lg" icon={Megaphone} onClick={() => g("call")}>
                {tr(LC_CALL)}
              </Button>
            )}
            {mine &&
              (sel !== null && isWild(sel) ? null : sel !== null ? (
                <Button tone="primary" size="lg" onClick={() => playCard(sel)}>
                  {zh ? `出 ${cardName(sel).zh}` : `Play ${cardName(sel).en}`}
                </Button>
              ) : v.drawn !== null ? (
                <>
                  <Button tone="quiet" size="lg" onClick={() => send("keep")}>
                    {zh ? "留着" : "Keep it"}
                  </Button>
                  <Button tone="primary" size="lg" onClick={() => (isWild(v.drawn!) ? setSel(v.drawn) : playCard(v.drawn!))}>
                    {zh ? "出这张" : "Play it"}
                  </Button>
                </>
              ) : v.pending > 0 ? (
                <Button tone="danger" size="lg" onClick={() => send("draw")}>
                  {zh ? `摸 ${v.pending} 张` : `Take ${v.pending}`}
                </Button>
              ) : (
                <Button tone={v.legal.length ? "quiet" : "primary"} size="lg" onClick={() => send("draw")}>
                  {zh ? "摸一张" : "Draw one"}
                </Button>
              ))}
          </div>
          {mine && sel !== null && isWild(sel) && <ColourPick onPick={(c) => playCard(sel, c)} onCancel={() => setSel(null)} />}
        </div>
      ) : (
        <p className="lc-out">{watching ? (zh ? "旁观中，这一轮不发你牌" : "Watching: no cards for you this round") : zh ? "这一轮你在旁边看，下一轮发牌时入局" : "You sit this round out. You're dealt in next round."}</p>
      )}

      <HostRow>
        {playing && v.turn && v.turn !== me && (
          <HostButton onClick={() => g("skip", { at: v.tn })}>{zh ? `替 ${nameOf(v.turn)} 摸一张，跳过` : `Draw for ${nameOf(v.turn)} and move on`}</HostButton>
        )}
      </HostRow>
    </>
  );
}

/** What the player on turn can do, in one line. */
function hint(v: LastCardView, zh: boolean): string {
  if (v.pending > 0) {
    const k = v.pendingKind === "d4" ? "+4" : "+2";
    return zh ? `接一张 ${k}，或者把 ${v.pending} 张全摸了` : `Stack a ${k}, or take all ${v.pending}`;
  }
  if (v.drawn !== null) return v.legal.length ? (zh ? "摸到的这张能出：出掉，或者留着" : "The card you drew fits: play it or keep it") : "";
  if (!v.legal.length) return zh ? "没有能出的牌，摸一张" : "Nothing fits: draw one";
  if (v.top === null || !v.color) return "";
  const c = COLOR_NAME[v.color];
  const k = faceOf(v.top).k;
  if (isWild(v.top)) return zh ? `出${c.zh}色的牌，或者变色牌` : `Play a ${c.en.toLowerCase()} card, or a wild`;
  const same = /^[0-9]$/.test(k) ? k : cardName(v.top)[zh ? "zh" : "en"].split(" ").slice(1).join(" ");
  return zh ? `出${c.zh}色、${same}，或者变色牌` : `Play ${c.en.toLowerCase()}, a ${same}, or a wild`;
}

/* ------------------------------------------------------------------ everyone, in turn order */

function Seats({ v }: { v: LastCardView }) {
  const { me, room, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const row = useRef<HTMLOListElement>(null);
  // a long table scrolls sideways: whoever's turn it is comes to the middle
  useEffect(() => {
    const el = row.current;
    const chip = el?.querySelector<HTMLElement>("[data-turn]");
    if (!el || !chip) return;
    const r = el.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: c.left - r.left - (r.width - c.width) / 2, behavior: still ? "auto" : "smooth" });
  }, [v.turn]);
  const Dir = v.dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <ol className="lc-seats" ref={row} aria-label={zh ? "出牌顺序" : "Turn order"}>
      {v.order.map((pid, i) => {
        const seat = room?.seats.find((s) => s.id === pid);
        const count = v.counts[pid] ?? 0;
        const turn = v.phase === "play" && v.turn === pid;
        const wins = v.wins[pid] ?? 0;
        return (
          <Fragment key={pid}>
            {i > 0 && (
              <li className="lc-dir" aria-hidden="true">
                <Dir />
              </li>
            )}
            <li className={`lc-seat ${turn ? "is-turn" : ""} ${pid === me ? "is-me" : ""} ${seat && !seat.on ? "is-away" : ""} ${v.winner === pid ? "is-winner" : ""}`} data-turn={turn || undefined} aria-current={turn ? "true" : undefined}>
              <span className="lc-seat-face">
                <SeatFace seat={seat} size={40} />
              </span>
              <span className="lc-seat-name">{pid === me ? (zh ? "你" : "You") : nameOf(pid)}</span>
              <span className="lc-seat-count tabular">
                {count}
                <span className="ui-visually-hidden">{zh ? "张牌" : count === 1 ? " card" : " cards"}</span>
              </span>
              {v.called.includes(pid) && count <= 2 && <span className="lc-flag is-called">{zh ? "喊了" : "Called"}</span>}
              {v.open === pid && <span className="lc-flag is-open">{zh ? "没喊" : "No call"}</span>}
              {wins > 0 && (
                <span className="lc-seat-wins tabular" aria-label={zh ? `赢了 ${wins} 轮` : `${wins} won`}>
                  <Crown aria-hidden="true" />
                  {wins}
                </span>
              )}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ the draw pile, the pile, the colour */

function Felt({ v, next }: { v: LastCardView; next: string | null }) {
  const { me, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const tr = (x: T) => (zh ? x.zh : x.en);
  // the last card down lands again whenever a new one is played (from the bottom if it was this phone's)
  const lastPlay = [...v.log].reverse().find((e) => e.k === "play");
  const color = v.color;
  const topName = v.top !== null ? tr(cardName(v.top)) : "";
  const Arrow = v.dir === 1 ? ArrowRight : ArrowLeft;
  return (
    <div className="lc-felt">
      <div className="lc-pile" role="img" aria-label={zh ? `摸牌堆，还有 ${v.pile} 张` : `Draw pile: ${v.pile} left`}>
        <span className="lc-pile-stack" aria-hidden="true">
          <CardArt back />
          <CardArt back />
          <CardArt back />
        </span>
        <span className="lc-pile-n tabular" aria-hidden="true">
          {v.pile}
        </span>
      </div>

      <div className="lc-discard" role="img" aria-label={zh ? `桌上：${topName}` : `On the pile: ${topName}`}>
        <span className="lc-under" aria-hidden="true" />
        {v.top !== null && (
          <span className={`lc-top ${lastPlay && lastPlay.k === "play" && lastPlay.p === me ? "from-me" : ""}`} key={lastPlay?.i ?? "deal"} data-card={v.top}>
            <CardArt id={v.top} pick={isWild(v.top) ? color : null} />
          </span>
        )}
        {v.pending > 0 && (
          <span className="lc-pending tabular" aria-label={zh ? `叠了 ${v.pending} 张` : `${v.pending} stacked`}>
            +{v.pending}
          </span>
        )}
        <MomentFlash v={v} />
      </div>

      <div className="lc-info">
        {color && (
          <span className={`lc-colour is-${color}`} key={color}>
            <Mark c={color} ink />
            <span>
              <small>{zh ? "现在是" : "Colour"}</small>
              <b>{zh ? `${COLOR_NAME[color].zh}色` : COLOR_NAME[color].en}</b>
            </span>
          </span>
        )}
        {v.phase === "play" && next && (
          <span className="lc-next">
            <small>{zh ? "下一位" : "Next"}</small>
            <b>
              <Arrow aria-hidden="true" />
              {next === me ? (zh ? "你" : "You") : nameOf(next)}
            </b>
          </span>
        )}
      </div>
    </div>
  );
}

/** The big word a skip, a reverse, a +2, a call or a catch flashes over the pile, once. */
function MomentFlash({ v }: { v: LastCardView }) {
  const { lang } = useStore();
  const last = v.log[v.log.length - 1];
  // only what happens while this screen is up (not whatever was last when it opened)
  const from = useRef(last?.i ?? 0);
  const word = last && last.i > from.current ? momentWord(last) : null;
  // (a skip knocks, a reverse swooshes: once each, on this phone, as it happens)
  const heard = useRef(from.current);
  const i = last?.i ?? 0;
  useEffect(() => {
    if (!last || i <= heard.current) return;
    heard.current = i;
    if (last.k === "skip") sfx.woodblock(1.3, 0.7);
    else if (last.k === "rev") sfx.whoosh(0.35, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  if (!word || !last) return null;
  return (
    <span className={`lc-moment is-${word.tone}`} key={last.i} aria-hidden="true">
      {lang === "zh" ? word.word.zh : word.word.en}
    </span>
  );
}

/* ------------------------------------------------------------------ this phone's hand */

/** the narrowest a card shows in a crowded hand: still a full tap target */
const MIN_STEP = 46;

function HandRow({ v, sel, onTap, nope }: { v: LastCardView; sel: number | null; onTap: (card: number) => void; nope: { card: number; n: number } | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 340, cw: 72 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      // the room the cards have: the hand's width less the row's own padding (it keeps a picked card's ring in view)
      const row = el.firstElementChild ? getComputedStyle(el.firstElementChild) : null;
      const pad = row ? parseFloat(row.paddingLeft) + parseFloat(row.paddingRight) : 0;
      setSize({ w: el.clientWidth - pad, cw: parseFloat(getComputedStyle(el).getPropertyValue("--lc-cw")) || 72 });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a card picked up in a hand that scrolls sideways comes into view
  useEffect(() => {
    if (sel === null) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-card="${sel}"]`);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "auto" : "smooth" });
  }, [sel]);
  const mine = v.phase === "play" && v.turn !== null && v.legal.length + (v.drawn !== null ? 1 : 0) > 0;
  const n = v.hand.length;
  // as wide as the hand needs, overlapping when it must, and scrolling past MIN_STEP
  const step = n <= 1 ? 0 : Math.max(MIN_STEP, Math.min(size.cw + 8, (size.w - size.cw) / (n - 1)));
  const wide = size.cw + step * Math.max(0, n - 1) > size.w + 1;
  // a hand that fits again sits still at its start (a card picked earlier may have scrolled it)
  useEffect(() => {
    if (!wide && box.current) box.current.scrollLeft = 0;
  }, [wide, n]);
  return (
    <div className={`lc-hand ${wide ? "is-wide" : ""}`} ref={box}>
      <div className="lc-hand-row" style={{ ["--lc-step" as string]: `${step}px` }} role="group" aria-label={zh ? `你的牌，${n} 张` : `Your cards: ${n}`}>
        {v.hand.map((c, i) => {
          const legal = v.legal.includes(c);
          const name = cardName(c);
          const picked = sel === c;
          return (
            <button
              key={c}
              type="button"
              className={`lc-hcard ${legal ? "is-legal" : ""} ${picked ? "is-picked" : ""} ${mine && !legal ? "is-dim" : ""} ${v.drawn === c ? "is-drawn" : ""}`}
              data-card={c}
              style={{ ["--i" as string]: i }}
              aria-pressed={picked}
              aria-label={`${zh ? name.zh : name.en}${legal ? (zh ? "，能出" : ", playable") : ""}`}
              onClick={() => onTap(c)}
            >
              <span className={`lc-hcard-in ${nope?.card === c ? "is-nope" : ""}`} key={nope?.card === c ? `n${nope.n}` : "c"}>
                <CardArt id={c} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A wild's colour: four big buttons, each the colour and its shape. */
function ColourPick({ onPick, onCancel }: { onPick: (c: LcColor) => void; onCancel: () => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className="lc-pick" role="group" aria-label={zh ? "选一个颜色" : "Pick a colour"}>
      <p className="lc-pick-q">{zh ? "变成什么颜色？" : "Which colour?"}</p>
      <div className="lc-pick-grid">
        {LC_COLORS.map((c) => (
          <button key={c} type="button" className={`lc-pick-btn is-${c}`} onClick={() => onPick(c)} data-color={c}>
            <Mark c={c} ink />
            <span>{zh ? `${COLOR_NAME[c].zh}色` : COLOR_NAME[c].en}</span>
          </button>
        ))}
      </div>
      <Button tone="quiet" size="sm" block onClick={onCancel}>
        {zh ? "先不出这张" : "Not this card"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ a round's end */

function RoundEnd({ v }: { v: LastCardView }) {
  const { isHost, g, me, room, nameOf } = useRoom();
  const { lang } = useStore();
  const zh = lang === "zh";
  const won = v.phase === "end" ? v.champ : v.winner;
  const seat = won ? room?.seats.find((s) => s.id === won) : undefined;
  const name = won === me ? (zh ? "你" : "You") : nameOf(won);
  const rows = v.order.slice().sort((a, b) => (v.counts[a] ?? 0) - (v.counts[b] ?? 0));
  const goal = v.target ? (zh ? `先赢 ${v.target} 轮的赢整场` : `First to ${v.target} wins the match`) : zh ? "不限轮数，一直玩下去" : "No target: play as many rounds as you like";
  return (
    <section className="lc-result" aria-label={zh ? "这一轮的结果" : "This round"}>
      {seat && <Moment seat={seat} kind="winner" small />}
      <h2 className="lc-result-title">
        {v.phase === "end"
          ? zh
            ? `${name} 赢下整场！`
            : won === me
              ? "You win the match!"
              : `${name} wins the match!`
          : zh
            ? `${name} 出完了，赢下第 ${v.round} 轮`
            : won === me
              ? `You're out: round ${v.round} is yours`
              : `${name} is out and takes round ${v.round}`}
      </h2>
      <p className="lc-result-goal">{goal}</p>
      <ol className="lc-result-list">
        {rows.map((pid) => {
          const left = v.counts[pid] ?? 0;
          return (
            <li key={pid} className={`${pid === v.winner ? "is-winner" : ""} ${v.most.includes(pid) ? "is-most" : ""}`}>
              <SeatFace seat={room?.seats.find((s) => s.id === pid)} size={36} />
              <span className="lc-result-name">{pid === me ? (zh ? "你" : "You") : nameOf(pid)}</span>
              <span className="lc-result-left tabular">{left === 0 ? (zh ? "出完了" : "out") : zh ? `剩 ${left} 张` : `${left} left`}</span>
              <span className="lc-result-wins tabular" aria-label={zh ? `赢了 ${v.wins[pid] ?? 0} 轮` : `${v.wins[pid] ?? 0} rounds won`}>
                <Crown aria-hidden="true" />
                {v.wins[pid] ?? 0}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="lc-dock">
        {isHost ? (
          <Button tone="primary" size="lg" block icon={Shuffle} onClick={() => g(v.phase === "end" ? "again" : "next")}>
            {v.phase === "end" ? (zh ? "再来一场" : "New match") : zh ? "发下一轮" : "Deal the next round"}
          </Button>
        ) : (
          <Waiting>{v.phase === "end" ? (zh ? "等主人再开一场" : "Waiting for the host") : zh ? "等主人发下一轮" : "Waiting for the host to deal"}</Waiting>
        )}
      </div>
    </section>
  );
}
