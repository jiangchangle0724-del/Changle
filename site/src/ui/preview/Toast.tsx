import { useEffect, useState } from "react";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
import { ToastProvider, useToast } from "../Toast";
function Examples({ lang }: { lang: Lang }) {
  const show = useToast();
  const [undone, setUndone] = useState(false);
  useEffect(() => {
    show(lang === "zh" ? "已保存今晚的设置" : "Tonight’s settings saved", {
      tone: "success",
      duration: 60000,
      action: {
        label: lang === "zh" ? "撤销" : "Undo",
        onClick: () => setUndone(true),
      },
    });
  }, [lang, show]);
  return (
    <div className="ui-preview-section">
      <p>
        {lang === "zh"
          ? "提示显示在顶部，每次只出现一条。"
          : "One toast at a time, below the top safe area."}
      </p>
      {(["neutral", "success", "warning", "danger"] as const).map((tone) => (
        <div className="ui-preview-row" key={tone}>
          <Button
            tone="quiet"
            onClick={() =>
              show(
                `${tone} · ${lang === "zh" ? "设置已更新" : "Settings updated"}`,
                { tone },
              )
            }
          >
            {tone}
          </Button>
          <Button
            tone="quiet"
            onClick={() =>
              show(
                lang === "zh"
                  ? "连接暂时断开，请重试以继续今晚的游戏。"
                  : "The connection was interrupted while saving everyone’s settings for tonight. Please try again.",
                {
                  tone,
                  action: {
                    label: lang === "zh" ? "重试" : "Retry",
                    onClick: () => setUndone(true),
                  },
                },
              )
            }
          >
            {tone} + {lang === "zh" ? "操作" : "action"}
          </Button>
        </div>
      ))}
      <output className="ui-preview-output">{undone ? "✓" : ""}</output>
    </div>
  );
}
export function ToastPreview({ lang }: { lang: Lang }) {
  return (
    <ToastProvider>
      <Examples lang={lang} />
    </ToastProvider>
  );
}
