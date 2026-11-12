/**
 * Sound for a page a tap opens (Steve on Nov 11: the DJ booth's shared phone starts its music the
 * moment it's chosen on the game's card). An iPhone lets a page make sound only from inside a tap:
 * this one wakes a context in the tap, for the next page of the site to take (it stays one page).
 */
let primed: AudioContext | null = null;

/** Inside the tap: a context made and woken (as the DJ booth's speaker makes its own). */
export function primeAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let c: AudioContext;
    try {
      c = new AC({ sampleRate: 48000, latencyHint: "playback" });
    } catch {
      c = new AC();
    }
    void c.resume().catch(() => {});
    // a one-sample sound inside the tap wakes Safari's output
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start(0);
    primed?.close().catch(() => {});
    primed = c;
  } catch {
    primed = null;
  }
}

/** The context a tap woke, for the page that takes it (once; null: none). */
export function takePrimed(): AudioContext | null {
  const c = primed;
  primed = null;
  return c && c.state !== "closed" ? c : null;
}
