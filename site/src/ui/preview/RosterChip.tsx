import { useState } from "react";
import { Smile } from "lucide-react";
import type { Lang } from "../../i18n";
import { RosterChip } from "../RosterChip";
export function RosterChipPreview({ lang }: { lang: Lang }) {
  const [message, setMessage] = useState("");
  return (
    <div className="ui-preview-section">
      {(["sm", "md", "lg"] as const).map((size) => (
        <section key={size} className="ui-preview-section">
          <h2>{size}</h2>
          <div className="ui-preview-row">
            <RosterChip name="Steve" lang={lang} size={size} />
            <RosterChip
              name={lang === "zh" ? "小明" : "Alexandra"}
              lang={lang}
              size={size}
              state="turn"
              face={<Smile />}
              host
              me
              drinks={3}
              onClick={() => setMessage("✓")}
            />
            <RosterChip
              name="Ann"
              lang={lang}
              size={size}
              state="out"
              drinks={5}
              onRemove={() =>
                setMessage(lang === "zh" ? "已移除 Ann" : "Removed Ann")
              }
            />
            <RosterChip
              name="Ben"
              lang={lang}
              size={size}
              presence="away"
              drinks={8}
            />
            <RosterChip
              name={
                lang === "zh"
                  ? "今晚名字特别特别长的朋友"
                  : "A friend with an exceptionally long name"
              }
              lang={lang}
              size={size}
              presence="gone"
              onClick={() => setMessage("✓")}
              onRemove={() => setMessage("✓")}
            />
          </div>
        </section>
      ))}
      <output className="ui-preview-output">{message}</output>
    </div>
  );
}
