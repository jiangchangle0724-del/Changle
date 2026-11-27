/**
 * 流氓十三张's rules sheet, which is also where the table changes how a rank plays (每张牌可换玩法,
 * Steve, 11-26, the last of the four ideas from the open-source Kings Cup apps). Every rank lists
 * the way it plays now; the ranks with other ways get a row of them under the words, and a tap
 * switches. On one phone anyone switches and the phone remembers for next time; online the host
 * switches for the whole table (the room keeps it), the others read.
 */
import { useEffect, useState } from "react";
import { HOUSE_KEY, RANKS, ruleFor, ruleWords, VARIANTS, type House, type Rank, type Rule } from "../data/rogue13";
import type { T } from "../i18n";
import { usePenaltyText, useStore } from "../store";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";

const EMPTY: House = {};

/** The house rules one phone keeps between games. */
export function useHouseStorage(): [House, (h: House | ((h: House) => House)) => void] {
  const [house, setHouse] = useState<House>(() => {
    try {
      const raw = localStorage.getItem(HOUSE_KEY);
      const h = raw ? (JSON.parse(raw) as House) : EMPTY;
      // only choices that still exist
      return Object.fromEntries(Object.entries(h).filter(([rank, id]) => (RANKS as string[]).includes(rank) && VARIANTS[rank as Rank].some((r) => r.id === id))) as House;
    } catch {
      return EMPTY;
    }
  });
  useEffect(() => {
    try {
      if (Object.keys(house).length) localStorage.setItem(HOUSE_KEY, JSON.stringify(house));
      else localStorage.removeItem(HOUSE_KEY);
    } catch {
      /* a phone that keeps nothing still plays */
    }
  }, [house]);
  return [house, setHouse];
}

export function RogueRules({
  house,
  onPick,
  locked = null,
  how,
}: {
  house: House;
  /** present: this phone may switch a rank's way (one phone: anyone; online: the host) */
  onPick?: (rank: Rank, id: string) => void;
  /** the rank of the card up while its round is on: its way waits until the card is done */
  locked?: Rank | null;
  /** how this screen plays the rule, if it has anything to add */
  how: (rule: Rule) => T | undefined;
}) {
  const { tr, lang } = useStore();
  const zh = lang === "zh";
  const custom = usePenaltyText().isCustom;
  const changed = RANKS.filter((rank) => ruleFor(rank, house).id !== VARIANTS[rank][0].id);
  return (
    <div className="rg-rules">
      <p className="rg-house-intro">
        {onPick
          ? zh
            ? "有别的玩法的牌，点一下就换。"
            : "A rank with other ways to play switches with a tap."
          : zh
            ? "主人可以给每张牌换玩法。"
            : "The host can change how each rank plays."}
        {onPick && changed.length > 0 && (
          <Button tone="quiet" size="sm" onClick={() => changed.forEach((rank) => onPick(rank, VARIANTS[rank][0].id))}>
            {zh ? "全部恢复经典" : "Back to classic"}
          </Button>
        )}
      </p>
      <ul className="rule-list">
        {RANKS.map((rank) => {
          const options = VARIANTS[rank];
          const rule = ruleFor(rank, house);
          const words = ruleWords(rule, custom);
          const h = how(rule);
          return (
            <li key={rank}>
              <span className="rule-rank en-display">{rank}</span>
              <span>
                <strong>{tr(words.title)}</strong>
                <br />
                {tr(words.rule)}
                {h && (
                  <>
                    <br />
                    <span style={{ color: "var(--lamp)" }}>{tr(h)}</span>
                  </>
                )}
                {onPick && options.length > 1 && (
                  <span className="rg-house-pick">
                    {locked === rank ? (
                      <span className="rg-house-locked">{zh ? "这张牌打完再换" : "Switch once this card is done"}</span>
                    ) : (
                      <Tabs
                        variant="segmented"
                        label={zh ? `${rank} 的玩法` : `How ${rank} plays`}
                        items={options.map((o) => ({ key: o.id, label: tr(ruleWords(o, custom).title) }))}
                        value={rule.id}
                        onChange={(id) => onPick(rank, id)}
                      />
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
