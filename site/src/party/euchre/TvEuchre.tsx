import { Crown, User } from "lucide-react";
import { SeatFace } from "../../online/People";
import { trickWinner } from "../../shared/euchre";
import type { EBid, ESuit, EuchreView } from "../../shared/protocol";
import { RoundTag, TvShow, useLang, useSeats } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import { BotFace, Card, SUIT_GLYPH, suitName } from "./Board";
import "../../styles/party.css";
import "../../styles/tv-euchre.css";

/** where each seat sits round the table on the screen: 0 and 2 face each other, as do 1 and 3 */
const PLACE = ["south", "west", "north", "east"] as const;

/**
 * 尤克牌 on the big screen: the table from above, four seats in two teams, and only what's on the
 * table: the card turned up, the bids, trump and who made it, each trick as it's played, the
 * tricks and the score. Nobody's hand: each seat shows only how many cards it holds, face down.
 */
export default function TvEuchre({ v }: TvViewProps<EuchreView>) {
  const { zh, tx, tr } = useLang();
  const { seat } = useSeats();
  const who = (i: number) => {
    const s = v.seats[i];
    const st = s?.pid ? seat(s.pid) : undefined;
    return { name: st ? st.name : s?.bot ? tr(s.bot) : "?", seat: st, bot: !!s?.bot && !s?.pid };
  };
  const teamName = (t: 0 | 1) => `${who(t).name} & ${who(t + 2).name}`;
  const lastBid = (i: number): EBid | undefined => [...v.bids].reverse().find((b) => b.seat === i);
  const bidding = v.phase === "bid1" || v.phase === "bid2";
  const shownTrick = v.phase === "trick" && v.lastTrick ? v.lastTrick.plays : v.trick;
  const winSeat = v.phase === "trick" && v.lastTrick ? v.lastTrick.winner : v.trick.length === 4 && v.trump ? trickWinner(v.trick, v.trump) : null;
  const bidWord = (b: EBid) => (b.act === "pass" ? tx("过", "Pass") : `${b.suit ? SUIT_GLYPH[b.suit as ESuit] : ""} ${b.act === "order" ? tx("要了", "Ordered up") : tx("叫主", "Called")}${b.alone ? tx("，单干", ", alone") : ""}`);

  return (
    <TvShow game="euchre" className={`tveu is-${v.phase}`} phase={v.phase} round={<RoundTag>{v.handNo > 0 ? tx(`第 ${v.handNo} 手 · 先到 ${v.target} 分`, `Hand ${v.handNo} · first to ${v.target}`) : tx(`先到 ${v.target} 分`, `First to ${v.target}`)}</RoundTag>}>
      {/* the score, team by team */}
      <div className="tveu-score">
        {([0, 1] as const).map((t) => (
          <p key={t} className={`tveu-team is-t${t} ${v.winner === t ? "is-win" : ""}`}>
            <span className="tveu-team-name">{teamName(t)}</span>
            <b className="tabular">{v.score[t]}</b>
            {v.phase !== "setup" && v.phase !== "end" && <span className="tveu-tricks tabular">{tx(`这手 ${v.tricks[t]} 墩`, `${v.tricks[t]} tricks`)}</span>}
          </p>
        ))}
      </div>

      {v.trump && (
        <p className={`tveu-trump ${v.trump === "H" || v.trump === "D" ? "is-red" : ""}`}>
          <span className="tveu-trump-suit">{SUIT_GLYPH[v.trump]}</span>
          <span>
            <small>{tx("主牌", "Trump")}</small>
            <b className="tveu-trump-name">{suitName(v.trump, zh)}</b>
            {v.maker !== null && <small>{tx(`${who(v.maker).name} 叫的${v.alone ? "，单干" : ""}`, `called by ${who(v.maker).name}${v.alone ? ", alone" : ""}`)}</small>}
          </span>
        </p>
      )}

      <div className="tveu-table">
        <i className="tveu-felt" aria-hidden="true" />
        {PLACE.map((place, i) => {
          const w = who(i);
          // the bids while bidding; then, as on the phones, the maker keeps theirs up for the hand
          const b = bidding || (v.maker === i && (v.phase === "discard" || v.phase === "play" || v.phase === "trick")) ? lastBid(i) : undefined;
          const sitting = v.sitter === i;
          return (
            <div key={place} className={`tveu-seat is-${place} is-t${i % 2} ${v.turn === i && v.phase !== "hand" && v.phase !== "end" && v.phase !== "setup" ? "is-turn" : ""} ${sitting ? "is-out" : ""}`}>
              <span className="tveu-face">{w.seat ? <SeatFace seat={w.seat} size={72} /> : w.bot ? <BotFace size={72} /> : <User size={48} />}</span>
              <span className="tveu-name">
                {w.name}
                {v.dealer === i && <em className="tveu-dealer">{tx("庄", "D")}</em>}
              </span>
              {v.phase !== "setup" && v.phase !== "end" && (
                <span className="tveu-backs" aria-label={tx(`${v.counts[i] ?? 0} 张牌`, `${v.counts[i] ?? 0} cards`)}>
                  {Array.from({ length: v.counts[i] ?? 0 }, (_, k) => (
                    <Card key={k} back size="sm" />
                  ))}
                </span>
              )}
              {b && <span className={`tveu-bid ${b.act === "pass" ? "is-pass" : "is-bid"}`}>{bidWord(b)}</span>}
              {sitting && <span className="tveu-bid is-pass">{tx("这手坐着看", "Sits this hand out")}</span>}
            </div>
          );
        })}

        {/* the middle: the card turned up while bidding, then the trick */}
        <div className="tveu-middle">
          {bidding && v.upcard && (
            <span className={`tveu-up ${v.phase === "bid2" ? "is-down" : ""}`}>
              <Card card={v.upcard} />
            </span>
          )}
          {!bidding &&
            shownTrick.map((p) => (
              <span key={`${p.seat}-${p.card}`} className={`tveu-play is-${PLACE[p.seat]}`}>
                <Card card={p.card} trump={v.trump} state={winSeat === p.seat ? "win" : undefined} />
              </span>
            ))}
        </div>
      </div>

      {(v.phase === "hand" || v.phase === "end") && v.result && (
        <div className={`tveu-result is-t${v.phase === "end" && v.winner !== null ? v.winner : v.result.team} ${v.phase === "end" ? "is-end" : ""}`}>
          {v.phase === "end" && <Crown className="tveu-result-crown" size={110} strokeWidth={1.8} aria-hidden="true" />}
          {/* the team's names on a line of their own, what they did under them, large */}
          <p className="tveu-result-main">
            <span className="tveu-result-team">{teamName(v.phase === "end" && v.winner !== null ? v.winner : v.result.team)}</span>
            <span className="tveu-result-what">{v.phase === "end" && v.winner !== null ? tx("赢了！", "win!") : tx(`得 ${v.result.points} 分`, `+${v.result.points}`)}</span>
          </p>
          <p className="tveu-result-sub">
            {v.result.euchre ? tx("叫主的没拿够三墩：被尤克了", "The makers fell short: euchred") : v.result.march ? tx("五墩全拿", "All five tricks") : tx("叫主的拿到了", "The makers made it")}
            {v.result.alone ? tx("（单干）", " (alone)") : ""}
          </p>
        </div>
      )}
      {v.phase === "setup" && <p className="tveu-note">{tx("主人在手机上安排座位、发牌", "The host seats everyone and deals on their phone")}</p>}
      {v.phase === "discard" && <p className="tveu-note">{tx(`庄家 ${who(v.dealer).name} 换一张牌`, `${who(v.dealer).name}, the dealer, swaps a card`)}</p>}
    </TvShow>
  );
}
