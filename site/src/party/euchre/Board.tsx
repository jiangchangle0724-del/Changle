import { Bot } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap, reduced } from "../../lib/anim";
import { isRed, isTrump, rankOf, suitOf, team, trickWinner, type EMove } from "../../shared/euchre";
import type { ECard, EPlay, ESuit, EuchreView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";

/** Suit glyphs, forced to text so phones don't swap in a red heart emoji. */
export const SUIT_GLYPH: Record<ESuit, string> = { S: "♠︎", H: "♥︎", D: "♦︎", C: "♣︎" };
const SUIT_NAME: Record<ESuit, [string, string]> = { S: ["黑桃", "spades"], H: ["红心", "hearts"], D: ["方块", "diamonds"], C: ["梅花", "clubs"] };
export const suitName = (s: ESuit, zh: boolean) => SUIT_NAME[s][zh ? 0 : 1];

type Pos = "bottom" | "left" | "top" | "right";
const POS: Pos[] = ["bottom", "left", "top", "right"];
const AWAY: Record<Pos, { x?: number; y?: number }> = { bottom: { y: 120 }, top: { y: -120 }, left: { x: -130 }, right: { x: 130 } };

/** A playing card, face up, or its back. */
export function Card({
  card,
  trump,
  size = "md",
  state,
  picked,
  onClick,
  back,
}: {
  card?: ECard;
  trump?: ESuit | null;
  size?: "sm" | "md" | "lg";
  state?: "legal" | "dim" | "win";
  picked?: boolean;
  onClick?: () => void;
  back?: boolean;
}) {
  if (back || !card) return <span className={`ecard ecard-${size} ecard-back`} aria-hidden="true" />;
  const s = suitOf(card);
  const r = rankOf(card);
  const trumpCard = !!trump && isTrump(card, trump);
  const cls = `ecard ecard-${size} ${isRed(s) ? "is-red" : ""} ${state ? `is-${state}` : ""} ${trumpCard ? "is-trump" : ""} ${picked ? "is-picked" : ""}`;
  const body = (
    <>
      <span className="ecard-corner" aria-hidden="true">
        <b>{r}</b>
        <i>{SUIT_GLYPH[s]}</i>
      </span>
      <span className="ecard-pip" aria-hidden="true">
        {SUIT_GLYPH[s]}
      </span>
      {trumpCard && <span className="ecard-trump" aria-hidden="true" />}
    </>
  );
  const label = `${r} ${SUIT_GLYPH[s]}`;
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={label} data-card={card}>
        {body}
      </button>
    );
  return (
    <span className={cls} role="img" aria-label={label} data-card={card}>
      {body}
    </span>
  );
}

/** A computer player's face. */
export function BotFace({ size = 40 }: { size?: number }) {
  return (
    <span className="eu-bot" style={{ width: size, height: size }} aria-hidden="true">
      <Bot size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

export type Who = { name: string; face: (size: number) => ReactNode; mine?: boolean };

/**
 * The table: me at the bottom, my partner across, opponents either side; the trick in the
 * middle, my hand along the bottom, and whatever I can do right now underneath it.
 */
export function EuchreBoard({ v, who, onMove, onNext, nextNote }: { v: EuchreView; who: (seat: number) => Who; onMove: (mv: EMove) => void; onNext?: () => void; nextNote?: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const me = v.mySeat;
  const base = me ?? 0;
  const rel = (seat: number) => (seat - base + 4) % 4;
  const seatAt = (r: number) => (base + r) % 4;
  const usTeam = team(base);
  const bidding = v.phase === "bid1" || v.phase === "bid2" || v.phase === "discard";
  const acting = bidding || v.phase === "play";
  const myTurn = me !== null && v.turn === me && acting;
  const lastBid = (seat: number) => [...v.bids].reverse().find((b) => b.seat === seat);
  const [alone, setAlone] = useState(false);
  useEffect(() => setAlone(false), [v.handNo, v.phase]);

  const trickRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // on a short phone, bring the buttons into view when it's your move
  useEffect(() => {
    const el = actionsRef.current;
    if (!myTurn || !el || v.phase === "play") return;
    const id = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8) el.scrollIntoView({ block: "end", behavior: reduced() ? "auto" : "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [myTurn, v.phase]);

  // a card played slides in from whoever played it
  const shown = useRef(0);
  useLayoutEffect(() => {
    const n = v.trick.length;
    if (n > shown.current && trickRef.current && !reduced()) {
      const last = v.trick[n - 1];
      const p = POS[rel(last.seat)];
      const el = trickRef.current.querySelector<HTMLElement>(`[data-slot="${p}"]:not(.eu-ghost) .ecard`);
      if (el) gsap.fromTo(el, { ...AWAY[p], opacity: 0, rotate: p === "left" ? -14 : 14 }, { x: 0, y: 0, opacity: 1, rotate: 0, duration: 0.36, ease: "power3.out", clearProps: "transform,opacity" });
    }
    shown.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.trick.length, v.handNo]);

  // a finished trick is swept toward whoever took it
  const trickKey = `${v.handNo}-${v.tricks[0] + v.tricks[1]}`;
  const prevKey = useRef(trickKey);
  const [sweep, setSweep] = useState<{ key: string; plays: EPlay[]; to: Pos } | null>(null);
  useEffect(() => {
    if (prevKey.current !== trickKey && v.lastTrick && !v.trick.length && !reduced()) setSweep({ key: trickKey, plays: v.lastTrick.plays, to: POS[rel(v.lastTrick.winner)] });
    prevKey.current = trickKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trickKey]);
  useLayoutEffect(() => {
    if (!sweep || !trickRef.current) return;
    const els = trickRef.current.querySelectorAll(".eu-ghost .ecard");
    const tw = gsap.to(els, { ...AWAY[sweep.to], opacity: 0, scale: 0.6, duration: 0.42, ease: "power2.in", stagger: 0.025, onComplete: () => setSweep(null) });
    return () => {
      tw.kill();
    };
  }, [sweep]);

  // the deal: five cards drop into the hand
  useLayoutEffect(() => {
    if (!handRef.current || reduced() || !v.handNo) return;
    const cards = handRef.current.querySelectorAll(".ecard");
    gsap.fromTo(cards, { y: -70, opacity: 0, rotate: -8 }, { y: 0, opacity: 1, rotate: 0, duration: 0.42, ease: "back.out(1.5)", stagger: 0.06, delay: 0.1, clearProps: "transform,opacity" });
  }, [v.handNo]);

  const winSeat = v.phase === "trick" && v.trump && v.trick.length ? trickWinner(v.trick, v.trump) : null;
  const turnName = who(v.turn).name;

  const seatBox = (r: number) => {
    const seat = seatAt(r);
    const w = who(seat);
    const bid = lastBid(seat);
    const sitting = v.sitter === seat;
    const turn = v.turn === seat && acting;
    const p = POS[r];
    const showBid = bid && (bidding || (v.maker === seat && bid.act !== "pass" && v.phase !== "hand" && v.phase !== "end"));
    let chip: ReactNode = null;
    if (sitting) chip = <span className="eu-chip">{zh ? "这手不出牌" : "Sitting out"}</span>;
    else if (showBid)
      chip = (
        <span className={`eu-chip ${bid.act !== "pass" ? "is-call" : ""}`}>
          {bid.act === "pass" ? (
            zh ? (
              "过"
            ) : (
              "Pass"
            )
          ) : (
            <>
              <span className={isRed(bid.suit!) ? "suit-red" : ""}>{SUIT_GLYPH[bid.suit!]}</span>
              {zh ? (bid.alone ? "单干" : "做主") : bid.alone ? "alone" : "trump"}
            </>
          )}
        </span>
      );
    else if (turn && r !== 0) chip = <span className="eu-chip is-thinking">{zh ? "思考中" : "Thinking"}</span>;
    return (
      <div className={`eu-seat eu-${p} ${turn ? "is-turn" : ""} ${sitting ? "is-sitting" : ""} ${team(seat) === usTeam ? "is-us" : "is-them"}`}>
        <span className="eu-face">
          {w.face(r === 0 ? 28 : 40)}
          {v.dealer === seat && v.phase !== "setup" && (
            <span className="eu-dealer" title={zh ? "庄家" : "Dealer"}>
              {zh ? "庄" : "D"}
            </span>
          )}
        </span>
        <span className="eu-name">{w.name}</span>
        {r !== 0 && (
          <span className="eu-backs" aria-label={zh ? `${v.counts[seat]} 张牌` : `${v.counts[seat]} cards`}>
            {Array.from({ length: v.counts[seat] }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
        <span className="eu-chip-slot">{chip}</span>
      </div>
    );
  };

  const upSuit = v.upcard ? suitOf(v.upcard) : null;
  const iSit = me !== null && v.sitter === me;
  const handTrump = v.trump ?? (v.phase === "bid1" ? upSuit : null);

  return (
    <div className="eu">
      <div className="eu-score">
        <span className="eu-team is-us">
          <small>{me === null ? (zh ? "A 队" : "Team A") : zh ? "我们" : "Us"}</small>
          <strong className="tabular">
            {v.score[usTeam]}
            <em>/{v.target}</em>
          </strong>
        </span>
        <span className="eu-mid">
          {v.trump ? (
            <span className={`eu-trump ${isRed(v.trump) ? "is-red" : ""}`}>
              <b>{SUIT_GLYPH[v.trump]}</b>
              {zh ? `${suitName(v.trump, true)}做主` : `${suitName(v.trump, false)} are trump`}
            </span>
          ) : (
            <span className="eu-trump is-none">{zh ? "还没定主" : "No trump yet"}</span>
          )}
          <small className="tabular">{zh ? `墩数 ${v.tricks[usTeam]} : ${v.tricks[1 - usTeam]}` : `Tricks ${v.tricks[usTeam]} : ${v.tricks[1 - usTeam]}`}</small>
        </span>
        <span className="eu-team is-them">
          <small>{me === null ? (zh ? "B 队" : "Team B") : zh ? "对方" : "Them"}</small>
          <strong className="tabular">
            {v.score[1 - usTeam]}
            <em>/{v.target}</em>
          </strong>
        </span>
      </div>

      <div className="eu-table">
        {seatBox(2)}
        {seatBox(1)}
        <div className="eu-center" ref={trickRef}>
          {bidding && v.upcard && (
            <div className={`eu-upcard ${v.phase === "bid2" ? "is-down" : ""}`}>
              {v.phase === "bid2" ? <Card back size="sm" /> : <Card card={v.upcard} size="sm" />}
              <small>{v.phase === "bid2" ? (zh ? "翻开的牌被盖掉了" : "Turned down") : zh ? "翻开的牌" : "Turned up"}</small>
            </div>
          )}
          {v.trick.map((p) => (
            <span key={`${v.handNo}-${p.card}`} className={`eu-slot eu-slot-${POS[rel(p.seat)]}`} data-slot={POS[rel(p.seat)]}>
              <Card card={p.card} trump={v.trump} size="sm" state={winSeat === p.seat ? "win" : undefined} />
            </span>
          ))}
          {sweep &&
            sweep.plays.map((p) => (
              <span key={`ghost-${sweep.key}-${p.card}`} className={`eu-slot eu-ghost eu-slot-${POS[rel(p.seat)]}`} data-slot={POS[rel(p.seat)]}>
                <Card card={p.card} trump={v.trump} size="sm" />
              </span>
            ))}
          {winSeat !== null && <p className="eu-took">{who(winSeat).mine ? (zh ? "你拿下这墩" : "Your trick") : zh ? `${who(winSeat).name} 拿下` : `${who(winSeat).name} takes it`}</p>}
        </div>
        {seatBox(3)}
        {seatBox(0)}
      </div>

      {me !== null && (
        <div className={`eu-hand n${v.hand.length} ${iSit ? "is-sitting" : ""}`} ref={handRef}>
          {v.hand.map((c, i) => {
            const legal = v.legal.includes(c);
            const discarding = myTurn && v.phase === "discard";
            const playing = myTurn && v.phase === "play";
            const mid = (v.hand.length - 1) / 2;
            return (
              <span key={c} className="eu-fan" style={{ ["--rot" as string]: `${(i - mid) * 3}deg`, ["--lift" as string]: `${Math.abs(i - mid) ** 2 * 1.4}px` }}>
                <Card
                  card={c}
                  trump={handTrump}
                  state={iSit ? "dim" : playing ? (legal ? "legal" : "dim") : discarding ? "legal" : undefined}
                  picked={v.phase === "discard" && c === v.upcard}
                  onClick={playing && legal ? () => onMove({ t: "play", card: c }) : discarding ? () => onMove({ t: "discard", card: c }) : undefined}
                />
              </span>
            );
          })}
        </div>
      )}

      <div className="eu-actions" ref={actionsRef}>
        {myTurn && v.phase === "bid1" && upSuit && (
          <>
            <p className="eu-prompt">
              {me === v.dealer
                ? zh
                  ? `你是庄家：拿起这张牌，让${suitName(upSuit, true)}做主？`
                  : `You're dealing. Pick it up and make ${suitName(upSuit, false)} trump?`
                : zh
                  ? `让${suitName(upSuit, true)}做主吗？庄家会拿起这张牌。`
                  : `Make ${suitName(upSuit, false)} trump? The dealer picks the card up.`}
            </p>
            <AloneToggle alone={alone} setAlone={setAlone} />
            <div className="eu-choice">
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => onMove({ t: "pass" })}>
                {zh ? "过" : "Pass"}
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => onMove({ t: "order", alone })}>
                <span className={`eu-btn-suit ${isRed(upSuit) ? "is-red" : ""}`}>{SUIT_GLYPH[upSuit]}</span>
                {me === v.dealer ? (zh ? "拿起来" : "Pick it up") : zh ? "就它做主" : "Order it up"}
              </button>
            </div>
          </>
        )}
        {myTurn && v.phase === "bid2" && upSuit && (
          <>
            <p className="eu-prompt">{me === v.dealer ? (zh ? "转回庄家了，你必须选一个花色做主" : "It's back to you. The dealer has to name trump.") : zh ? "选一个别的花色做主，或者过" : "Name another suit as trump, or pass"}</p>
            <AloneToggle alone={alone} setAlone={setAlone} />
            <div className={`eu-suits ${me !== v.dealer ? "has-pass" : ""}`}>
              {(["S", "H", "D", "C"] as ESuit[])
                .filter((s) => s !== upSuit)
                .map((s) => (
                  <button key={s} type="button" className={`eu-suit ${isRed(s) ? "is-red" : ""}`} onClick={() => onMove({ t: "call", suit: s, alone })}>
                    <b aria-hidden="true">{SUIT_GLYPH[s]}</b>
                    {suitName(s, zh)}
                  </button>
                ))}
              {me !== v.dealer && (
                <button type="button" className="eu-suit is-pass" onClick={() => onMove({ t: "pass" })}>
                  {zh ? "过" : "Pass"}
                </button>
              )}
            </div>
          </>
        )}
        {myTurn && v.phase === "discard" && <p className="eu-prompt">{zh ? "你拿起了翻开的牌，点一张扔掉" : "You picked it up. Tap a card to throw away."}</p>}
        {myTurn && v.phase === "play" && <p className="eu-prompt">{v.trick.length ? (zh ? "出一张。有同花色必须跟" : "Play a card. Follow suit if you can.") : zh ? "你先出" : "Your lead. Play any card."}</p>}
        {iSit && v.phase === "play" && <p className="eu-wait">{zh ? "队友单干，你这手不出牌" : "Your partner is going alone. Sit this hand out."}</p>}
        {!myTurn && acting && !iSit && (
          <p className="eu-wait" role="status">
            <i aria-hidden="true" />
            {v.phase === "play"
              ? zh
                ? `等 ${turnName} 出牌`
                : `${turnName} is playing`
              : v.phase === "discard"
                ? zh
                  ? `等 ${turnName} 扔一张牌`
                  : `${turnName} is throwing a card away`
                : zh
                  ? `等 ${turnName} 叫主`
                  : `${turnName} is deciding on trump`}
          </p>
        )}

        {(v.phase === "hand" || v.phase === "end") && v.result && <HandResult v={v} usTeam={usTeam} watching={me === null} onNext={onNext} nextNote={nextNote} who={who} />}
      </div>
    </div>
  );
}

function HandResult({ v, usTeam, watching, onNext, nextNote, who }: { v: EuchreView; usTeam: 0 | 1; watching: boolean; onNext?: () => void; nextNote?: string; who: (seat: number) => Who }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const r = v.result!;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced() || !ref.current) return;
    gsap.fromTo(ref.current, { y: 18, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)", clearProps: "transform,opacity" });
  }, [v.handNo, v.phase]);
  const good = watching ? null : r.team === usTeam;
  const side = (t: 0 | 1) => (watching ? (t === 0 ? (zh ? "A 队" : "Team A") : zh ? "B 队" : "Team B") : t === usTeam ? (zh ? "我们" : "We") : zh ? "对方" : "They");
  const maker = v.maker !== null ? who(v.maker).name : "";
  let title: string;
  if (v.phase === "end") title = watching ? (zh ? `${side(v.winner!)}赢了` : `${side(v.winner!)} wins`) : v.winner === usTeam ? (zh ? "我们赢了！" : "We win!") : zh ? "对方赢了" : "They win";
  else if (r.euchre) title = watching ? (zh ? `${maker}被尤克了` : `${maker} got euchred`) : r.makers === usTeam ? (zh ? "被尤克了" : "Euchred") : zh ? "尤克了对方！" : "We euchred them!";
  else if (r.march) title = zh ? `${side(r.team)}五墩全拿${r.alone ? "，还是单干" : ""}！` : `${side(r.team)} took all five${r.alone ? ", alone" : ""}!`;
  else title = zh ? `${side(r.team)}叫主成功` : `${side(r.team)} made it`;
  return (
    <div className={`eu-result ${good === null ? "" : good ? "is-good" : "is-bad"}`} ref={ref}>
      <strong>{title}</strong>
      <span className="tabular">
        {zh ? `${side(r.team)} +${r.points} 分，现在 ${v.score[usTeam]} : ${v.score[1 - usTeam]}` : `${side(r.team)} +${r.points}. Score ${v.score[usTeam]} : ${v.score[1 - usTeam]}`}
      </span>
      {onNext ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onNext}>
          {v.phase === "end" ? (zh ? "再来一局" : "Play again") : zh ? "发下一手" : "Deal the next hand"}
        </button>
      ) : (
        nextNote && <p className="hint">{nextNote}</p>
      )}
    </div>
  );
}

/** The rules sheet, shared by the online table and the one-phone game. */
export function EuchreRules() {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const H = SUIT_GLYPH.H;
  const D = SUIT_GLYPH.D;
  if (lang === "zh")
    return (
      <>
        <p>四个人两队，对面坐的是队友。24 张牌（9 到 A），每人五张，再翻开一张。</p>
        <p>叫主：从庄家左边开始，每人可以让翻开那张的花色做主，庄家拿起它再扔掉一张。都说过，就第二轮，可以叫别的花色；转回庄家时庄家必须叫。</p>
        <p>
          主牌的大小：比如{H}做主，最大是 J{H}，其次是同颜色的 J{D}，然后 A{H} K{H} Q{H} 10{H} 9{H}。有同花色必须跟，没有可以出主牌毙。
        </p>
        <p>计分：叫主的一方拿到三墩得 1 分，五墩全拿 2 分，单干（队友不出牌）全拿 4 分。拿不到三墩就是“被尤克”，对方得 2 分。先到目标分数的队赢。</p>
        <p>{custom ? "惩罚：被尤克的一方受罚，最后输的队也受罚。" : "罚酒：被尤克的一方喝一口，最后输的队喝两口。"}</p>
      </>
    );
  return (
    <>
      <p>Four players, two teams. Your partner sits across from you. 24 cards (9 to Ace), five each, and one turned up.</p>
      <p>Calling trump: starting left of the dealer, anyone can make the turned-up suit trump. The dealer picks that card up and throws one away. If everyone passes, go round again and name any other suit. If it gets back to the dealer, the dealer has to name one.</p>
      <p>
        Trump order, say {H} is trump: J{H} is highest, then the other red jack J{D}, then A{H} K{H} Q{H} 10{H} 9{H}. Follow suit if you can; if you can't, you may trump.
      </p>
      <p>Scoring: the team that named trump needs three tricks for 1 point, all five for 2, all five alone (partner sits out) for 4. Fall short and you're euchred: 2 points to the other team. First to the target wins.</p>
      <p>{custom ? "Penalties: get euchred and take the penalty. So does the team that loses the game." : "Drinks: get euchred, take a sip. The losing team drinks two."}</p>
    </>
  );
}

function AloneToggle({ alone, setAlone }: { alone: boolean; setAlone: (b: boolean) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <label className="eu-alone">
      <input type="checkbox" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
      <span className="eu-switch" aria-hidden="true" />
      <span className="eu-alone-text">
        <strong>{zh ? "单干" : "Go alone"}</strong>
        <small>{zh ? "队友这手不出牌，五墩全拿得 4 分" : "Partner sits out. All five tricks scores 4."}</small>
      </span>
    </label>
  );
}
