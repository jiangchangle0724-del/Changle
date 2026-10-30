/** Older call sites keep these names; the voices now come from the synthesized table in sfx.ts. */
import { haptic as vibrate, setSfxEnabled, sfx } from "./sfx";

export function setSoundEnabled(on: boolean) {
  setSfxEnabled(on);
}

/** The lazy Susan's bearing clicking past a dish. */
export function tick(strength = 1) {
  sfx.tick(strength);
}

/** Something settles or is revealed. */
export function chime() {
  sfx.settle();
}

/** The penalty stamp landing on the table. */
export function thud() {
  sfx.stamp();
}

/** Dice rattling in a bowl. */
export function rattle() {
  sfx.dice();
}

export const haptic = vibrate;
