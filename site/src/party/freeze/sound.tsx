/**
 * Keeping this phone's sound alive through a round, and saying so when the page can't.
 *
 * An iPhone can leave the page's audio context saying "running" while it plays nothing: after
 * another app or the system made a sound (WebKit bug 283419), after another tab that had sound was
 * closed (276687), at times after coming back from the background (276016, 291892). No event reaches
 * the page. Stopping and starting the context cures it, so every round does that before its first
 * beat (the table's server leaves 1.8 s; the one-phone game does it inside the tap that starts the
 * music), and the 「没声音？」 tap does it again on demand. The shared engine (lib/audio/engine.ts)
 * does the same when the page comes back from being hidden.
 */
import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { audioRunning, bus, unlockAudio } from "../../lib/audio/engine";
import { setSoundEnabled } from "../../lib/sound";
import { sfx } from "../../lib/sfx";
import { useStore } from "../../store";

/**
 * Stop and start the context, if it runs. Settles when it runs again, or after `ms`: an iPhone may
 * never settle these promises (WebKit bug 281566). A context that isn't running is left to the
 * engine (it wakes on the next tap, or when the page is back).
 */
export function kickAudio(ms = 400): Promise<void> {
  const b = bus();
  if (!b || b.c.state !== "running" || document.visibilityState === "hidden") return Promise.resolve();
  const c = b.c;
  const cycle = c
    .suspend()
    .then(() => c.resume())
    .then(
      () => undefined,
      () => undefined,
    );
  return Promise.race([cycle, new Promise<void>((ok) => window.setTimeout(ok, ms))]);
}

/** Whether the sound runs, polled while `on`: false once it has been stopped for a second (a kick in progress doesn't count). */
export function useAudioAlive(on: boolean) {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    if (!on) return;
    let misses = 0;
    const id = window.setInterval(() => {
      misses = audioRunning() ? 0 : misses + 1;
      setAlive(misses < 2);
    }, 500);
    return () => {
      window.clearInterval(id);
      setAlive(true);
    };
  }, [on]);
  return on ? alive : true;
}

/**
 * One line about this phone's sound. With the phone's sound off in the settings: say so, with the
 * switch (the music is the game). While the music should play (`playing`): a quiet 「没声音？」, or
 * 「点一下，打开声音」 when the sound isn't running. The tap wakes the sound inside the gesture, stops
 * and starts it (`onRestart` brings the music back on the beat) and lists what the page can't see:
 * the silent switch, the volume keys, Bluetooth or mirroring taking the sound elsewhere.
 */
export function SoundLine({ playing, onRestart }: { playing: boolean; onRestart?: () => void }) {
  const { lang, sound, setSound } = useStore();
  const zh = lang === "zh";
  const alive = useAudioAlive(sound && playing);
  const [tips, setTips] = useState(false);
  useEffect(() => {
    if (!tips) return;
    const id = window.setTimeout(() => setTips(false), 9000);
    return () => window.clearTimeout(id);
  }, [tips]);

  if (!sound) {
    return (
      <div className="fz-sound">
        <p className="hint">{zh ? "这部手机在这里把声音关了，听不到音乐。" : "Sound is off on this phone here, so no music."}</p>
        <button
          type="button"
          className="link-btn is-loud"
          onClick={() => {
            setSound(true);
            setSoundEnabled(true);
            unlockAudio();
            window.setTimeout(() => sfx.clink(), 60);
            onRestart?.();
          }}
        >
          <Volume2 size={15} />
          {zh ? "打开声音" : "Turn the sound on"}
        </button>
      </div>
    );
  }
  if (!playing) return null;
  return (
    <div className="fz-sound">
      <button
        type="button"
        className={`link-btn ${alive ? "" : "is-loud"}`}
        onClick={() => {
          unlockAudio();
          setTips(true);
          onRestart?.();
        }}
      >
        <Volume2 size={15} />
        {alive ? (zh ? "没声音？" : "No sound?") : zh ? "点一下，打开声音" : "Tap for sound"}
      </button>
      {tips && (
        <p className="hint">
          {zh
            ? "声音重开了。还是没有的话：看看侧面的静音键，按音量键调大；连着蓝牙或投屏时，声音在那边。"
            : "Sound restarted. Still nothing? Check the silent switch on the side and press volume up. With Bluetooth or screen mirroring, the sound plays there."}
        </p>
      )}
    </div>
  );
}
