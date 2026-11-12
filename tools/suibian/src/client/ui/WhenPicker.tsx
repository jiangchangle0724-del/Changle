// When to eat: now, the next lunch or dinner, or another day and time in the coming week (as far as
// Google has opening hours). Places are then checked against their hours at that time.
import { useState } from "preact/hooks";
import { PLANNED_FROM, mealSlots, planUntil, vancouverDay, vancouverMs, type Day } from "../../engine";
import { t, type Key } from "../i18n";
import { dayLabel, timeLabel } from "../when";

/** The times on offer for another day: every half hour from 7:00 to 23:30. */
const TIMES = Array.from({ length: 34 }, (_, i) => 7 * 60 + i * 30);
const same = (a: Day, b: Day) => a.y === b.y && a.m === b.m && a.d === b.d;

export function WhenPicker({ value, onChange }: { value: number | null; onChange: (at: number | null) => void }) {
  const now = Date.now();
  const slots = mealSlots(now);
  const [other, setOther] = useState(value !== null && !slots.some((s) => s.at === value));
  const days = Array.from({ length: 7 }, (_, k) => vancouverDay(now, k));
  const [day, setDay] = useState(() => Math.max(0, value ? days.findIndex((d) => same(d, vancouverDay(value))) : 0));
  // Times still ahead on that day, inside the week Google has hours for.
  const times = (k: number) => TIMES.map((m) => vancouverMs(days[k], m)).filter((at) => at - now >= 2 * PLANNED_FROM && at < planUntil(now));
  const pickDay = (k: number) => {
    setDay(k);
    const list = times(k);
    // Keep the same time of day when that day has it, else the first one it has.
    const keep = value ? list.find((at) => timeLabel(at) === timeLabel(value)) : undefined;
    onChange(keep ?? list[0] ?? null);
  };
  return (
    <div class="when">
      <div class="seg">
        <button type="button" aria-pressed={value === null && !other} onClick={() => (setOther(false), onChange(null))}>
          {t("whenNow")}
        </button>
        {slots.map((s) => (
          <button key={s.id} type="button" aria-pressed={!other && value === s.at} onClick={() => (setOther(false), onChange(s.at))}>
            {t(`when_${s.id}` as Key)}
          </button>
        ))}
        <button type="button" aria-pressed={other} onClick={() => (setOther(true), pickDay(day))}>
          {t("whenOther")}
        </button>
      </div>
      {other && (
        <div class="whenother">
          <label class="field">
            <span>{t("whenDay")}</span>
            <select value={day} onChange={(e) => pickDay(Number((e.target as HTMLSelectElement).value))}>
              {days.map((d, k) =>
                times(k).length ? (
                  <option key={k} value={k}>
                    {dayLabel(vancouverMs(d, 12 * 60), now)}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <label class="field">
            <span>{t("whenTime")}</span>
            <select value={value ?? ""} onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value))}>
              {times(day).map((at) => (
                <option key={at} value={at}>
                  {timeLabel(at)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
