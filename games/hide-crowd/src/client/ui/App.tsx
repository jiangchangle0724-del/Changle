// The game's one page: which screen the address asks for, in which language, with or without motion.
import { useEffect, useState } from "preact/hooks";
import type { Lang } from "../../room/protocol";
import { routeOf } from "../base";
import { setLang } from "../i18n";
import { saveLang, savedLang, savedReduced, saveReduced } from "../prefs";
import { CreditsPage } from "./Credits";
import { HomePage } from "./Home";
import { PracticePage, RoomPage } from "./Room";

export function App() {
  const [route] = useState(() => routeOf(location.pathname));
  const [lang, setLangState] = useState<Lang>(savedLang());
  const [reduced, setReducedState] = useState(savedReduced());
  // the words follow the language at once (t() reads it), before anything below renders
  setLang(lang);

  useEffect(() => {
    document.documentElement.dataset.reduced = reduced === "on" ? "1" : reduced === "off" ? "0" : "";
  }, [reduced]);

  const pageProps = {
    lang,
    onLang: (value: Lang) => {
      saveLang(value);
      setLangState(value);
    },
    reduced: reduced === "on" || (reduced === "system" && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    onReduced: (on: boolean) => {
      const value = on ? "on" : "off";
      saveReduced(value);
      setReducedState(value);
    }
  };

  if (route.kind === "room") return <RoomPage {...pageProps} code={route.code} role={route.role} />;
  if (route.kind === "practice") return <PracticePage {...pageProps} />;
  if (route.kind === "credits") return <CreditsPage />;
  return <HomePage />;
}
