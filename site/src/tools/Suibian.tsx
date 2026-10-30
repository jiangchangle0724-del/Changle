import { ArrowRight, UtensilsCrossed } from "lucide-react";
import { savedName } from "../online/config";
import { useStore } from "../store";

/**
 * 随便 · Whatever's Fine lives at changle.ca/eat, from its own code (tools/suibian in the changle-ca
 * repository): a group picks a restaurant together, each on their own phone. This card is the way in.
 * Same site, so it shares this phone's storage: the language, and the name if 随便 has none yet, go along.
 */
export const EAT = "/eat";

function handOff(lang: "zh" | "en") {
  try {
    localStorage.setItem("sb.lang", lang);
    const name = savedName();
    if (name && !localStorage.getItem("sb.name")) localStorage.setItem("sb.name", name.slice(0, 16));
  } catch {
    // private mode: 随便 asks again
  }
}

/** The card in the Tools tab: what it is, and one button that opens it. */
export function Suibian() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool tool-eat" id="tool-eat" aria-labelledby="eat-title">
      <header className="tool-head">
        <h2 id="eat-title" className="tool-title">
          <span>{zh ? "随便" : "Whatever's Fine"}</span>
          <small>{zh ? "Whatever's Fine" : "随便"}</small>
        </h2>
        <span className="tool-tag">{zh ? "新" : "New"}</span>
      </header>
      <p className="tool-blurb">{zh ? "吃什么？随便。让大家的手机来定" : "Where should we eat? Whatever's fine. Let everyone's phones decide."}</p>
      <div className="tool-actions">
        <a className="btn btn-primary btn-block" href={EAT} onClick={() => handOff(lang)}>
          <UtensilsCrossed size={20} strokeWidth={2} aria-hidden="true" />
          {zh ? "去选餐厅" : "Pick a restaurant"}
          <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
