import { useStore } from "../store";
import { Skeleton } from "../ui/Skeleton";
import "./states.css";

/** The TV's own stage, seats and code panel while the table's first answer arrives. */
export function TvLoadingStage() {
  const { lang } = useStore();
  return <div className="tv-loading-stage" aria-busy="true">
    <span className="tv-wordmark">changle<span className="tv-wordmark-dot">.</span></span>
    <div className="tv-loading-panels">
      <Skeleton lang={lang} shape="block" height="calc(var(--tap) * 8)" slowText={lang === "zh" ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
      <Skeleton lang={lang} lines={4} height="var(--tap)" />
    </div>
    <a className="tv-btn" href="/">{lang === "zh" ? "返回" : "Back"}</a>
  </div>;
}
