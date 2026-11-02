import type { Lang } from "../../i18n";
import { Skeleton } from "../Skeleton";
export function SkeletonPreview({ lang }: { lang: Lang }) {
  return (
    <div className="ui-preview-section">
      {(["line", "block", "circle", "tile"] as const).map((shape) => (
        <section key={shape} className="ui-preview-section">
          <h2>{shape}</h2>
          <Skeleton lang={lang} shape={shape} />
        </section>
      ))}
      <Skeleton lang={lang} lines={4} width="90%" />
      <Skeleton lang={lang} shape="block" width={240} height={88} />
      <Skeleton
        lang={lang}
        lines={3}
        slowAfter={400}
        slowText={
          lang === "zh"
            ? "还在加载，网有点慢。请稍等片刻。"
            : "Still loading. The connection is a little slow; please wait a moment."
        }
      />
    </div>
  );
}
