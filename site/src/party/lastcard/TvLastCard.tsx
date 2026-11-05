import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import type { T } from "../../i18n";
import { sfx } from "../../lib/sfx";
import { SeatFace } from "../../online/People";
import { cardName, cardOf, COLOR_NAME, isWild } from "../../shared/lastcard/cards";
import { LC_CALL } from "../../shared/lastcard/name";
import type { LastCardView } from "../../shared/protocol";
import { Bi, RoundTag, TvLineup, TvPerson, TvPodium, TvShow, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { CardArt, Mark } from "./Card";
import { logLine, momentWord, type Who } from "./words";
import "./lastcard.css";
import "./tv-lastcard.css";

const t = (zh: string, en: string): T => ({ zh, en });

/**
 * 最后一张 on the big screen (and a phone that only watches): the table as everyone can see it. The
 * face-up card and the colour in force, the draw pile, whose turn and which way play goes, how many
 * cards each player holds, who called last card and who forgot, what just happened, a round's end
 * and the match's podium. Never a hand: publicView takes them out, and nothing here reads one.
 */
export default function TvLastCard({ v, sound }: TvViewProps<LastCardView>) {
  const { tx } = useLang();
  const goal = v.target ? tx(`先赢 ${v.target} 轮`, `first to ${v.target}`) : tx("不限轮数", "no round limit");
  // (before the first deal the goal stands alone, so it starts with a capital)
  const round = <RoundTag>{v.round > 0 ? tx(`第 ${v.round} 轮 · ${goal}`, `Round ${v.round} · ${goal}`) : goal.charAt(0).toUpperCase() + goal.slice(1)}</RoundTag>;
  return (
    <TvShow game="lastcard" className={`tvlc is-${v.phase}`} phase={v.phase} round={round}>
      {v.phase === "setup" ? (
        <Setup v={v} />
      ) : v.phase === "end" ? (
        <MatchEnd v={v} sound={sound} />
      ) : (
        <>
          {v.phase === "round" ? <RoundEnd v={v} /> : <Table v={v} sound={sound} />}
          <Log v={v} />
          <Seats v={v} />
        </>
      )}
    </TvShow>
  );
}

/* ------------------------------------------------------------------ before the deal */

function Setup({ v }: { v: LastCardView }) {
  const { tx } = useLang();
  const { seat } = useSeats();
  const people = v.order.map((pid) => seat(pid)).filter((s): s is NonNullable<typeof s> => !!s);
  return (
    <>
      <div className="tvlc-top">
        <h1 className="tvlc-head">
          <Bi t={t("主人在手机上定规则、发牌", "The host sets the rules")} />
        </h1>
        <p className="tvlc-line">
          <span className="tvlc-rule">{v.stack ? tx("叠加：开，+2 接 +2，+4 接 +4", "Stacking on: +2 on +2, +4 on +4") : tx("叠加：关", "Stacking off")}</span>
          <span className="tvlc-rule">{v.target ? tx(`先赢 ${v.target} 轮的赢整场`, `First to ${v.target} ${v.target === 1 ? "round" : "rounds"} wins`) : tx("不限轮数", "No round limit")}</span>
        </p>
      </div>
      <div className="tvlc-fan" aria-hidden="true">
        <CardArt id={cardOf("r", "7")} />
        <CardArt id={cardOf("y", "skip")} />
        <CardArt id={cardOf(null, "wild")} />
        <CardArt id={cardOf("g", "rev")} />
        <CardArt id={cardOf("b", "d2")} />
      </div>
      <TvLineup people={people.map((s) => ({ seat: s }))} big={176} className="tvlc-lineup" />
    </>
  );
}

/* ------------------------------------------------------------------ the table */

function Table({ v, sound }: { v: LastCardView; sound: boolean }) {
  const { zh, tx, tr } = useLang();
  const { name } = useSeats();
  const lastPlay = [...v.log].reverse().find((e) => e.k === "play");
  const n = v.order.length;
  const at = v.turn ? v.order.indexOf(v.turn) : -1;
  const next = at >= 0 && n ? v.order[(((at + v.dir) % n) + n) % n] : null;
  const Arrow = v.dir === 1 ? ArrowRight : ArrowLeft;
  return (
    <div className="tvlc-table">
      <div className="tvlc-pile">
        <span className="tvlc-pile-stack" aria-hidden="true">
          <CardArt back />
          <CardArt back />
          <CardArt back />
        </span>
        <span className="tvlc-pile-n tabular">{tx(`剩 ${v.pile} 张`, `${v.pile} to draw`)}</span>
      </div>
      <div className="tvlc-discard" role="img" aria-label={v.top !== null ? tr(cardName(v.top)) : ""}>
        <span className="tvlc-under" aria-hidden="true" />
        {v.top !== null && (
          <span className="tvlc-faceup" key={lastPlay?.i ?? "deal"} data-card={v.top}>
            <CardArt id={v.top} pick={isWild(v.top) ? v.color : null} />
          </span>
        )}
        {v.pending > 0 && <span className="tvlc-pending tabular">+{v.pending}</span>}
        <Flash v={v} sound={sound} />
      </div>
      <div className="tvlc-info">
        {v.color && (
          <p className={`tvlc-colour is-${v.color}`} key={v.color}>
            <Mark c={v.color} ink />
            <span>
              <small>{tx("现在是", "Colour")}</small>
              <b>{zh ? `${COLOR_NAME[v.color].zh}色` : COLOR_NAME[v.color].en}</b>
            </span>
          </p>
        )}
        {v.turn && (
          <p className="tvlc-turn">
            <small>{tx("轮到", "Up now")}</small>
            <b>{name(v.turn)}</b>
          </p>
        )}
        {next && (
          <p className="tvlc-next">
            <small>{tx("下一位", "Next")}</small>
            <b>
              <Arrow aria-hidden="true" />
              {name(next)}
            </b>
          </p>
        )}
        {v.pending > 0 && <p className="tvlc-stack">{tx(`${name(v.turn)} 接一张 ${v.pendingKind === "d4" ? "+4" : "+2"}，或者摸 ${v.pending} 张`, `${name(v.turn)}: stack a ${v.pendingKind === "d4" ? "+4" : "+2"} or take ${v.pending}`)}</p>}
      </div>
    </div>
  );
}

/** The big word a skip, a reverse, a +2, a call or a catch flashes over the pile, once. */
function Flash({ v, sound }: { v: LastCardView; sound: boolean }) {
  const { tr } = useLang();
  const last = v.log[v.log.length - 1];
  const from = useRef(last?.i ?? 0);
  const heard = useRef(from.current);
  const i = last?.i ?? 0;
  useEffect(() => {
    if (!last || i <= heard.current) return;
    heard.current = i;
    if (!sound) return;
    if (last.k === "skip") sfx.woodblock(1.3, 0.8);
    else if (last.k === "rev") sfx.whoosh(0.35, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  const word = last && last.i > from.current ? momentWord(last) : null;
  if (!word || !last) return null;
  return (
    <span className={`tvlc-flash is-${word.tone}`} key={last.i} aria-hidden="true">
      {tr(word.word)}
    </span>
  );
}

/* ------------------------------------------------------------------ what just happened */

function Log({ v }: { v: LastCardView }) {
  const { tx, tr } = useLang();
  const { name } = useSeats();
  const who: Who = (pid) => ({ name: name(pid), you: false });
  const lines = v.log.slice(-6).reverse();
  return (
    <section className="tvlc-log" aria-label={tx("刚才", "Just now")}>
      <h2>{tx("刚才", "Just now")}</h2>
      <ol>
        {lines.map((e, k) => (
          <li key={e.i} className={k === 0 ? "is-new" : ""}>
            {tr(logLine(e, who))}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ everyone, in turn order */

function Seats({ v }: { v: LastCardView }) {
  const { tx, tr } = useLang();
  const { seat } = useSeats();
  const Dir = v.dir === 1 ? ChevronRight : ChevronLeft;
  const many = v.order.length > 7;
  return (
    <ol className={`tvlc-seats ${many ? "is-many" : ""}`} aria-label={tx("出牌顺序", "Turn order")}>
      {v.order.map((pid, i) => {
        const s = seat(pid);
        const count = v.counts[pid] ?? 0;
        const turn = v.phase === "play" && v.turn === pid;
        return (
          <Fragment key={pid}>
            {i > 0 && (
              <li className="tvlc-dir" aria-hidden="true">
                <Dir />
              </li>
            )}
            <li className={`tvlc-seat ${turn ? "is-turn" : ""} ${s && !s.on ? "is-away" : ""} ${v.winner === pid ? "is-winner" : ""} ${v.most.includes(pid) ? "is-most" : ""}`}>
              {v.called.includes(pid) && count <= 2 && v.phase === "play" && <span className="tvlc-flag is-called">{tr(LC_CALL)}</span>}
              {v.open === pid && <span className="tvlc-flag is-open">{tx("没喊！", "No call!")}</span>}
              <span className="tvlc-face">
                <SeatFace seat={s} size={84} />
                <span className="tvlc-count tabular" aria-label={tx(`${count} 张牌`, `${count} cards`)}>
                  {count}
                </span>
                {(v.wins[pid] ?? 0) > 0 && (
                  <span className="tvlc-wins tabular" aria-label={tx(`赢了 ${v.wins[pid]} 轮`, `${v.wins[pid]} won`)}>
                    <Crown aria-hidden="true" />
                    {v.wins[pid]}
                  </span>
                )}
              </span>
              <span className="tvlc-plate">{s?.name ?? "?"}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ a round's end, the match's end */

function RoundEnd({ v }: { v: LastCardView }) {
  const { tx } = useLang();
  const { seat, name } = useSeats();
  const s = seat(v.winner);
  return (
    <div className="tvlc-result">
      <div className="tvlc-winner">
        <div className="tvlc-winner-fig">
          <Crown className="tvlc-crown" size={110} strokeWidth={1.8} aria-hidden="true" />
          {s && <TvPerson p={{ seat: s, state: "win" }} />}
        </div>
        <div className="tvlc-winner-words">
          <p className="tvlc-winner-name">
            {name(v.winner)} <span>{tx("出完了！", "is out!")}</span>
          </p>
          <p className="tvlc-line">{tx(`赢下第 ${v.round} 轮`, `and takes round ${v.round}`)}</p>
        </div>
      </div>
      <div className="tvlc-left">
        <h2>{tx("手里还剩", "Cards left")}</h2>
        <ol>
          {v.order
            .filter((p) => p !== v.winner)
            .sort((a, b) => (v.counts[b] ?? 0) - (v.counts[a] ?? 0))
            .map((p) => (
              <li key={p} className={v.most.includes(p) ? "is-most" : ""}>
                <SeatFace seat={seat(p)} size={52} />
                <span className="tvlc-left-name">{name(p)}</span>
                <b className="tabular">{v.counts[p] ?? 0}</b>
              </li>
            ))}
        </ol>
        {v.most.length > 0 && <p className="tvlc-most">{tx(`剩得最多：${v.most.map(name).join("、")}`, `Most left: ${v.most.map(name).join(", ")}`)}</p>}
      </div>
    </div>
  );
}

function MatchEnd({ v, sound }: { v: LastCardView; sound: boolean }) {
  const { tx } = useLang();
  const { seat, name } = useSeats();
  const rows = v.order.map((p) => ({ seat: seat(p), score: v.wins[p] ?? 0 })).filter((r): r is { seat: NonNullable<typeof r.seat>; score: number } => !!r.seat);
  return (
    <>
      <div className="tvlc-top">
        <p className="tvlc-winner-name">{tx(`${name(v.champ)} 赢下整场！`, `${name(v.champ)} wins the match!`)}</p>
      </div>
      <TvPodium rows={rows} unit={tx("轮", "won")} sound={sound} className="tvlc-podium" />
    </>
  );
}
