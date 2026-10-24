import type { RoomView } from "../../room/protocol";
import { getLang, setLang, t } from "../i18n";
import { prefs } from "../prefs";
import { setMuted } from "../sound";
import { getState, send, update } from "../store";
import { Btn, Sheet } from "./common";

/** Re-render everything after a language or preference change. */
export const refresh = () => update({});

export function LangToggle() {
  const lang = getLang();
  return (
    <div class="seg" role="group" aria-label={t("language")}>
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => {
            setLang(l);
            prefs.lang = l;
            if (getState().view) send({ t: "lang", lang: l });
            refresh();
          }}
        >
          {l === "zh" ? "中文" : "English"}
        </button>
      ))}
    </div>
  );
}

export function toggleMute() {
  prefs.muted = !prefs.muted;
  setMuted(prefs.muted);
  refresh();
}

export function setReduced(on: boolean) {
  prefs.reduced = on;
  document.documentElement.dataset.reduced = on ? "1" : "";
  refresh();
}

export function SettingsSheet({ v, onClose }: { v: RoomView | null; onClose: () => void }) {
  const g = v?.game;
  const mySeat = v?.you.seats[0];
  const myTeam = v && mySeat !== undefined ? v.teams.find((x) => x.seat === mySeat) : undefined;
  return (
    <Sheet title={t("menu")} onClose={onClose}>
      <div class="settings">
        <p>
          {t("language")} <LangToggle />
        </p>
        <label class="radio">
          <input type="checkbox" checked={!prefs.muted} onChange={toggleMute} />
          <span>
            <b>{t("sound")}</b>
            <small>{t("muteHint")}</small>
          </span>
        </label>
        <label class="radio">
          <input type="checkbox" checked={prefs.reduced} onChange={(e) => setReduced((e.target as HTMLInputElement).checked)} />
          <span>
            <b>{t("reduceMotion")}</b>
          </span>
        </label>
        {g && !g.s.over && myTeam && !v.settings.hotseat && (
          <label class="radio">
            <input type="checkbox" checked={myTeam.autoplay} onChange={(e) => send({ t: "autoplay", on: (e.target as HTMLInputElement).checked })} />
            <span>
              <b>{t("autoplay")}</b>
            </span>
          </label>
        )}
        {g && !g.s.over && v.you.host && (
          <div class="choices">
            <Btn onClick={() => send({ t: "pause", on: !g.paused })}>{g.paused ? t("resume") : t("pause")}</Btn>
            {!v.settings.hotseat && <Btn onClick={() => send({ t: "save" })}>{t("save")}</Btn>}
          </div>
        )}
        {getState().saved && <p class="saved">{t("savedAs", { code: getState().saved! })}</p>}
      </div>
    </Sheet>
  );
}
