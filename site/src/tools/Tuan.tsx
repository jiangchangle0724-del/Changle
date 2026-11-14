import { ShoppingBasket } from "lucide-react";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";

/**
 * 跟一单 · Count Me In lives at changle.ca/tuan, from its own code (tools/tuan): group buys from
 * Greater Vancouver's home kitchens, group-buy leaders and farms. A buyer orders from a merchant's
 * link without signing in and pays the merchant directly; its home page also leads merchants to
 * their group buys. This card is the way in. Same site, so it shares this phone's storage: the
 * language goes along.
 */
export const TUAN = "/tuan/";
/** its card says 新 / New until this day: 30 days after it went on the tab (2026-11-14) */
const NEW_UNTIL = "2026-12-14";

function handOff(lang: "zh" | "en") {
  try {
    localStorage.setItem("tuan.lang", lang);
  } catch {
    // private mode: 跟一单 goes by the phone
  }
}

/** The card in the Tools tab: a tool's tile, amber like every tool; the whole card opens 跟一单. */
export function Tuan() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool-tuan" id="tool-tuan" aria-label={zh ? "跟一单" : "Count Me In"}>
      <Tile
        name={{ zh: "跟一单", en: "Count Me In" }}
        lang={lang}
        icon={ShoppingBasket}
        category="tool"
        isNew={new Date().toISOString().slice(0, 10) < NEW_UNTIL}
        line={zh ? "团长开团，你跟一单。不用注册，钱直接付给商家" : "Join a group buy without signing up, and pay the merchant directly."}
        href={TUAN}
        onOpen={() => handOff(lang)}
      />
    </section>
  );
}
