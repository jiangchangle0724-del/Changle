import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Lang } from "../../i18n";
import { Pill } from "../Pill";
export function PillPreview({ lang }: { lang: Lang }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  return (
    <div className="ui-preview-section">
      {(
        [
          "neutral",
          "accent",
          "success",
          "warning",
          "danger",
          "drink",
          "brain",
          "body",
          "online",
          "tool",
        ] as const
      ).map((tone) => (
        <div className="ui-preview-row" key={tone}>
          <Pill tone={tone}>{tone}</Pill>
          <Pill tone={tone} icon={Sparkles}>
            {lang === "zh" ? "新" : "New"}
          </Pill>
          {[false, true].map((initial) => {
            const key = `${tone}-${initial}`;
            return (
              <Pill
                key={key}
                kind="toggle"
                tone={tone}
                icon={initial ? Sparkles : undefined}
                selected={selected[key] ?? initial}
                onToggle={(next) => setSelected({ ...selected, [key]: next })}
              >
                {lang === "zh" ? "筛选" : "Filter"}
              </Pill>
            );
          })}
        </div>
      ))}
      <Pill>
        {lang === "zh"
          ? "今晚所有人一起玩的超长游戏标签"
          : "A long tag for everyone joining tonight’s adventure"}
      </Pill>
    </div>
  );
}
