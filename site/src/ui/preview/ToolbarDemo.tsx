import { useState, type CSSProperties } from "react";
import type { Lang } from "../../i18n";
import { ToolbarDemo } from "../ToolbarDemo";
import type { ToolbarDemoKind } from "../types";

const KINDS: ToolbarDemoKind[] = ["safari18", "safari26", "safari27", "android", "wechat", "wechat-android"];

function One({ lang, kind }: { lang: Lang; kind: ToolbarDemoKind }) {
  const [step, setStep] = useState(-1);
  return (
    <section className="ui-preview-section">
      <h2>
        {kind} · {lang === "zh" ? "第" : "step"} {step + 1}
      </h2>
      {/* the size it has beside the steps, in a game's light */}
      <div style={{ maxWidth: "calc(var(--page-max) / 2)", "--gel": "var(--gel-pink)" } as CSSProperties}>
        <ToolbarDemo lang={lang} kind={kind} onStep={setStep} />
      </div>
    </section>
  );
}

export function ToolbarDemoPreview({ lang }: { lang: Lang }) {
  return (
    <div className="ui-preview-section">
      {KINDS.map((kind) => (
        <One key={kind} lang={lang} kind={kind} />
      ))}
    </div>
  );
}
