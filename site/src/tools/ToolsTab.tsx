import { Clock3, Coins, Scale } from "lucide-react";
import { useStore } from "../store";
import { Currency } from "./Currency";
import { useRates } from "./fx";
import { UnitPrice } from "./UnitPrice";
import { WorldClock } from "./WorldClock";

/** Everyday tools: money, time across cities, price per unit. */
export function ToolsTab() {
  const { lang } = useStore();
  const fx = useRates();
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="tools">
      <nav className="tool-nav" aria-label={lang === "zh" ? "工具" : "Tools"}>
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
      <Currency fx={fx} />
      <WorldClock />
      <UnitPrice fx={fx} />
    </div>
  );
}
