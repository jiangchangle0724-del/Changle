/**
 * How 额头便利贴 sounds and feels in the hand: the paper's own noises, made in the browser like the
 * rest of the party's sounds (lib/sfx.ts), and the buzzes that go with them.
 *
 * Buzzing: Android phones buzz to a pattern (lib/sfx.ts haptic). iPhones' browsers can't buzz at
 * all; the one tick they give is a switch being flicked, and only while a finger is on the screen,
 * so on an iPhone a tap on one of this game's buttons ticks (tick) and the rest stays silent.
 */
import { bus, burst, midiHz, note, tone } from "../../lib/audio/engine";
import { haptic } from "../../lib/sfx";

/** the happy scale every rising run here is drawn from: C major pentatonic from C5 */
const STEP = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export const paper = {
  /** A note peeled off: a dry rip that rises. */
  peel() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.2, attack: 0.012, type: "bandpass", f: 900, f2: 5200, q: 0.9, hp: 500, peak: 0.15, wet: 0.08 });
    burst(b, { at: 0.04, dur: 0.1, attack: 0.004, type: "highpass", f: 3600, q: 0.7, peak: 0.045, wet: 0.08 });
  },
  /** A note flicked away: a quick, falling swish. */
  flick() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.16, attack: 0.006, type: "bandpass", f: 3000, f2: 900, q: 0.8, peak: 0.12, wet: 0.1 });
  },
  /** A note pressed on: a soft thump with a crisp edge. */
  stick() {
    const b = bus();
    if (!b) return;
    tone(b, { f: 170, f2: 92, glide: 0.06, peak: 0.15, attack: 0.002, decay: 0.08, wet: 0.08 });
    burst(b, { dur: 0.012, decay: 0.028, f: 2600, q: 1.2, peak: 0.1, wet: 0.1 });
  },
  /** A note turned over to show what it says. */
  turn() {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.05, attack: 0.004, type: "bandpass", f: 2400, f2: 1400, q: 1, peak: 0.1, wet: 0.12 });
    tone(b, { at: 0.05, f: 210, f2: 140, glide: 0.04, peak: 0.07, attack: 0.002, decay: 0.05, wet: 0.1 });
  },
  /** One of the turn's notes landing on the wall: each a step up the scale. */
  land(step: number, soft = false) {
    const b = bus();
    if (!b) return;
    note(b, "marimba", { f: midiHz(72 + STEP[Math.max(0, Math.min(STEP.length - 1, step))]), peak: soft ? 0.07 : 0.13 });
  },
};

/** Buzz patterns, in milliseconds (on, off, on…). */
export const BUZZ = {
  tick: 8,
  count: 14,
  go: 40,
  ok: [14, 40, 22],
  pass: 18,
  last: 10,
  timeUp: [90, 70, 160],
  wrong: [30, 50, 30],
  turn: [12, 40, 12],
} as const;

const IOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent) && !("vibrate" in navigator);
let flicker: HTMLLabelElement | null = null;

/**
 * A buzz to the pattern where the phone can (Android). On an iPhone, the switch's own tick instead:
 * Safari ticks for a switch flicked while a finger is on the screen, and for nothing else, so there
 * it only answers taps (a nod or the clock stay silent in the hand).
 */
export function buzz(pattern: number | readonly number[]) {
  if (!IOS) return haptic(typeof pattern === "number" ? pattern : [...pattern]);
  try {
    if (!flicker) {
      flicker = document.createElement("label");
      flicker.setAttribute("aria-hidden", "true");
      flicker.className = "pi-flicker";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      flicker.append(input);
      document.body.append(flicker);
    }
    const was = document.activeElement as HTMLElement | null;
    flicker.click();
    // (the switch must not keep the focus: the keyboard, or the button, keep it)
    if (was && document.activeElement !== was) was.focus({ preventScroll: true });
  } catch {
    /* no tick on this phone */
  }
}

/** A light tick for a tap on one of the game's buttons. */
export const tick = () => buzz(BUZZ.tick);
