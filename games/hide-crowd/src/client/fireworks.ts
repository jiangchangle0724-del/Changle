// The night market's fireworks, shared by the picture (ui/market.ts) and the sound (sound.ts): when
// each rocket goes up after the crowd's moment begins, and where it bursts (scene units: across, how
// far back, how high), in which of the five colours. They go up from behind the stalls and burst over
// the middle of the crowd, a couple of heads up: from the game's high camera, higher bursts would
// sit on the stalls' roofs at the top of the screen (on a phone, a burst 6 up over the middle does).
export const FIREWORK_RISE_MS = 760;

export const FIREWORK_SHOTS: readonly { at: number; x: number; z: number; height: number; color: number }[] = [
  { at: 100, x: -5.0, z: 0.6, height: 4.6, color: 0 },
  { at: 640, x: 4.2, z: 1.4, height: 5.0, color: 1 },
  { at: 1_150, x: -0.8, z: 0.0, height: 5.3, color: 2 },
  { at: 1_700, x: 6.0, z: 0.4, height: 4.4, color: 3 },
  { at: 2_200, x: -3.4, z: 1.8, height: 4.8, color: 4 }
];
