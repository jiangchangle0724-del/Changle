// The full screen button in the top bar, and on an iPhone how to play full screen (fullscreen.ts).
import { useEffect, useState } from "preact/hooks";
import { fullscreenOffer, isFullscreen, onFullscreenChange, toggleFullscreen } from "../fullscreen";
import { t } from "../i18n";
import { Sheet } from "./common";

/** What full screen can do here, kept up to date as it starts and ends. */
export function useFullscreen() {
  const [, tick] = useState(0);
  useEffect(() => onFullscreenChange(() => tick((n) => n + 1)), []);
  return { offer: fullscreenOffer(), on: isFullscreen() };
}

/** Corners pointing out (go full screen) or in (leave it). */
function FsIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d={on ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function FullscreenButton({ onGuide }: { onGuide: () => void }) {
  const { offer, on } = useFullscreen();
  if (!offer) return null;
  const label = offer === "iphone" ? t("fullscreenHow") : on ? t("fullscreenExit") : t("fullscreen");
  return (
    <button type="button" class="fs-btn" aria-label={label} title={label} onClick={() => (offer === "iphone" ? onGuide() : void toggleFullscreen())}>
      <FsIcon on={on} />
    </button>
  );
}

/** iPhone: add changle.ca to the Home Screen, and start from there. */
export function FullscreenGuide({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t("fullscreenIphoneTitle")} onClose={onClose}>
      <div class="fs-guide">
        <p>{t("fullscreenIphone")}</p>
        <ol>
          <li>{t("fullscreenStep1")}</li>
          <li>{t("fullscreenStep2")}</li>
          <li>{t("fullscreenStep3")}</li>
        </ol>
        <p class="muted">{t("fullscreenIphoneNote")}</p>
      </div>
    </Sheet>
  );
}
