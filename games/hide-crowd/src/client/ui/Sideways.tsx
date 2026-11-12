// The game is played sideways. A phone held upright is covered by one screen asking to turn it (the
// room stays connected underneath, so turning it back picks up where it was).
import { useEffect, useState } from "preact/hooks";
import { appleTouch, UPRIGHT } from "../device";
import { t } from "../i18n";

/** Is this a phone held upright? Follows the phone as it turns. */
export function useUpright(): boolean {
  const [upright, setUpright] = useState(() => typeof matchMedia === "function" && matchMedia(UPRIGHT).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(UPRIGHT);
    const update = () => setUpright(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return upright;
}

export function TurnSideways() {
  return (
    <div class="turn-layer" role="alertdialog" aria-modal="true" aria-labelledby="turn-title" aria-describedby="turn-body">
      <span class="turn-phone" aria-hidden="true">
        <span class="turn-screen" />
      </span>
      <h2 id="turn-title" class="turn-title">
        {t("turnTitle")}
      </h2>
      <p id="turn-body" class="turn-body">
        {t("turnBody")}
      </p>
      <p class="turn-lock">{t(appleTouch() ? "turnLockApple" : "turnLockOther")}</p>
    </div>
  );
}
