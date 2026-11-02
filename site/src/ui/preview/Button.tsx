import { useState } from "react";
import { ArrowRight, Volume2 } from "lucide-react";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
export function ButtonPreview({ lang }: { lang: Lang }) {
  const [count, setCount] = useState(0);
  const [pressed, setPressed] = useState(false);
  return (
    <div className="ui-preview-section">
      {(["primary", "quiet", "danger"] as const).map((tone) => (
        <section key={tone} className="ui-preview-section">
          <h2>{tone}</h2>
          {(["sm", "md", "lg"] as const).map((size) => (
            <div className="ui-preview-row" key={size}>
              <Button
                tone={tone}
                size={size}
                onClick={() => setCount(count + 1)}
              >
                {size} · {lang === "zh" ? "开始" : "Play"}
              </Button>
              <Button
                tone={tone}
                size={size}
                icon={ArrowRight}
                onClick={() => setCount(count + 1)}
              >
                {lang === "zh" ? "下一步" : "Next"}
              </Button>
              <Button tone={tone} size={size} disabled>
                {lang === "zh" ? "不可用" : "Disabled"}
              </Button>
              <Button tone={tone} size={size} busy>
                {lang === "zh" ? "正在保存" : "Saving"}
              </Button>
            </div>
          ))}
        </section>
      ))}
      <div className="ui-preview-row">
        <Button
          tone="icon"
          icon={Volume2}
          label={lang === "zh" ? "声音" : "Sound"}
          pressed={pressed}
          onClick={() => setPressed(!pressed)}
        />
        <Button
          tone="icon"
          icon={Volume2}
          label={lang === "zh" ? "不可用" : "Disabled"}
          disabled
        />
        <Button
          tone="icon"
          icon={Volume2}
          label={lang === "zh" ? "处理中" : "Working"}
          busy
        />
      </div>
      <Button block icon={ArrowRight} onClick={() => setCount(count + 1)}>
        {lang === "zh"
          ? "邀请今晚的所有朋友一起开始下一场游戏"
          : "Invite everyone at tonight’s table to start the next adventure together"}
      </Button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setCount(count + 1);
        }}
      >
        <Button type="submit">{lang === "zh" ? "提交" : "Submit"}</Button>
      </form>
      <output className="ui-preview-output">{count}</output>
    </div>
  );
}
