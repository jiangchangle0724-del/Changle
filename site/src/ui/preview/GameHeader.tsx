import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
import { GameHeader } from "../GameHeader";
export function GameHeaderPreview({ lang }: { lang: Lang }) {
  const [sound, setSound] = useState(true);
  const [clicked, setClicked] = useState(0);
  const action = () => setClicked((n) => n + 1);
  const title = { zh: "真心话大冒险", en: "Truth or Dare" };
  return (
    <div className="ui-preview-section">
      <GameHeader title={title} lang={lang} onBack={action} />
      <GameHeader
        title={title}
        lang={lang}
        onBack={action}
        status={{ kind: "round", current: 3, total: 10 }}
        sound={{ on: sound, onToggle: () => setSound(!sound) }}
        onTv={action}
        onHelp={action}
        extra={
          <Button
            tone="icon"
            icon={MoreHorizontal}
            label={lang === "zh" ? "其他操作" : "Extra action"}
            onClick={action}
          />
        }
      />
      <GameHeader
        title={{
          zh: "这是今晚名字特别特别长的一款游戏",
          en: "Never Have I Ever Played Such an Exceptionally Long Named Party Game",
        }}
        lang={lang}
        onBack={action}
        status={{ kind: "timer", secondsLeft: 9 }}
        sound={{ on: false, onToggle: action }}
        onTv={action}
        onHelp={action}
      />
      <GameHeader
        title={title}
        lang={lang}
        onBack={action}
        status={{ kind: "timer", secondsLeft: 30, urgentAt: 5 }}
      />
      <GameHeader
        title={title}
        lang={lang}
        onBack={action}
        status={{ kind: "round", current: 2 }}
      />
      <output className="ui-preview-output">{clicked}</output>
    </div>
  );
}
