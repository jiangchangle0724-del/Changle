import { ChevronLeft, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import type { T } from "../i18n";
import { useStore } from "../store";

export function LangTab() {
  const { lang, setLang } = useStore();
  return (
    <div className="lang-tab" role="group" aria-label="中文 / English">
      <button aria-pressed={lang === "zh"} onClick={() => setLang("zh")} lang="zh-CN">
        中
      </button>
      <button aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
        EN
      </button>
    </div>
  );
}

/** Bilingual title: the current language leads, the other follows, both in their display face. */
export function BiTitle({ name, size = "md", align = "center" }: { name: T; size?: "sm" | "md" | "lg"; align?: "left" | "center" }) {
  const { lang } = useStore();
  const zh = (
    <span className="zh-display bi-zh" lang="zh-CN">
      {name.zh}
    </span>
  );
  const en = (
    <span className="en-display bi-en" lang="en">
      {name.en}
    </span>
  );
  return (
    <span className={`bi-title bi-${size} bi-${align} ${lang === "zh" ? "lead-zh" : "lead-en"}`}>
      {lang === "zh" ? zh : en}
      {lang === "zh" ? en : zh}
    </span>
  );
}

export function TopBar({
  title,
  onBack,
  onHelp,
  right,
}: {
  title?: T;
  onBack?: () => void;
  onHelp?: () => void;
  right?: ReactNode;
}) {
  const { ui } = useStore();
  return (
    <header className="topbar">
      <div className="topbar-side">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label={ui("back")}>
            <ChevronLeft size={22} />
          </button>
        )}
      </div>
      <div className="topbar-title">{title && <BiTitle name={title} size="sm" />}</div>
      <div className="topbar-side topbar-right">
        {right}
        {onHelp && (
          <button className="icon-btn" onClick={onHelp} aria-label={ui("rules")}>
            <CircleHelp size={21} />
          </button>
        )}
      </div>
    </header>
  );
}
