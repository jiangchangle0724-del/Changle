import { useState } from "react";
import type { Lang } from "../../i18n";
import { Tabs } from "../Tabs";
export function TabsPreview({ lang }: { lang: Lang }) {
  const [value, setValue] = useState("games");
  const [segment, setSegment] = useState("all");
  const [minimal, setMinimal] = useState("a");
  const items = [
    {
      key: "games",
      label: lang === "zh" ? "游戏" : "Games",
      sub: lang === "zh" ? "今晚玩什么" : "Play tonight",
      badge: 17,
    },
    {
      key: "tools",
      label: lang === "zh" ? "工具" : "Tools",
      sub: lang === "zh" ? "生活小帮手" : "Everyday helpers",
      badge: 0,
    },
    {
      key: "wish",
      label: lang === "zh" ? "心愿单" : "Our very long wishlist",
      sub: "Wishlist",
    },
  ];
  return (
    <div className="ui-preview-section">
      <Tabs
        label={lang === "zh" ? "首页" : "Home"}
        items={items}
        value={value}
        onChange={setValue}
      />
      <p className="ui-preview-output">
        {items.find((item) => item.key === value)?.label}
      </p>
      <Tabs
        variant="segmented"
        label={lang === "zh" ? "游戏筛选" : "Game filter"}
        items={[
          { key: "all", label: lang === "zh" ? "全部" : "All" },
          { key: "drink", label: lang === "zh" ? "喝酒局" : "Drinking games" },
          { key: "brain", label: lang === "zh" ? "动脑" : "Brain games" },
        ]}
        value={segment}
        onChange={setSegment}
      />
      <p className="ui-preview-output">{segment}</p>
      <Tabs
        label={lang === "zh" ? "最简标签页" : "Minimal tabs"}
        items={[
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ]}
        value={minimal}
        onChange={setMinimal}
      />
    </div>
  );
}
