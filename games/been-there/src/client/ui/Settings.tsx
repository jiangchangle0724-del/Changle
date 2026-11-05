import { useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { BUZZ, allowShake, buzz, canBuzz, canShake } from "../controls";
import { BASE, backToTable, tableFrom } from "../base";
import { isIPhone, toggleFullscreen } from "../fullscreen";
import { getLang, setLang, t, type Key } from "../i18n";
import { MAP_SIZES, prefs } from "../prefs";
import { setMuted } from "../sound";
import { getState, send, update } from "../store";
import { setMapSize } from "./Board";
import { Btn, Sheet } from "./common";
import { Credits } from "./Credits";
import { FullscreenGuide, useFullscreen } from "./Fullscreen";

/**
 * 旁观（接电视）: this device becomes the room's big screen (the TV page: no team, no taps, the sound
 * on and the screen kept awake). From a team, it first says what that means for the team.
 */
export function WatchTv({ v, open, onOpen }: { v: RoomView; open: boolean; onOpen: () => void }) {
  const inTeam = v.you.seats.length > 0;
  // (inside the page rather than loading it again: the sound this device was allowed to play stays
  // allowed, so the big screen has sound from the start)
  const go = () => {
    history.pushState(null, "", `${BASE}/tv/${v.code}`);
    dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <div class="watch-tv">
      <p>
        <b>{t("watchTv")}</b>
        <small>{t("watchTvHint")}</small>
      </p>
      {inTeam && open && <p class="muted">{t("watchTvLeave")}</p>}
      <Btn kind="quiet" onClick={inTeam && !open ? onOpen : go}>
        📺 {t("watchTvGo")}
      </Btn>
    </div>
  );
}

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

/** 地图大小: small fits the whole board; medium and large draw it bigger and drag (ui/mapView.ts). */
function MapSizeSetting() {
  const size = prefs.mapSize;
  return (
    <div class="setting-row">
      <span>
        <b id="map-size-label">{t("mapSize")}</b>
        <small>{t("mapSizeHint")}</small>
      </span>
      <div class="seg" role="group" aria-labelledby="map-size-label">
        {MAP_SIZES.map((m) => (
          <button key={m} type="button" aria-pressed={size === m} onClick={() => setMapSize(m)}>
            {t(`map_${m}` as Key)}
          </button>
        ))}
      </div>
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
  const [credits, setCredits] = useState(false);
  const [guide, setGuide] = useState(false);
  const [watch, setWatch] = useState(false);
  const fs = useFullscreen();
  const table = v && !v.settings.hotseat ? tableFrom(v) : null;
  if (guide) return <FullscreenGuide onClose={() => setGuide(false)} />;
  if (credits)
    return (
      <Sheet title={t("credits")} onClose={onClose}>
        <div class="sheet-back">
          <Btn kind="quiet" onClick={() => setCredits(false)}>
            ← {t("back")}
          </Btn>
        </div>
        <Credits />
      </Sheet>
    );
  return (
    <Sheet title={t("menu")} onClose={onClose}>
      <div class="settings">
        <p>
          {t("language")} <LangToggle />
        </p>
        <MapSizeSetting />
        <label class="radio">
          <input type="checkbox" checked={!prefs.muted} onChange={toggleMute} />
          <span>
            <b>{t("sound")}</b>
            <small>{t("muteHint")}</small>
          </span>
        </label>
        {fs.offer === "toggle" && (
          <label class="radio">
            <input type="checkbox" checked={fs.on} onChange={() => void toggleFullscreen()} />
            <span>
              <b>{t("fullscreen")}</b>
            </span>
          </label>
        )}
        {fs.offer === "iphone" && (
          <Btn kind="quiet" onClick={() => setGuide(true)}>
            {t("fullscreenHow")} →
          </Btn>
        )}
        <label class="radio">
          <input type="checkbox" checked={prefs.reduced} onChange={(e) => setReduced((e.target as HTMLInputElement).checked)} />
          <span>
            <b>{t("reduceMotion")}</b>
          </span>
        </label>
        <label class={`radio${prefs.reduced ? " off" : ""}`}>
          <input
            type="checkbox"
            checked={prefs.ride && !prefs.reduced}
            disabled={prefs.reduced}
            onChange={(e) => {
              prefs.ride = (e.target as HTMLInputElement).checked;
              refresh();
            }}
          />
          <span>
            <b>{t("rideSetting")}</b>
            <small>{t("rideHint")}</small>
          </span>
        </label>
        {canBuzz && (
          <label class="radio">
            <input
              type="checkbox"
              checked={prefs.haptics}
              onChange={(e) => {
                prefs.haptics = (e.target as HTMLInputElement).checked;
                buzz(BUZZ.tap);
                refresh();
              }}
            />
            <span>
              <b>{t("vibration")}</b>
              <small>{t("vibrationHint")}</small>
            </span>
          </label>
        )}
        {!canBuzz && isIPhone() && (
          <div class="radio off">
            <span>
              <b>{t("vibration")}</b>
              <small>{t("vibrationIphone")}</small>
            </span>
          </div>
        )}
        {canShake && (
          <label class="radio">
            <input
              type="checkbox"
              checked={prefs.shake}
              onChange={(e) => {
                prefs.shake = (e.target as HTMLInputElement).checked;
                // On an iPhone the yes to motion has to come from this tap.
                if (prefs.shake) void allowShake().then(refresh);
                refresh();
              }}
            />
            <span>
              <b>{t("shakeSetting")}</b>
            </span>
          </label>
        )}
        <label class="radio">
          <input
            type="checkbox"
            checked={prefs.speed}
            onChange={(e) => {
              prefs.speed = (e.target as HTMLInputElement).checked;
              refresh();
            }}
          />
          <span>
            <b>{t("speedTest")}</b>
            <small>{t("speedHint")}</small>
          </span>
        </label>
        {v && !v.settings.hotseat && <WatchTv v={v} open={watch} onOpen={() => setWatch(true)} />}
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
        <Btn kind="quiet" onClick={() => setCredits(true)}>
          {t("credits")} →
        </Btn>
        {table && (
          <Btn kind="ghost" onClick={() => backToTable(table, { over: g?.s.over ? v?.code : undefined })}>
            {t("backToTable")}
          </Btn>
        )}
      </div>
    </Sheet>
  );
}
