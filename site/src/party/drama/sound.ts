/**
 * 戏精大赏's own sounds, synthesized like the rest of the party: a velvet curtain sweeping open,
 * the clapperboard, the "dun dun DUN" of a plot twist, the audience's gasp, a spotlight thunk and
 * the culprit's sting. The common ones (drum roll, applause, fanfare) come from lib/sfx.
 */
import { burst, bus, crash, duck, kick, midiHz, note, snare, tone } from "../../lib/audio/engine";
import { sfx } from "../../lib/sfx";

export const dramaSfx = {
  /** Heavy fabric sweeping across the stage, then settling. */
  curtain(open = true, vol = 1) {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 1.1, attack: 0.25, type: "lowpass", f: open ? 500 : 1400, f2: open ? 1600 : 380, q: 0.6, peak: 0.16 * vol, wet: 0.35 });
    burst(b, { at: 0.08, dur: 0.9, attack: 0.3, type: "bandpass", f: 2400, f2: 900, q: 0.8, peak: 0.035 * vol, wet: 0.4 });
    kick(b, { at: 1.05, peak: 0.22 * vol, tone: 0.6 });
  },

  /** The slate: "Action!" */
  clapper(vol = 1) {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.004, decay: 0.035, type: "highpass", f: 1800, q: 0.7, peak: 0.45 * vol, wet: 0.2 });
    tone(b, { f: 1300, f2: 300, glide: 0.04, peak: 0.12 * vol, attack: 0.001, decay: 0.05, wet: 0.15 });
  },

  /** The plot twist: three low brass hits, the last one held, under a timpani. */
  sting(vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, 2.2, 0.25);
    const hits = [
      { at: 0, m: 50, dur: 0.22 },
      { at: 0.3, m: 49, dur: 0.22 },
      { at: 0.62, m: 46, dur: 1.3 },
    ];
    for (const h of hits) {
      note(b, "brass", { f: midiHz(h.m), at: h.at, dur: h.dur, peak: 0.13 * vol });
      note(b, "brass", { f: midiHz(h.m - 12), at: h.at, dur: h.dur, peak: 0.1 * vol });
      kick(b, { at: h.at, peak: 0.5 * vol, tone: 0.5 });
    }
    crash(b, { at: 0.62, peak: 0.08 * vol, decay: 1.6 });
  },

  /** The room draws a breath: a rising "ooh" of many voices. */
  gasp(vol = 1) {
    const b = bus();
    if (!b) return;
    for (let i = 0; i < 6; i++) {
      const f = 380 + i * 55 + Math.random() * 40;
      burst(b, { at: i * 0.025, dur: 0.75, attack: 0.18, type: "bandpass", f, f2: f * 1.35, q: 9, peak: 0.05 * vol, wet: 0.45 });
    }
    burst(b, { dur: 0.5, attack: 0.08, type: "bandpass", f: 900, f2: 1300, q: 4, peak: 0.03 * vol, wet: 0.4 });
  },

  /** A big lamp switching on. */
  spotlight(vol = 1) {
    const b = bus();
    if (!b) return;
    burst(b, { dur: 0.006, decay: 0.06, type: "lowpass", f: 1200, q: 0.7, peak: 0.3 * vol, wet: 0.3 });
    tone(b, { f: 96, peak: 0.05 * vol, attack: 0.02, decay: 0.8, type: "sawtooth", wet: 0.2 });
  },

  /** The culprit is named: a minor stab and a gong-like hit. */
  culprit(caught: boolean, vol = 1) {
    const b = bus();
    if (!b) return;
    duck(b, 1.8);
    if (caught) {
      [55, 58, 62].forEach((m) => note(b, "brass", { f: midiHz(m), dur: 0.9, peak: 0.08 * vol }));
      kick(b, { peak: 0.8 * vol });
      snare(b, { peak: 0.3 * vol });
      crash(b, { peak: 0.16 * vol, decay: 1.4 });
    } else {
      // fooled them all: a sly descending figure
      [74, 71, 67, 63].forEach((m, i) => note(b, "pluck", { f: midiHz(m), at: i * 0.11, peak: 0.12 * vol }));
      note(b, "brass", { f: midiHz(51), at: 0.46, dur: 0.8, peak: 0.08 * vol });
    }
  },

  /** A card is dealt to an actor. */
  deal(vol = 1) {
    sfx.cardSlide();
    const b = bus();
    if (!b) return;
    tone(b, { at: 0.05, f: 660, f2: 880, glide: 0.06, peak: 0.04 * vol, attack: 0.002, decay: 0.12, wet: 0.3 });
  },

  /** One star lit on a ballot; higher stars ring higher. */
  star(n: number, vol = 1) {
    const b = bus();
    if (!b) return;
    note(b, "bell", { f: midiHz(72 + [0, 2, 4, 7, 9, 12][Math.max(0, Math.min(5, n))]), peak: 0.09 * vol });
  },

  /** Last seconds of a scene. */
  tick(last: boolean) {
    sfx.clock(last);
    if (last) sfx.heartbeat(0.6);
  },
};
