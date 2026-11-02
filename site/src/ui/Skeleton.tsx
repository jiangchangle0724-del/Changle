import { useEffect, useState } from "react";
import { labels } from "./labels";
import type { SkeletonProps } from "./types";
import "./Skeleton.css";
export function Skeleton({
  lang,
  shape = "line",
  lines = 1,
  width,
  height,
  slowAfter = 2000,
  slowText,
}: SkeletonProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), slowAfter);
    return () => window.clearTimeout(timer);
  }, [slowAfter, slowText]);
  return (
    <div className="ui-skeleton-region">
      <div
        className={`ui-skeleton ui-skeleton-${shape}`}
        aria-busy="true"
        style={{ width }}
      >
        <span className="ui-visually-hidden">{labels.loading[lang]}</span>
        {Array.from(
          { length: shape === "line" ? Math.max(1, lines) : 1 },
          (_, i) => (
            <span
              aria-hidden="true"
              className="ui-skeleton-shape"
              key={i}
              style={{ height }}
            />
          ),
        )}
      </div>
      {slow && slowText && (
        <p className="ui-skeleton-slow" role="status">
          {slowText}
        </p>
      )}
    </div>
  );
}
