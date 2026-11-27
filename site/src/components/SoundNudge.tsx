import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { Lang } from "../i18n";
import { onAudioState, soundBlocked, unlockAudio } from "../lib/sfx";

/**
 * Sound is on, but the browser won't play it until someone taps: a game opened on a phone that
 * hasn't been touched since, or one back from its lock screen or another app (Steve 2026-11-23:
 * a game started silent until a tap). Any tap anywhere brings it back (lib/audio/engine.ts listens
 * for one); this line says so, and its button is one.
 */
export function SoundNudge({ lang }: { lang: Lang }) {
  const blocked = useSyncExternalStore(onAudioState, soundBlocked, () => false);
  const zh = lang === "zh";
  if (!blocked) return null;
  return (
    <div className="net-banner sound-nudge" role="status">
      <VolumeX size={16} aria-hidden="true" />
      <span>{zh ? "声音还没出来：点一下屏幕就有" : "No sound yet: tap the screen"}</span>
      <button type="button" className="net-banner-btn" onClick={() => unlockAudio()}>
        <Volume2 size={14} aria-hidden="true" />
        {zh ? "打开声音" : "Sound on"}
      </button>
    </div>
  );
}
