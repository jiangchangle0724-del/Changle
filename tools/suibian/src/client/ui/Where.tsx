// Where to start from (my location or an area) and how far: the home page and the solo picker.
import { useEffect, useState } from "preact/hooks";
import { NEIGHBOURHOODS, type Center, type RangeId } from "../../engine";
import { t, tx } from "../i18n";
import { prefs } from "../prefs";
import { RangePicker } from "./RangePicker";

const inVancouver = (c: Center) => c.lat > 48.9 && c.lat < 49.6 && c.lng > -123.6 && c.lng < -122.2;

export interface Where {
  hood: string;
  gps: Center | null;
  range: RangeId;
  setRange: (r: RangeId) => void;
  pick: (hood: string) => void;
  /** The starting point, or null while we're still waiting for GPS. */
  center: () => Center | null;
  /** True when GPS was chosen and we don't have a position yet. */
  waiting: boolean;
}

/** `say` shows a message where the page shows its errors ("" clears it). */
export function useWhere(say: (msg: string) => void): Where {
  const last = prefs.start;
  const [hood, setHood] = useState<string>(last?.center.label ?? (last ? "gps" : NEIGHBOURHOODS[0].en));
  // A saved GPS position is wherever the phone was last time: ask for a fresh one instead.
  const [gps, setGps] = useState<Center | null>(null);
  const [range, setRange] = useState<RangeId>(last?.range ?? "walk20");

  const locate = () => {
    if (!navigator.geolocation) return say(t("noLocation"));
    say(t("locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inVancouver(c)) {
          say(t("outsideVancouver"));
          setHood(NEIGHBOURHOODS[0].en);
          return;
        }
        say("");
        setGps(c);
        setHood("gps");
      },
      () => {
        say(t("noLocation"));
        setHood(NEIGHBOURHOODS[0].en);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };

  useEffect(() => {
    if (last && !last.center.label) locate();
  }, []);

  return {
    hood,
    gps,
    range,
    setRange,
    pick: (v) => {
      if (v === "gps" && !gps) locate();
      setHood(v);
    },
    center: () => {
      if (hood === "gps") return gps;
      const n = NEIGHBOURHOODS.find((x) => x.en === hood);
      return n ? { lat: n.lat, lng: n.lng, label: n.en } : null;
    },
    waiting: hood === "gps" && !gps,
  };
}

export function WhereFields({ w }: { w: Where }) {
  return (
    <>
      <label class="field">
        <span>{t("where")}</span>
        <select value={w.hood} onChange={(e) => w.pick((e.target as HTMLSelectElement).value)}>
          <option value="gps">{t("myLocation")}</option>
          {NEIGHBOURHOODS.map((n) => (
            <option key={n.en} value={n.en}>
              {tx(n)}
            </option>
          ))}
        </select>
      </label>
      <div class="field">
        <span>{t("range")}</span>
        <RangePicker value={w.range} onChange={w.setRange} />
      </div>
    </>
  );
}
