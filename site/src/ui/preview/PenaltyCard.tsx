import { useState } from "react";
import type { Lang } from "../../i18n";
import { Button } from "../Button";
import { PenaltyCard } from "../PenaltyCard";
import type { PenaltyCall } from "../types";
export function PenaltyCardPreview({ lang }: { lang: Lang }) {
  const [call, setCall] = useState<PenaltyCall | null>(null);
  const [custom, setCustom] = useState(false);
  const [actions, setActions] = useState(false);
  const [done, setDone] = useState(0);
  const finish = () => {
    setCall(null);
    setDone((n) => n + 1);
  };
  return (
    <div className="ui-preview-section">
      <div className="ui-preview-row">
        {(["sip", "two", "full", "everyone", "safe"] as const).map((kind) => (
          <Button
            key={kind}
            tone="quiet"
            onClick={() => {
              setCustom(false);
              setActions(false);
              setCall({
                who: kind === "everyone" ? [] : ["Steve", "Ann"],
                kind,
                note: lang === "zh" ? "这一轮的结果" : "This round’s result",
              });
            }}
          >
            {kind}
          </Button>
        ))}
      </div>
      <Button
        tone="quiet"
        onClick={() => {
          setCustom(false);
          setActions(false);
          setCall({
            who: ["Ann"],
            kind: "sip",
            say: lang === "zh" ? "做十五个俯卧撑" : "Do fifteen push-ups",
            note:
              lang === "zh"
                ? "跟大家一起慢慢做。\n量力而行。\n准备好了再开始。\n完成后继续下一轮。"
                : "Take your time, make some room, and continue when you are ready.",
          });
        }}
      >
        {lang === "zh" ? "自定义惩罚" : "Custom penalty"}
      </Button>
      <Button
        tone="quiet"
        onClick={() => {
          setCustom(true);
          setActions(true);
          setCall({ who: [], kind: "full", times: 3 });
        }}
      >
        {lang === "zh"
          ? "房间惩罚 + 自定义动作"
          : "Room penalty + custom actions"}
      </Button>
      {(["sip", "two", "full", "everyone", "safe"] as const).map((kind) => (
        <PenaltyCard
          key={kind}
          lang={lang}
          presentation="card"
          call={{
            who: kind === "everyone" ? [] : ["Steve"],
            kind,
            note: lang === "zh" ? "这一轮已经结束" : "The round has ended",
          }}
          onDone={() => setDone((n) => n + 1)}
        />
      ))}
      <PenaltyCard
        lang={lang}
        presentation="card"
        call={{
          who: [
            lang === "zh"
              ? "今晚名字特别长的朋友"
              : "A friend with a very long name",
          ],
          kind: "two",
          say:
            lang === "zh"
              ? "给大家表演一个节目"
              : "Perform a little show for everyone at tonight’s table",
        }}
        actions={
          <Button tone="quiet" onClick={() => setDone((n) => n + 1)}>
            {lang === "zh" ? "完成了" : "Done"}
          </Button>
        }
        onDone={finish}
      />
      <PenaltyCard
        call={call}
        lang={lang}
        customText={
          custom
            ? lang === "zh"
              ? "表演一个节目"
              : "Perform a show"
            : undefined
        }
        actions={
          actions ? (
            <Button onClick={finish}>
              {lang === "zh" ? "我完成了" : "I did it"}
            </Button>
          ) : undefined
        }
        onDone={finish}
      />
      <output className="ui-preview-output">{done}</output>
    </div>
  );
}
