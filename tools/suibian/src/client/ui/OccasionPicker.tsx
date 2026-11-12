// What the meal is for: a date, colleagues, a birthday, just me… It moves places a little on the list.
import { OCCASIONS, OCCASION_IDS, type OccasionId } from "../../engine";
import { tx } from "../i18n";

export function OccasionPicker({ value, onChange }: { value: OccasionId; onChange: (o: OccasionId) => void }) {
  return (
    <div class="seg occasions">
      {OCCASION_IDS.map((o) => (
        <button key={o} type="button" data-occasion={o} aria-pressed={value === o} onClick={() => onChange(o)}>
          <span aria-hidden="true">{OCCASIONS[o].emoji}</span> {tx(OCCASIONS[o])}
        </button>
      ))}
    </div>
  );
}
