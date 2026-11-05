import { usePenaltyText, useStore } from "../store";
import { Button } from "../ui/Button";
import { RosterChip } from "../ui/RosterChip";
import { Sheet } from "../ui/Sheet";

/**
 * The end of a game (UI plan: 结束页): what ‹ or the phone's back opens once a game is under way.
 * This game so far (who paid the most, everyone's count from the stamps), then: keep playing (an
 * accidental back loses nothing), the same game from the start, or another game.
 */
export function GameTally({
  open,
  dots,
  gel,
  onKeep,
  onAgain,
  onLeave,
}: {
  open: boolean;
  /** penalties so far by name, as the shell counted them from the stamps */
  dots: Record<string, number>;
  /** the game's own light, for the main button */
  gel?: string;
  onKeep: () => void;
  /** absent where the game can't be started over (a component preview) */
  onAgain?: () => void;
  onLeave: () => void;
}) {
  const { lang, players } = useStore();
  const penalty = usePenaltyText();
  const zh = lang === "zh";
  const rows = players.map((p) => ({ p, n: dots[p.name] ?? 0 })).sort((a, b) => b.n - a.n);
  const top = rows[0]?.n ?? 0;
  const leaders = top > 0 ? rows.filter((r) => r.n === top).map((r) => r.p.name) : [];
  const who = leaders.join(zh ? "、" : ", ");
  const headline = !leaders.length
    ? zh
      ? "还没有人受罚。"
      : "Nobody has paid up yet."
    : penalty.isCustom
      ? zh
        ? `罚得最多：${who}`
        : `Most penalties: ${who}`
      : zh
        ? `喝得最多：${who}`
        : `Drank the most: ${who}`;

  return (
    <Sheet
      open={open}
      onClose={onKeep}
      lang={lang}
      gel={gel}
      title={zh ? "这局小结" : "This game so far"}
      footer={
        <div className="game-tally-actions">
          <Button tone="quiet" onClick={onLeave}>
            {zh ? "换个游戏" : "Another game"}
          </Button>
          {onAgain && (
            <Button tone="quiet" onClick={onAgain}>
              {zh ? "再来一局" : "Start over"}
            </Button>
          )}
          <Button tone="primary" block onClick={onKeep}>
            {zh ? "继续这局" : "Keep playing"}
          </Button>
        </div>
      }
    >
      <p className="game-tally-headline">{headline}</p>
      {rows.length > 0 && (
        <ul className="game-tally-list" aria-label={zh ? "每人受罚次数" : "Penalties each"}>
          {rows.map(({ p, n }) => (
            <li key={p.id}>
              <RosterChip name={p.name} lang={lang} size="md" state={leaders.includes(p.name) ? "turn" : "idle"} />
              <span className="game-tally-count tabular">{zh ? `${n} 次` : `×${n}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
