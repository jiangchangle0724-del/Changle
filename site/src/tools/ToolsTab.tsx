import { Clock3, Coins, Scale, UtensilsCrossed } from "lucide-react";
import { reduced } from "../lib/motion";
import { useStore } from "../store";
import { Currency } from "./Currency";
import { useRates } from "./fx";
import { Suibian } from "./Suibian";
import { UnitPrice } from "./UnitPrice";
import { When, WHEN_ON_TAB } from "./When";
import { WorldClock } from "./WorldClock";
// the tools' styles come with the tab, not with the home page
import "../styles/tools.css";

/**
 * Everyday tools: when to meet (约时间, at /when; its card follows `WHEN_ON_TAB`), where to eat
 * (随便, at /eat), money, time across cities, price per unit. The buttons at the top jump to the
 * tools further down. 约时间 has none: its card is the first thing on the tab, a fifth button
 * doesn't fit on a phone, and 约时间 beside 时间 (the world clock) reads as the same thing twice.
 */
export function ToolsTab() {
  const { lang } = useStore();
  const fx = useRates();
  // the page glides to the tool, or jumps when the phone asks for less motion
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  return (
    <div className="tools">
      <nav className="tool-nav" aria-label={lang === "zh" ? "工具" : "Tools"}>
        <button type="button" className="chip chip-sm" onClick={() => jump("tool-eat")}>
          <UtensilsCrossed size={15} />
          {lang === "zh" ? "吃饭" : "Eat"}
        </button>
        <button type="button" className="chip chip-sm" onClick={() => jump("tool-fx")}>
          <Coins size={15} />
          {lang === "zh" ? "汇率" : "Currency"}
        </button>
        <button type="button" className="chip chip-sm" onClick={() => jump("tool-clock")}>
          <Clock3 size={15} />
          {lang === "zh" ? "时间" : "Time"}
        </button>
        <button type="button" className="chip chip-sm" onClick={() => jump("tool-price")}>
          <Scale size={15} />
          {lang === "zh" ? "单价" : "Price"}
        </button>
      </nav>
      {WHEN_ON_TAB && <When />}
      <Suibian />
      <Currency fx={fx} />
      <WorldClock />
      <UnitPrice fx={fx} />
    </div>
  );
}
