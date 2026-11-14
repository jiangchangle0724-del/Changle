import { Clock3, Coins, Scale, type LucideIcon } from "lucide-react";
import type { T } from "../i18n";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";
import { TOOLS, type ToolId } from "./ids";
import { Suibian } from "./Suibian";
import { When, WHEN_ON_TAB } from "./When";
// the tools' styles come with the tab, not with the home page
import "../styles/tools.css";
// a tool's page comes in the same file as the tab (one download for both, and none on the home page)
export { ToolPage } from "./ToolPage";

/** The tools that open on a page of their own: their cards say what they do in one line. */
const ON_A_PAGE: { id: ToolId; icon: LucideIcon; line: T }[] = [
  {
    id: "currency",
    icon: Coins,
    line: { zh: "加元、人民币、美元、港元，实时一起换算", en: "Dollars, yuan and more, converted together at live rates." },
  },
  {
    id: "clock",
    icon: Clock3,
    line: { zh: "各地现在几点，拖一下尺子一起变", en: "The time in every city. Slide the ruler and they all move." },
  },
  {
    id: "price",
    icon: Scale,
    line: { zh: "一斤一磅一公斤多少钱，两个包装哪个划算", en: "The price per kg, lb or jin, and which pack is the better buy." },
  },
];

/**
 * Everyday tools, each a card in a tool's amber: when to meet (约时间, at /when; its card follows
 * `WHEN_ON_TAB`), where to eat (随便, at /eat), and money, time across cities and price per unit,
 * which open on a page of their own (/tools/currency, /tools/clock, /tools/price; ToolPage.tsx).
 */
export function ToolsTab() {
  const { lang } = useStore();
  return (
    <div className="tools">
      {WHEN_ON_TAB && <When />}
      <Suibian />
      {ON_A_PAGE.map((t) => (
        <Tile key={t.id} name={TOOLS[t.id]} lang={lang} icon={t.icon} category="tool" line={t.line[lang]} href={`/tools/${t.id}`} onOpen={() => {}} />
      ))}
    </div>
  );
}
