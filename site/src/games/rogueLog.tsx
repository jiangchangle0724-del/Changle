/**
 * 流氓十三张's 牌谱 (Steve, 11-26, after the open-source Kings Cup apps that count the cards): a
 * sheet off the pile with what is still in the deck, rank by rank (剩牌), and the cards turned
 * so far, newest first, each with who drew it and who it landed on. The one phone keeps its own
 * log (games/Rogue13.tsx); online it is the room's (shared/engine/games/rogue.ts).
 */
import { RANKS, RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Rank, type Suit } from "../data/rogue13";
import { GAME_BY_ID } from "./registry";
import { usePenaltyText, useStore } from "../store";
import { Sheet } from "../ui/Sheet";

/** One card of the deck as it was played: who drew it (a name, or a seat online), who its own penalty landed on. */
export type LogLine = { rank: Rank; suit: Suit; by: string; hit: string[] };

/** The 剩牌 of a deck: how many of each rank are still in it, in RANKS order. */
export function stockOf(ranks: Iterable<Rank>) {
  const n = RANKS.map(() => 0);
  for (const r of ranks) n[RANKS.indexOf(r)] += 1;
  return n;
}

export function RogueLog({
  open,
  onClose,
  stock,
  log,
  nameOf = (s) => s,
}: {
  open: boolean;
  onClose: () => void;
  /** in RANKS order; empty when the table doesn't say (an older room) */
  stock: number[];
  /** oldest first, as the table keeps it */
  log: LogLine[];
  /** online: the seat's name; the one phone's lines already carry names */
  nameOf?: (id: string) => string;
}) {
  const { lang, tr } = useStore();
  const zh = lang === "zh";
  const custom = usePenaltyText().isCustom;
  const left = stock.reduce((a, b) => a + b, 0);
  const took = zh ? (custom ? "受罚" : "喝了") : custom ? "took it" : "drank";
  const and = zh ? "、" : ", ";
  return (
    <Sheet open={open} onClose={onClose} lang={lang} gel={GAME_BY_ID.rogue.gel} title={zh ? "牌谱" : "Card log"}>
      {stock.length > 0 && (
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
