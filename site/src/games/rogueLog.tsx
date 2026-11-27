/**
 * 流氓十三张's 牌谱 (Steve, 11-26, after the open-source Kings Cup apps that count the cards): a
 * sheet off the pile with what is still in the deck, rank by rank (剩牌), and the cards turned
 * so far, newest first, each with who drew it and who it landed on. The one phone keeps its own
 * log (games/Rogue13.tsx); online it is the room's (shared/engine/games/rogue.ts).
 *
 * When the deck has run out the same sheet opens by itself as the deck's recap (结算页): who paid
 * the most this deck, everyone's count (the powers' penalties included), then the whole log, and
 * the button that deals the next deck for whoever may.
 */
import type { ReactNode } from "react";
import { RANKS, RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Rank, type Suit } from "../data/rogue13";
import { GAME_BY_ID } from "./registry";
import { usePenaltyText, useStore } from "../store";
import { Button } from "../ui/Button";
import { RosterChip } from "../ui/RosterChip";
import { Sheet } from "../ui/Sheet";

/** One card of the deck as it was played: who drew it (a name, or a seat online), who its own penalty landed on. */
export type LogLine = { rank: Rank; suit: Suit; by: string; hit: string[] };

/** The 剩牌 of a deck: how many of each rank are still in it, in RANKS order. */
export function stockOf(ranks: Iterable<Rank>) {
  const n = RANKS.map(() => 0);
  for (const r of ranks) n[RANKS.indexOf(r)] += 1;
  return n;
}

/** One player's count for the deck's recap. */
export type RecapRow = { name: string; n: number };

export function RogueLog({
  open,
  onClose,
  stock,
  log,
  nameOf = (s) => s,
  recap = null,
  onShuffle,
  recapExtra,
}: {
  open: boolean;
  onClose: () => void;
  /** in RANKS order; empty when the table doesn't say (an older room) */
  stock: number[];
  /** oldest first, as the table keeps it */
  log: LogLine[];
  /** online: the seat's name; the one phone's lines already carry names */
  nameOf?: (id: string) => string;
  /** the deck has run out: everyone's penalties this deck, for the recap on top (null mid-deck) */
  recap?: RecapRow[] | null;
  /** the deck has run out and this phone may deal the next: the footer's button does */
  onShuffle?: () => void;
  /** a line under the recap (the shake-to-shuffle hint) */
  recapExtra?: ReactNode;
}) {
  const { lang, tr } = useStore();
  const zh = lang === "zh";
  const custom = usePenaltyText().isCustom;
  const left = stock.reduce((a, b) => a + b, 0);
  const took = zh ? (custom ? "受罚" : "喝了") : custom ? "took it" : "drank";
  const and = zh ? "、" : ", ";
  const gel = GAME_BY_ID.rogue.gel;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      gel={gel}
      title={recap ? (zh ? "这副牌打完了" : "That's the deck") : zh ? "牌谱" : "Card log"}
      footer={
        recap ? (
          <div className="rg-recap-actions">
            <Button tone="quiet" onClick={onClose}>
              {zh ? "知道了" : "Got it"}
            </Button>
            {onShuffle && (
              <Button
                tone="primary"
                block
                onClick={() => {
                  onClose();
                  onShuffle();
                }}
              >
                {zh ? "洗牌，下一副" : "Shuffle, next deck"}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {recap && <Recap rows={recap} zh={zh} custom={custom} lang={lang} and={and} extra={recapExtra} />}
      {stock.length > 0 && !recap && (
        <section className="rg-log-section" aria-labelledby="rg-stock-h">
          <h3 id="rg-stock-h" className="rg-log-h">
            {zh ? `牌堆里还剩 ${left} 张` : `${left} still in the deck`}
          </h3>
          <ul className="rg-stock" aria-label={zh ? "每种牌还剩几张" : "Left of each rank"}>
            {RANKS.map((rank, i) => {
              const n = stock[i] ?? 0;
              return (
                <li key={rank} className={`rg-stock-cell ${n === 0 ? "is-out" : ""}`} aria-label={zh ? `${rank} 还剩 ${n} 张` : `${rank}: ${n} left`}>
                  <span className="rg-stock-rank en-display" aria-hidden="true">
                    {rank}
                  </span>
                  <span className="rg-stock-n tabular" aria-hidden="true">
                    {n}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="rg-log-section" aria-labelledby="rg-played-h">
        <h3 id="rg-played-h" className="rg-log-h">
          {zh ? `翻过的牌 · ${log.length} 张` : `Played · ${log.length}`}
        </h3>
        {log.length === 0 ? (
          <p className="rg-log-empty">{zh ? "这副牌还没翻过一张" : "Nothing turned from this deck yet"}</p>
        ) : (
          <ol className="rg-log-list" reversed>
            {[...log].reverse().map((line, k) => {
              const words = ruleWords(RULE_BY_RANK[line.rank], custom);
              const who = line.hit.map(nameOf).join(and);
              return (
                <li key={`${log.length - k}-${line.rank}${line.suit}`} className="rg-log-row">
                  <span className={`rg-log-card ${SUIT_RED[line.suit] ? "is-red" : ""}`} role="img" aria-label={`${line.rank}${SUIT_GLYPH[line.suit]}`}>
                    <span className="en-display">{line.rank}</span>
                    <span>{SUIT_GLYPH[line.suit]}</span>
                  </span>
                  <span className="rg-log-text">
                    <span className="rg-log-title">{tr(words.title)}</span>
                    <span className="rg-log-who">
                      {zh ? `${nameOf(line.by)} 抽的` : `${nameOf(line.by)} drew it`}
                      {who && <> · <strong>{who}</strong> {took}</>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Sheet>
  );
}

/** The deck's recap: who paid the most, who never did, everyone's count. */
function Recap({ rows, zh, custom, lang, and, extra }: { rows: RecapRow[]; zh: boolean; custom: boolean; lang: "zh" | "en"; and: string; extra?: ReactNode }) {
  const sorted = [...rows].sort((a, b) => b.n - a.n);
  const top = sorted[0]?.n ?? 0;
  const leaders = top > 0 ? sorted.filter((r) => r.n === top).map((r) => r.name) : [];
  const clean = top > 0 ? sorted.filter((r) => r.n === 0).map((r) => r.name) : [];
  const total = rows.reduce((a, r) => a + r.n, 0);
  const headline = !leaders.length
    ? zh
      ? "这副牌没人受罚。"
      : "Nobody paid up this deck."
    : zh
      ? `${custom ? "罚得最多" : "喝得最多"}：${leaders.join(and)}`
      : `${custom ? "Most penalties" : "Drank the most"}: ${leaders.join(and)}`;
  return (
    <section className="rg-log-section rg-recap" aria-labelledby="rg-recap-h">
      <h3 id="rg-recap-h" className="rg-recap-headline">
        {headline}
      </h3>
      <p className="rg-recap-sub">
        {zh ? `${rows.length} 个人，${total} 次` : `${rows.length} players, ${total} times`}
        {clean.length > 0 && (zh ? ` · 一次没中：${clean.join(and)}` : ` · never hit: ${clean.join(and)}`)}
      </p>
      <ul className="rg-recap-list" aria-label={zh ? "每人这副牌受罚次数" : "Penalties each, this deck"}>
        {sorted.map((r) => (
          <li key={r.name}>
            <RosterChip name={r.name} lang={lang} size="md" state={leaders.includes(r.name) ? "turn" : "idle"} />
            <span className="rg-recap-count tabular">{zh ? `${r.n} 次` : `×${r.n}`}</span>
          </li>
        ))}
      </ul>
      {extra}
    </section>
  );
}
