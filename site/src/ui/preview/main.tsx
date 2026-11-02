import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/figtree/wght.css";
import "../base.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
import { ButtonPreview } from "./Button";
import { TilePreview } from "./Tile";
import { SheetPreview } from "./Sheet";
import { TabsPreview } from "./Tabs";
import { PillPreview } from "./Pill";
import { RosterChipPreview } from "./RosterChip";
import { OTPInputPreview } from "./OTPInput";
import { ToastPreview } from "./Toast";
import { EmptyStatePreview } from "./EmptyState";
import { SkeletonPreview } from "./Skeleton";
import { GameHeaderPreview } from "./GameHeader";
import { PenaltyCardPreview } from "./PenaltyCard";

const previews = {
  Button: ButtonPreview,
  Tile: TilePreview,
  Sheet: SheetPreview,
  Tabs: TabsPreview,
  Pill: PillPreview,
  RosterChip: RosterChipPreview,
  OTPInput: OTPInputPreview,
  Toast: ToastPreview,
  EmptyState: EmptyStatePreview,
  Skeleton: SkeletonPreview,
  GameHeader: GameHeaderPreview,
  PenaltyCard: PenaltyCardPreview,
};
function Gallery() {
  const [lang, setLang] = useState<Lang>("zh");
  const [hash, setHash] = useState(location.hash.slice(1));
  useEffect(() => {
    const change = () => setHash(location.hash.slice(1));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const single = Object.hasOwn(previews, hash);
  return (
    <main className="ui-preview">
      <nav
        className="ui-preview-nav"
        aria-label={lang === "zh" ? "组件预览" : "Component previews"}
      >
        <a href="#">{lang === "zh" ? "全部组件" : "All components"}</a>
        <Button
          tone="quiet"
          size="sm"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          {lang === "zh" ? "EN" : "中"}
        </Button>
      </nav>
      {Object.entries(previews)
        .filter(([name]) => !single || name === hash)
        .map(([name, Preview]) => (
          <section key={name} data-preview={name}>
            <h1 className="ui-preview-title">
              <a href={`#${name}`}>{name}</a>
            </h1>
            <Preview lang={lang} />
          </section>
        ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
