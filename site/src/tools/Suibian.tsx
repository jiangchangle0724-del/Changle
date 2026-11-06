import { UtensilsCrossed } from "lucide-react";
import { savedName } from "../online/config";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";

/**
 * 随便 · Whatever's Fine lives at changle.ca/eat, from its own code (tools/suibian in the changle-ca
 * repository): a group picks a restaurant together, each on their own phone. This card is the way in.
 * Same site, so it shares this phone's storage: the language, and the name if 随便 has none yet, go along.
 */
export const EAT = "/eat";
/** its card says 新 / New until this day, like the games that came with it */
const NEW_UNTIL = "2026-12-01";

function handOff(lang: "zh" | "en") {
  try {
    localStorage.setItem("sb.lang", lang);
    const name = savedName();
    if (name && !localStorage.getItem("sb.name")) localStorage.setItem("sb.name", name.slice(0, 16));
  } catch {
    // private mode: 随便 asks again
  }
}

/** The card in the Tools tab: a tool's tile, amber like every tool; the whole card opens 随便. */
export function Suibian() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool-eat" id="tool-eat" aria-label={zh ? "随便" : "Whatever's Fine"}>
      <Tile
        name={{ zh: "随便", en: "Whatever's Fine" }}
        lang={lang}
        icon={UtensilsCrossed}
        category="tool"
        isNew={new Date().toISOString().slice(0, 10) < NEW_UNTIL}
        line={zh ? "吃什么？随便。让大家的手机来定" : "Where should we eat? Whatever's fine. Let everyone's phones decide."}
        href={EAT}
        onOpen={() => handOff(lang)}
      />
    </section>
  );
}
