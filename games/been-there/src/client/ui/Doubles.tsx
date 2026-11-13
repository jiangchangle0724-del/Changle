// Doubles, called out as the dice settle, as the original game makes a moment of them: the two dice
// knock together and light up, and the call pops up over them. Three kinds: throw again; out of
// Immigration free (doubles there let a team out without the fee, and no second throw); and the third
// doubles in a row, which is speeding (off to Immigration), with the police lights at the screen's
// edges. Placed by the ride (ui/Ride.tsx), a phone's own throw without one, and the big screen's
// (ui/Moments.tsx); the timing lives in styles.css (.doubles-call, .police). With reduced motion the
// call simply shows and the lights don't flash.
import { t } from "../i18n";

export type DoublesKind = "again" | "out" | "speeding";

/** What a throw's doubles mean, or null if it wasn't doubles. */
export function doublesKind(roll: { doubles?: boolean; steps: number; jail?: boolean }): DoublesKind | null {
  if (!roll.doubles) return null;
  if (roll.jail) return "out";
  return roll.steps === 0 ? "speeding" : "again";
}

export function DoublesCall({ kind }: { kind: DoublesKind }) {
  return (
    <div class={`doubles-call dc-${kind}`} aria-hidden="true">
      <b>{t(kind === "speeding" ? "doublesThird" : "doubles")}</b>
      <small>{t(kind === "again" ? "doublesAgain" : kind === "out" ? "doublesOut" : "doublesJail")}</small>
    </div>
  );
}

/** The police lights: the screen's edges flash red and blue (less than twice a second, for 1.6 s),
 * from `at` seconds after they're drawn (as the third doubles settle). */
export const Police = ({ at = 1 }: { at?: number }) => (
  <div class="police on" style={{ "--police-at": `${at}s` }} aria-hidden="true">
    <i class="pl-red" />
    <i class="pl-blue" />
  </div>
);
