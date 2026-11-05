import { useState } from "react";
import { DECK_GROUPS, HEADS_DECKS, MIX_NAME, NOTES, type DeckGroup } from "../../data/postit";
import { Tabs } from "../../ui/Tabs";
import "./setup.css";

/** The online game's own deck: the mixed bag of people, animals and things (NOTES), first on the classics shelf. */
export const MIX = "mix";

/**
 * The decks, on three shelves: the classics, party decks (spicy, good times, funny moments) and
 * the world (what each culture is known for). `value` is a deck's id, or MIX when `mix` shows the
 * online game's mixed bag too.
 *
 * One phone: switching shelves picks that shelf's first deck, so what is lit up on screen is always
 * what will be played. `browse` (the online host's sheet): switching shelves only looks; a deck is
 * picked when it is tapped.
 */
export function DeckPicker({ value, onPick, zh, mix = false, browse = false }: { value: string; onPick: (id: string) => void; zh: boolean; mix?: boolean; browse?: boolean }) {
  const lang = zh ? "zh" : "en";
  const groupOf = (id: string): DeckGroup => HEADS_DECKS.find((d) => d.id === id)?.group ?? "classic";
  const [looking, setLooking] = useState<DeckGroup>(() => groupOf(value));
  const shown = browse ? looking : groupOf(value);
  const first = (g: DeckGroup) => (mix && g === "classic" ? MIX : HEADS_DECKS.find((d) => d.group === g)?.id);
  const cards = [
    ...(mix && shown === "classic" ? [{ id: MIX, name: MIX_NAME, words: NOTES.map((n) => n.t) }] : []),
    ...HEADS_DECKS.filter((d) => d.group === shown),
  ];
  return (
    <div className="deck-picker">
      <Tabs
        variant="segmented"
        label={zh ? "词库分类" : "Kinds of deck"}
        value={shown}
        onChange={(g) => {
          if (g === shown) return;
          if (browse) return setLooking(g);
          const id = first(g);
          if (id) onPick(id);
        }}
        // (no count on the shelves: on a 320px phone it pushed the names onto two lines)
        items={DECK_GROUPS.map((g) => ({ key: g.id, label: g.name[lang] }))}
      />
      <div className={`deck-grid is-${shown}`}>
        {cards.map((d) => (
          <button key={d.id} type="button" className={`deck-pick ${value === d.id ? "is-on" : ""}`} aria-pressed={value === d.id} onClick={() => onPick(d.id)}>
            <strong>{d.name[lang]}</strong>
            <small>{zh ? `${d.words.length} 个词` : `${d.words.length} words`}</small>
            <span className="deck-sample">{d.words.slice(0, 3).map((w) => w[lang]).join(zh ? "、" : ", ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

