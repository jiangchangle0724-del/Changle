import { useState } from "react";
import { Users, WifiOff } from "lucide-react";
import type { Lang } from "../../i18n";
import { EmptyState } from "../EmptyState";
export function EmptyStatePreview({ lang }: { lang: Lang }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="ui-preview-section">
      <EmptyState
        title={lang === "zh" ? "这里还没有内容" : "Nothing here yet"}
      />
      <EmptyState
        icon={Users}
        title={lang === "zh" ? "今晚谁来玩？" : "Who’s joining tonight?"}
        body={
          lang === "zh"
            ? "先加上你的朋友。\n每个人选好名字。\n把手机传给下一个人。\n准备好就一起开始。"
            : "Add everyone at tonight’s table, choose your names, and pass the phone around so everyone can join the next adventure."
        }
        action={{
          label: lang === "zh" ? "加上今晚的人" : "Add tonight’s players",
          onClick: () => setClicked(true),
        }}
      />
      <EmptyState
        tone="error"
        icon={WifiOff}
        title={lang === "zh" ? "暂时连不上" : "We couldn’t connect"}
        body={
          lang === "zh"
            ? "检查网络后再试一次。"
            : "Check your connection and try again."
        }
        action={{
          label: lang === "zh" ? "重试" : "Try again",
          onClick: () => setClicked(true),
        }}
      />
      <EmptyState
        tone="error"
        title={lang === "zh" ? "内容暂不可用" : "Temporarily unavailable"}
      />
      <output>{clicked ? "✓" : ""}</output>
    </div>
  );
}
