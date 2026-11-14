import { useEffect } from "react";
import { setLight } from "../lib/motion";
import { back, go, mark } from "../router";
import { useStore } from "../store";
import { GameHeader } from "../ui/GameHeader";
import "../ui/base.css";
import { Currency } from "./Currency";
import { useRates } from "./fx";
import { TOOLS, type ToolId } from "./ids";
import { UnitPrice } from "./UnitPrice";
import { WorldClock } from "./WorldClock";
// the tools' styles come with the page, not with the home page
import "../styles/tools.css";

/** ‹ goes back where you came from, or to the Tools tab when the page was opened from a link */
const leave = () => (mark()?.inSite ? back() : go({ kind: "home", tab: "tools" }, true));

/**
 * A tool on its page, opened from its card on the Tools tab (/tools/currency, /tools/clock,
 * /tools/price): the header names it, ‹ goes back, and the room takes a tool's amber light.
 */
export function ToolPage({ id }: { id: ToolId }) {
  const { lang } = useStore();
  useEffect(() => {
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--type-tool").trim();
    if (amber) setLight(amber);
  }, []);
  return (
    <div className="screen tool-page ui-category-tool">
      <GameHeader title={TOOLS[id]} lang={lang} onBack={leave} />
      {id === "currency" ? <CurrencyTool /> : id === "clock" ? <WorldClock /> : <PriceTool />}
    </div>
  );
}

// (the rates load only on the pages that use them)
function CurrencyTool() {
  return <Currency fx={useRates()} />;
}

function PriceTool() {
  return <UnitPrice fx={useRates()} />;
}
