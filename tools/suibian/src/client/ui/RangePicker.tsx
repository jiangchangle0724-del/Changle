// "How far": walk, drive or any distance, then the minutes. Used on the home page, by a host
// searching again, and by one person picking alone.
import { RANGES, RANGE_MODES, type RangeId, type RangeMode } from "../../engine";
import { t, tx, type Key } from "../i18n";

const MODES: [RangeMode, Key][] = [
  ["walk", "rangeWalk"],
  ["drive", "rangeDrive"],
  ["any", "rangeAny"],
];
/** Switching tabs keeps a middle distance rather than the extremes. */
const DEFAULT: Record<RangeMode, RangeId> = { walk: "walk15", drive: "drive15", any: "any" };

export function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  const mode = RANGES[value].mode;
  return (
    <div class="range">
      <div class="seg tabs" role="group" aria-label={t("range")}>
        {MODES.map(([m, label]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => m !== mode && onChange(DEFAULT[m])}>
            {t(label)}
          </button>
        ))}
      </div>
      {mode === "any" ? (
        <p class="muted small">{t("rangeAnyHint")}</p>
      ) : (
        <div class="minutes" role="group" aria-label={t(mode === "walk" ? "rangeWalk" : "rangeDrive")}>
          {RANGE_MODES[mode].map((r) => (
            <button key={r} type="button" aria-pressed={value === r} aria-label={tx(RANGES[r])} onClick={() => onChange(r)}>
              {t("minutesN", { n: RANGES[r].minutes ?? 0 })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
