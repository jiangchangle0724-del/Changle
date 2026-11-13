import { CalendarCheck } from "lucide-react";
import { savedName } from "../online/config";
import { useStore } from "../store";
import { Tile } from "../ui/Tile";

/**
 * 约时间 · When Works will live at changle.ca/when, from its own code (tools/when): friends tap the
 * times they are free, each on their own phone, and the page shows when everyone can make it. This
 * card is the way in. Same site, so it shares this phone's storage: the language, and the name if
 * 约时间 has none yet, go along.
 */
export const WHEN = "/when";
/**
 * Not on the tab yet: the tool isn't live (docs/briefs/when.md). Its card and its button at the top
 * come on together, ahead of 随便, once Steve has tried it with friends.
 */
export const WHEN_ON_TAB: boolean = false;
/** its card says 新 / New until this day; set it to 30 days after the card goes on the tab */
const NEW_UNTIL = "2027-01-01";

function handOff(lang: "zh" | "en") {
  try {
    localStorage.setItem("when.lang", lang);
    const name = savedName();
    if (name && !localStorage.getItem("when.name")) localStorage.setItem("when.name", name.slice(0, 16));
  } catch {
    // private mode: 约时间 asks again
  }
}

/** The card in the Tools tab: a tool's tile, amber like every tool; the whole card opens 约时间. */
export function When() {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <section className="tool-when" id="tool-when" aria-label={zh ? "约时间" : "When Works"}>
      <Tile
        name={{ zh: "约时间", en: "When Works" }}
        lang={lang}
        icon={CalendarCheck}
        category="tool"
        isNew={new Date().toISOString().slice(0, 10) < NEW_UNTIL}
        line={zh ? "哪天大家都有空？各点各的，一眼看出来" : "When is everyone free? Each taps their own times, and it shows."}
        href={WHEN}
        onOpen={() => handOff(lang)}
      />
    </section>
  );
}
