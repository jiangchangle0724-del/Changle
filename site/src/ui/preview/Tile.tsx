import { useState } from "react";
import { Brain, Dumbbell, Globe, Utensils, Wine } from "lucide-react";
import type { Lang } from "../../i18n";
import { Tile } from "../Tile";
export function TilePreview({ lang }: { lang: Lang }) {
  const [opened, setOpened] = useState(0);
  const items = [
    {
      category: "drink",
      icon: Wine,
      name: { zh: "真心话大冒险", en: "Truth or Dare" },
    },
    {
      category: "brain",
      icon: Brain,
      name: { zh: "谁是卧底", en: "Undercover" },
    },
    {
      category: "body",
      icon: Dumbbell,
      name: { zh: "木头人蹦迪", en: "Freeze Dance" },
    },
    {
      category: "online",
      icon: Globe,
      name: { zh: "你画我猜", en: "Draw and Guess Together Around the World" },
    },
    {
      category: "tool",
      icon: Utensils,
      name: { zh: "随便吃什么", en: "Pick Dinner" },
    },
  ] as const;
  return (
    <div className="ui-preview-section">
      <div className="ui-preview-grid">
        {items.map((item, i) => (
          <Tile
            key={item.category}
            {...item}
            lang={lang}
            players={{ min: 2, max: 12 }}
            minutes={15}
            drinking={i === 0}
            isNew={i === 0}
            lit={i === 1}
            soon={i === 4}
            onOpen={() => setOpened(opened + 1)}
          />
        ))}
      </div>
      <Tile
        {...items[3]}
        lang={lang}
        size="hero"
        players={{ min: 2, max: 8 }}
        minutes={20}
        isNew
        lit
        onOpen={() => setOpened(opened + 1)}
      />
      <div className="ui-preview-grid">
        <Tile {...items[0]} lang={lang} onOpen={() => setOpened(opened + 1)} />
        <Tile
          {...items[1]}
          lang={lang}
          soon
          onOpen={() => setOpened(opened + 1)}
        />
      </div>
      <output className="ui-preview-output">{opened}</output>
    </div>
  );
}
