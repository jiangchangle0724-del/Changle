import { useEffect } from "react";
import { TopBar } from "../../components/TopBar";
import { GAME_BY_ID } from "../../games/registry";
import { useStore } from "../../store";
import { HIDE, handOff } from "./link";
import "../../styles/hide.css";

/**
 * 藏在人群里 on one phone: the game's practice page, you against three computer rivals hidden in the
 * crowd (playing with friends needs a phone each, from a table).
 */
export function HideSolo({ onBack }: { onBack: () => void }) {
  const { lang, players } = useStore();
  useEffect(() => {
    handOff(players[0]?.name ?? "", lang);
    window.location.assign(`${HIDE}/practice`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="screen">
      <TopBar title={GAME_BY_ID.hide.name} onBack={onBack} />
      <p className="hint hide-opening">{lang === "zh" ? "正在打开练手场…" : "Opening the practice crowd…"}</p>
    </div>
  );
}
