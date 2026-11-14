import { Ticket } from "lucide-react";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";

/**
 * 玩什么 · What's On lives at changle.ca/go, from its own code (tools/events): what's on around
 * Greater Vancouver in the next two weeks, gathered every morning, one day at a time. This card is
 * the way in; the page opens in this tab's language and keeps it in step with the site.
 */
export const GO = "/go";
/** its card says 新 / New until this day: 30 days after it went on the tab (2026-11-14) */
const NEW_UNTIL = "2026-12-14";

/** The card in the Tools tab: a tool's tile, amber like every tool; the whole card opens 玩什么. */
export function WhatsOn() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool-go" id="tool-go" aria-label={zh ? "玩什么" : "What's On"}>
      <Tile
        name={{ zh: "玩什么", en: "What's On" }}
        lang={lang}
        icon={Ticket}
        category="tool"
        isNew={new Date().toISOString().slice(0, 10) < NEW_UNTIL}
        line={zh ? "大温这两周去哪玩，每天早上更新" : "What's on around Vancouver in the next two weeks, updated every morning."}
        // with the slash: changle.ca/go with a query string isn't routed to 玩什么's Worker, /go/?… is
        href={`${GO}/?lang=${lang}`}
        onOpen={() => {}}
      />
    </section>
  );
}
