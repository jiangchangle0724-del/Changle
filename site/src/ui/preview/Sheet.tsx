import { useState } from "react";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
import { Sheet } from "../Sheet";
import type { Category } from "../types";
export function SheetPreview({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | undefined>();
  const [mode, setMode] = useState("long");
  const paragraph =
    lang === "zh"
      ? "先把今晚的人加进来。\n每个人都能选自己的名字。\n准备好了再一起开始。\n如果网络慢，可以稍等再重试。"
      : "Add everyone at tonight’s table. Choose your name, take a moment to settle in, and start together when everyone is ready. If the connection is slow, wait a moment and try again.";
  return (
    <div className="ui-preview-section">
      <Button
        onClick={() => {
          setMode("long");
          setCategory(undefined);
          setOpen(true);
        }}
      >
        {lang === "zh" ? "打开长内容弹层" : "Open long sheet"}
      </Button>
      <div className="ui-preview-row">
        {(["drink", "brain", "body", "online", "tool"] as const).map((c) => (
          <Button
            key={c}
            tone="quiet"
            onClick={() => {
              setMode("category");
              setCategory(c);
              setOpen(true);
            }}
          >
            {c}
          </Button>
        ))}
      </div>
      <Button
        tone="quiet"
        onClick={() => {
          setMode("label");
          setCategory(undefined);
          setOpen(true);
        }}
      >
        {lang === "zh" ? "无标题 / 无底栏" : "Label only / no footer"}
      </Button>
      <Button
        tone="quiet"
        onClick={() => {
          setMode("gel");
          setCategory(undefined);
          setOpen(true);
        }}
      >
        {lang === "zh" ? "自定义灯光" : "Custom gel"}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        lang={lang}
        {...(mode === "label"
          ? { label: lang === "zh" ? "今晚的设置" : "Tonight’s settings" }
          : {
              title:
                lang === "zh"
                  ? "今晚一起玩这个游戏"
                  : "A very long title for everyone at tonight’s table",
            })}
        category={category}
        gel={mode === "gel" ? "var(--type-online)" : undefined}
        footer={
          mode === "label" ? undefined : (
            <Button block onClick={() => setOpen(false)}>
              {lang === "zh" ? "玩这个" : "Play this"}
            </Button>
          )
        }
      >
        <div className="ui-preview-stack">
          {Array.from({ length: mode === "long" ? 12 : 1 }, (_, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
