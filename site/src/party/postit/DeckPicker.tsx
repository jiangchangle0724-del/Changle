import { DECK_GROUPS, HEADS_DECKS, type HeadsDeck } from "../../data/postit";
import { Tabs } from "../../ui/Tabs";
import "./setup.css";

/**
 * The one-phone game's decks, on three shelves: the classics, party decks (spicy, good times, funny
 * moments) and the world (what each culture is known for). Switching shelves picks its first deck,
 * so what is lit up on screen is always what will be played.
 */
export function DeckPicker({ deck, onPick, zh }: { deck: HeadsDeck; onPick: (d: HeadsDeck) => void; zh: boolean }) {
  const lang = zh ? "zh" : "en";
  const shelf = HEADS_DECKS.filter((d) => d.group === deck.group);
  return (
    <div className="deck-picker">
      <Tabs
        variant="segmented"
        label={zh ? "词库分类" : "Kinds of deck"}
        value={deck.group}
        onChange={(g) => {
          if (g === deck.group) return;
          const first = HEADS_DECKS.find((d) => d.group === g);
          if (first) onPick(first);
        }}
        // (no count on the shelves: on a 320px phone it pushed the names onto two lines)
        items={DECK_GROUPS.map((g) => ({ key: g.id, label: g.name[lang] }))}
      />
      <div className={`deck-grid is-${deck.group}`}>
        {shelf.map((d) => (
          <button key={d.id} type="button" className={`deck-pick ${deck.id === d.id ? "is-on" : ""}`} aria-pressed={deck.id === d.id} onClick={() => onPick(d)}>
            <strong>{d.name[lang]}</strong>
            <small>{zh ? `${d.words.length} 个词` : `${d.words.length} words`}</small>
            <span className="deck-sample">{d.words.slice(0, 3).map((w) => w[lang]).join(zh ? "、" : ", ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
