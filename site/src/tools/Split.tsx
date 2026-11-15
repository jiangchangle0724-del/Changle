import { ReceiptText } from "lucide-react";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";

/**
 * 两清 · All Square lives at changle.ca/split: the site's own pages (src/split, its brief
 * docs/briefs/split.md), a group's bills on a trip, settled up in the fewest transfers. This card is
 * the way in; the router keeps it inside the page, so the language and the sign-in come along.
 */
export const SPLIT = "/split";
/** its card says 新 / New until this day: 30 days after it went on the tab (2026-11-15) */
const NEW_UNTIL = "2026-12-15";

/** The card in the Tools tab: a tool's tile, amber like every tool; the whole card opens 两清. */
export function Split() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool-split" id="tool-split" aria-label={zh ? "两清" : "All Square"}>
      <Tile
        name={{ zh: "两清", en: "All Square" }}
        lang={lang}
        icon={ReceiptText}
        category="tool"
        isNew={new Date().toISOString().slice(0, 10) < NEW_UNTIL}
        line={zh ? "一起出去玩，谁付的都记一笔，最后用最少几笔转账两清" : "Log who paid what on a trip, then settle up in the fewest transfers."}
        href={SPLIT}
        onOpen={() => {}}
      />
    </section>
  );
}
