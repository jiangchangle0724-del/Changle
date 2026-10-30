import { useEffect } from "react";
import { TopBar } from "../../components/TopBar";
import { GAME_BY_ID } from "../../games/registry";
import { useStore } from "../../store";
import { TRIP } from "./link";
import "../../styles/trip.css";

/** 到此一游 on one phone: the game's own one-phone page, passed round the table (computer teams fill in). */
export function TripSolo({ onBack }: { onBack: () => void }) {
  const { lang, sound } = useStore();
  useEffect(() => {
    try {
      localStorage.setItem("bt.lang", lang);
      localStorage.setItem("bt.muted", sound ? "0" : "1");
    } catch {
      // private mode: the game starts in its own defaults
    }
    window.location.assign(`${TRIP}/demo`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="screen">
      <TopBar title={GAME_BY_ID.trip.name} onBack={onBack} />
      <p className="hint" style={{ textAlign: "center", marginTop: 40 }}>
        {lang === "zh" ? "正在打开到此一游…" : "Opening Been There, Bought That…"}
      </p>
    </div>
  );
}
